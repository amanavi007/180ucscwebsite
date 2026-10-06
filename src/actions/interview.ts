"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import { emailApplicantInterviewCancelled, notifyInterviewExecs } from "@/lib/email/notify-interview";
import { getInterviewAdminSettings, getInterviewAvailability, getInterviewExecOptions, getInterviewSlots } from "@/lib/data/interview";
import { expandAvailabilityEntry, overlaps, type TimeBlockInput } from "@/lib/coffee-chat";
import {
  canAddToPanel,
  canRemoveFromPanel,
  generateInterviewSlots,
  isInterviewSwapEligible,
  parseInviteeList,
  type InterviewSlotAssignment,
} from "@/lib/interview";

export interface ActionResult {
  error?: string;
}

async function requireExec() {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) return { profile: null, error: "Only exec can do that." };
  return { profile, error: undefined };
}

function revalidateAdmin() {
  revalidatePath("/portal/admin/interviews");
  revalidatePath("/apply/interview");
}

export async function addInviteesAction(text: string): Promise<ActionResult & { addedCount?: number; errors?: string[] }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const { invitees, errors } = parseInviteeList(text);
  if (invitees.length === 0) return { error: errors[0] ?? "Paste at least one UCSC email.", errors };

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("interview_invitees")
    .select("email")
    .in(
      "email",
      invitees.map((i) => i.email),
    );
  if (existingError) return { error: existingError.message };
  const known = new Set((existing ?? []).map((e) => e.email));
  const fresh = invitees.filter((i) => !known.has(i.email));

  if (fresh.length > 0) {
    const { error: insertError } = await supabase.from("interview_invitees").insert(fresh);
    if (insertError) return { error: insertError.message };
  }

  await logAudit(profile.id, "interview.invitees_added", undefined, `${fresh.length} added`);
  revalidateAdmin();
  return { addedCount: fresh.length, errors };
}

/** Removes someone from the allowlist. Their existing booking (if any) is deliberately left alone. */
export async function removeInviteeAction(id: string): Promise<ActionResult & { hadActiveBooking?: boolean }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const supabase = await createClient();
  const { data: invitee } = await supabase.from("interview_invitees").select("email").eq("id", id).maybeSingle();
  const { data: active } = invitee
    ? await supabase
        .from("interview_bookings")
        .select("id")
        .eq("applicant_email", invitee.email)
        .eq("status", "confirmed")
        .maybeSingle()
    : { data: null };

  const { error: deleteError } = await supabase.from("interview_invitees").delete().eq("id", id);
  if (deleteError) return { error: deleteError.message };

  await logAudit(profile.id, "interview.invitee_removed", invitee?.email ?? null);
  revalidateAdmin();
  return { hadActiveBooking: !!active };
}

export async function addInterviewAvailabilityAction(
  dates: string[],
  blocks: TimeBlockInput[],
): Promise<ActionResult & { addedCount?: number; createdCount?: number; generateError?: string }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const expanded = expandAvailabilityEntry(dates, blocks);
  if ("error" in expanded) return { error: expanded.error };

  const supabase = await createClient();
  const { error: insertError } = await supabase.from("interview_availability").insert(
    expanded.rows.map((row) => ({
      exec_id: profile.id,
      date: row.date,
      start_time: row.startTime,
      end_time: row.endTime,
    })),
  );
  if (insertError) return { error: insertError.message };

  // Slots are regenerated automatically; a failure here shouldn't hide that the availability was saved.
  const generated = await generateMissingInterviewSlots(profile.id);

  revalidateAdmin();
  return { addedCount: expanded.rows.length, createdCount: generated.createdCount, generateError: generated.error };
}

/** Removes a free block, plus any not-yet-booked slot that exec was on during it, then regenerates so the rest of that panel can re-pair. */
export async function removeInterviewAvailabilityAction(
  id: string,
): Promise<ActionResult & { removedSlotCount?: number; keptBookedCount?: number; createdCount?: number; generateError?: string }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const supabase = await createClient();
  const { data: block } = await supabase
    .from("interview_availability")
    .select("exec_id, date, start_time, end_time")
    .eq("id", id)
    .maybeSingle();

  const { error: deleteError } = await supabase.from("interview_availability").delete().eq("id", id);
  if (deleteError) return { error: deleteError.message };

  let removedSlotCount = 0;
  let keptBookedCount = 0;
  if (block) {
    const slots = await getInterviewSlots();
    const affected = slots.filter(
      (s) =>
        s.date === block.date &&
        s.execs.some((e) => e.id === block.exec_id) &&
        overlaps(s.startTime, s.endTime, block.start_time.slice(0, 5), block.end_time.slice(0, 5)),
    );
    const deletable = affected.filter((s) => s.bookingStatus === "open").map((s) => s.id);
    keptBookedCount = affected.length - deletable.length;
    if (deletable.length > 0) {
      const { error: slotDeleteError } = await supabase.from("interview_slots").delete().in("id", deletable);
      if (slotDeleteError) return { error: slotDeleteError.message };
      removedSlotCount = deletable.length;
    }
  }

  // The other execs from a removed slot may now pair with someone else who is free.
  const generated = await generateMissingInterviewSlots(profile.id);

  revalidateAdmin();
  return { removedSlotCount, keptBookedCount, createdCount: generated.createdCount, generateError: generated.error };
}

/** Creates published slots for availability not already covered. Existing slots are never touched, so it is safe to re-run. */
async function generateMissingInterviewSlots(execId: string): Promise<ActionResult & { createdCount?: number }> {
  const [availability, existing, settings] = await Promise.all([
    getInterviewAvailability(),
    getInterviewSlots(),
    getInterviewAdminSettings(),
  ]);

  const assignments: InterviewSlotAssignment[] = existing.map((s) => ({
    slotId: s.id,
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    execIds: s.execs.map((e) => e.id),
  }));
  const generated = generateInterviewSlots(
    availability.map((a) => ({ execId: a.execId, date: a.date, startTime: a.startTime, endTime: a.endTime })),
    assignments,
    settings.slotMinutes,
  );

  if (generated.length > 0) {
    const supabase = await createClient();
    const withIds = generated.map((g) => ({ ...g, id: randomUUID() }));
    const { error: slotError } = await supabase.from("interview_slots").insert(
      withIds.map((g) => ({ id: g.id, date: g.date, start_time: g.startTime, end_time: g.endTime, published: true })),
    );
    if (slotError) return { error: slotError.message };
    const { error: linkError } = await supabase
      .from("interview_slot_execs")
      .insert(withIds.flatMap((g) => g.execIds.map((execId) => ({ slot_id: g.id, exec_id: execId }))));
    if (linkError) {
      // Don't leave staffless slots behind.
      await supabase.from("interview_slots").delete().in("id", withIds.map((g) => g.id));
      return { error: linkError.message };
    }
  }

  await logAudit(execId, "interview.slots_generated", undefined, `${generated.length} slot(s) created`);
  return { createdCount: generated.length };
}

export async function generateInterviewSlotsAction(): Promise<ActionResult & { createdCount?: number }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const result = await generateMissingInterviewSlots(profile.id);
  if (!result.error) revalidateAdmin();
  return result;
}

/** An exec assigned to an already-booked slot should get the booking email (with calendar links) like the original panel did. */
async function notifyNewlyAssignedExec(slotId: string, execId: string) {
  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("interview_bookings")
    .select("id")
    .eq("slot_id", slotId)
    .eq("status", "confirmed")
    .maybeSingle();
  if (booking) await notifyInterviewExecs(booking.id, "booked", [execId]);
}

async function loadAssignments(): Promise<InterviewSlotAssignment[]> {
  const slots = await getInterviewSlots();
  return slots.map((s) => ({
    slotId: s.id,
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    execIds: s.execs.map((e) => e.id),
  }));
}

export async function swapInterviewExecAction(slotId: string, oldExecId: string, newExecId: string): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const all = await loadAssignments();
  const target = all.find((s) => s.slotId === slotId);
  if (!target || !target.execIds.includes(oldExecId)) return { error: "Slot not found." };
  if (!isInterviewSwapEligible(target, newExecId, all)) {
    return { error: "That exec is already on this slot or is assigned to an overlapping slot." };
  }

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("interview_slot_execs")
    .update({ exec_id: newExecId })
    .eq("slot_id", slotId)
    .eq("exec_id", oldExecId);
  if (updateError) return { error: updateError.message };

  await notifyNewlyAssignedExec(slotId, newExecId);
  revalidateAdmin();
  return {};
}

export async function addExecToInterviewSlotAction(slotId: string, execId: string): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const all = await loadAssignments();
  const target = all.find((s) => s.slotId === slotId);
  if (!target) return { error: "Slot not found." };
  if (!canAddToPanel(target.execIds.length)) return { error: "A panel can have at most 3 execs." };
  if (!isInterviewSwapEligible(target, execId, all)) {
    return { error: "That exec is already on this slot or is assigned to an overlapping slot." };
  }

  const supabase = await createClient();
  const { error: insertError } = await supabase.from("interview_slot_execs").insert({ slot_id: slotId, exec_id: execId });
  if (insertError) return { error: insertError.message };

  await notifyNewlyAssignedExec(slotId, execId);
  revalidateAdmin();
  return {};
}

export async function removeExecFromInterviewSlotAction(slotId: string, execId: string): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const all = await loadAssignments();
  const target = all.find((s) => s.slotId === slotId);
  if (!target || !target.execIds.includes(execId)) return { error: "Slot not found." };
  if (!canRemoveFromPanel(target.execIds.length)) return { error: "A panel needs at least 2 execs. Swap instead, or delete the slot." };

  const supabase = await createClient();
  const { error: deleteError } = await supabase.from("interview_slot_execs").delete().eq("slot_id", slotId).eq("exec_id", execId);
  if (deleteError) return { error: deleteError.message };

  revalidateAdmin();
  return {};
}

export async function publishInterviewSlotAction(slotId: string, published: boolean): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  const { error: updateError } = await supabase.from("interview_slots").update({ published }).eq("id", slotId);
  if (updateError) return { error: updateError.message };

  revalidateAdmin();
  return {};
}

export async function publishAllInterviewSlotsAction(): Promise<ActionResult & { publishedCount?: number }> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  const { data, error: updateError } = await supabase
    .from("interview_slots")
    .update({ published: true })
    .eq("published", false)
    .select("id");
  if (updateError) return { error: updateError.message };

  revalidateAdmin();
  return { publishedCount: data?.length ?? 0 };
}

export async function deleteInterviewSlotAction(slotId: string): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  // The bookings FK cascades, so deleting a booked slot would silently wipe the applicant's booking.
  const { data: active } = await supabase
    .from("interview_bookings")
    .select("id")
    .eq("slot_id", slotId)
    .eq("status", "confirmed")
    .maybeSingle();
  if (active) return { error: "That slot has a confirmed booking. Cancel the booking first." };

  const { error: deleteError } = await supabase.from("interview_slots").delete().eq("id", slotId);
  if (deleteError) return { error: deleteError.message };

  revalidateAdmin();
  return {};
}

/** Cancels a booking for the applicant: execs are notified, and so is the applicant. */
export async function cancelInterviewBookingAsAdminAction(bookingId: string): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const supabase = await createClient();
  const { data: cancelled, error: updateError } = await supabase
    .from("interview_bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", bookingId)
    .eq("status", "confirmed")
    .select("id");
  if (updateError) return { error: updateError.message };

  if ((cancelled ?? []).length > 0) {
    await Promise.all([notifyInterviewExecs(bookingId, "cancelled"), emailApplicantInterviewCancelled(bookingId)]);
  }

  await logAudit(profile.id, "interview.booking_cancelled_by_admin", undefined, bookingId);
  revalidateAdmin();
  return {};
}

export async function getInterviewExecOptionsAction(date: string, startTime: string, endTime: string) {
  const { error } = await requireExec();
  if (error) return { error, options: null };
  return { error: undefined, options: await getInterviewExecOptions(date, startTime, endTime) };
}

export async function setInterviewBookingOpenAction(open: boolean): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("org_settings")
    .upsert({ key: "interview_booking_open", value: open ? "true" : "false" }, { onConflict: "key" });
  if (updateError) return { error: updateError.message };

  await logAudit(profile.id, "interview.booking_toggled", undefined, open ? "opened" : "closed");
  revalidateAdmin();
  return {};
}
