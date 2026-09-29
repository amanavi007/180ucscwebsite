"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import { getAllAvailability, getAllSlots, getExecOptionsForSlot } from "@/lib/data/coffee-chat";
import {
  DEFAULT_CHUNK_MINUTES,
  expandAvailabilityEntry,
  generateSlots,
  isSwapEligible,
  overlaps,
  type AvailabilityBlock,
  type ExistingSlotAssignment,
  type TimeBlockInput,
} from "@/lib/coffee-chat";

export interface ActionResult {
  error?: string;
}

async function requireExec() {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) return { profile: null, error: "Only exec can do that." };
  return { profile, error: undefined };
}

function revalidateAdmin() {
  revalidatePath("/portal/admin/coffee-chats");
  revalidatePath("/apply/coffee-chat");
}

/** Adds availability for several days and several time blocks in one go (one row per day and block). */
export async function addAvailabilityEntryAction(
  dates: string[],
  blocks: TimeBlockInput[],
): Promise<ActionResult & { addedCount?: number; createdCount?: number; generateError?: string }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const expanded = expandAvailabilityEntry(dates, blocks);
  if ("error" in expanded) return { error: expanded.error };

  const supabase = await createClient();
  const { error: insertError } = await supabase.from("coffee_chat_availability").insert(
    expanded.rows.map((row) => ({
      exec_id: profile.id,
      date: row.date,
      start_time: row.startTime,
      end_time: row.endTime,
    })),
  );
  if (insertError) return { error: insertError.message };

  // Slots are regenerated automatically; a failure here shouldn't hide that the availability was saved.
  const generated = await generateMissingSlots(profile.id);

  revalidateAdmin();
  return { addedCount: expanded.rows.length, createdCount: generated.createdCount, generateError: generated.error };
}

export async function removeAvailabilityBlockAction(
  id: string,
): Promise<ActionResult & { removedSlotCount?: number; keptBookedCount?: number }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const supabase = await createClient();
  const { data: block } = await supabase
    .from("coffee_chat_availability")
    .select("exec_id, date, start_time, end_time")
    .eq("id", id)
    .maybeSingle();

  const { error: deleteError } = await supabase.from("coffee_chat_availability").delete().eq("id", id);
  if (deleteError) return { error: deleteError.message };

  // Slots that relied on the removed time go too, unless an applicant has already booked them.
  let removedSlotCount = 0;
  let keptBookedCount = 0;
  if (block) {
    const { data: candidates } = await supabase
      .from("coffee_chat_slots")
      .select("id, start_time, end_time")
      .eq("date", block.date)
      .or(`exec_id_1.eq.${block.exec_id},exec_id_2.eq.${block.exec_id}`);
    const affected = (candidates ?? []).filter((s) =>
      overlaps(s.start_time, s.end_time, block.start_time, block.end_time),
    );

    if (affected.length > 0) {
      const { data: bookings } = await supabase
        .from("coffee_chat_bookings")
        .select("slot_id")
        .eq("status", "confirmed")
        .in("slot_id", affected.map((s) => s.id));
      const bookedIds = new Set((bookings ?? []).map((b) => b.slot_id));
      const deletableIds = affected.filter((s) => !bookedIds.has(s.id)).map((s) => s.id);
      keptBookedCount = affected.length - deletableIds.length;

      if (deletableIds.length > 0) {
        const { error: slotDeleteError } = await supabase.from("coffee_chat_slots").delete().in("id", deletableIds);
        if (slotDeleteError) return { error: slotDeleteError.message };
        removedSlotCount = deletableIds.length;
      }
    }
  }

  // The other exec from a removed slot may now pair with someone else who is free.
  await generateMissingSlots(profile.id);

  revalidateAdmin();
  return { removedSlotCount, keptBookedCount };
}

/** Fills in slots for any availability not yet covered; safe to re-run since existing slots are never touched. */
async function generateMissingSlots(execId: string): Promise<ActionResult & { createdCount?: number }> {
  const supabase = await createClient();
  const [availabilityRows, existingSlots] = await Promise.all([getAllAvailability(), getAllSlots()]);

  const availability: AvailabilityBlock[] = availabilityRows.map((a) => ({
    execId: a.execId,
    date: a.date,
    startTime: a.startTime,
    endTime: a.endTime,
  }));

  // Existing slots (booked or not, including manual swaps) are never touched;
  // generation only adds slots for execs not already assigned at an
  // overlapping time, so re-running it can't double-book anyone.
  const existingAssignments: ExistingSlotAssignment[] = existingSlots.map((s) => ({
    slotId: s.id,
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    execId1: s.execId1,
    execId2: s.execId2,
  }));
  const generated = generateSlots(availability, DEFAULT_CHUNK_MINUTES, existingAssignments);

  const { data: locationSetting } = await supabase
    .from("org_settings")
    .select("value")
    .eq("key", "coffee_chat_default_location")
    .maybeSingle();
  const defaultLocation = locationSetting?.value ?? "";

  const toInsert = generated.map((g) => ({
    date: g.date,
    start_time: g.startTime,
    end_time: g.endTime,
    location: defaultLocation,
    exec_id_1: g.execId1,
    exec_id_2: g.execId2,
    published: true,
  }));

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase.from("coffee_chat_slots").insert(toInsert);
    if (insertError) return { error: insertError.message };
  }

  await logAudit(execId, "coffee_chat.slots_generated", undefined, `${toInsert.length} slot(s) created`);
  return { createdCount: toInsert.length };
}

export async function generateSlotsAction(): Promise<ActionResult & { createdCount?: number }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const result = await generateMissingSlots(profile.id);
  if (!result.error) revalidateAdmin();
  return result;
}

export async function swapSlotExecAction(
  slotId: string,
  position: "exec_id_1" | "exec_id_2",
  newExecId: string,
): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  const [{ data: slot, error: slotError }, availabilityRows, allSlots] = await Promise.all([
    supabase.from("coffee_chat_slots").select("id, date, start_time, end_time, exec_id_1, exec_id_2").eq("id", slotId).single(),
    getAllAvailability(),
    getAllSlots(),
  ]);
  if (slotError || !slot) return { error: "Slot not found." };

  const target: ExistingSlotAssignment = {
    slotId: slot.id,
    date: slot.date,
    startTime: slot.start_time,
    endTime: slot.end_time,
    execId1: slot.exec_id_1,
    execId2: slot.exec_id_2,
  };
  const allAssignments: ExistingSlotAssignment[] = allSlots.map((s) => ({
    slotId: s.id,
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    execId1: s.execId1,
    execId2: s.execId2,
  }));
  const availability: AvailabilityBlock[] = availabilityRows.map((a) => ({
    execId: a.execId,
    date: a.date,
    startTime: a.startTime,
    endTime: a.endTime,
  }));

  if (!isSwapEligible(target, newExecId, availability, allAssignments)) {
    return { error: "That exec isn't free at this time, or is already assigned to an overlapping slot." };
  }

  const { error: updateError } = await supabase
    .from("coffee_chat_slots")
    .update(position === "exec_id_1" ? { exec_id_1: newExecId } : { exec_id_2: newExecId })
    .eq("id", slotId);
  if (updateError) return { error: updateError.message };

  revalidateAdmin();
  return {};
}

export async function publishSlotAction(slotId: string, published: boolean): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  const { error: updateError } = await supabase.from("coffee_chat_slots").update({ published }).eq("id", slotId);
  if (updateError) return { error: updateError.message };

  revalidateAdmin();
  revalidatePath("/apply/coffee-chat");
  return {};
}

/** Publishes every unpublished slot in one go. */
export async function publishAllSlotsAction(): Promise<ActionResult & { publishedCount?: number }> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  const { data, error: updateError } = await supabase
    .from("coffee_chat_slots")
    .update({ published: true })
    .eq("published", false)
    .select("id");
  if (updateError) return { error: updateError.message };

  revalidateAdmin();
  return { publishedCount: data?.length ?? 0 };
}

export async function deleteSlotAction(slotId: string): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  // The bookings FK cascades, so deleting a booked slot would silently wipe the applicant's booking.
  const { data: activeBooking } = await supabase
    .from("coffee_chat_bookings")
    .select("id")
    .eq("slot_id", slotId)
    .eq("status", "confirmed")
    .maybeSingle();
  if (activeBooking) return { error: "That slot has a confirmed booking. Cancel the booking first." };

  const { error: deleteError } = await supabase.from("coffee_chat_slots").delete().eq("id", slotId);
  if (deleteError) return { error: deleteError.message };

  revalidateAdmin();
  revalidatePath("/apply/coffee-chat");
  return {};
}

export async function cancelBookingAsAdminAction(bookingId: string): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("coffee_chat_bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", bookingId);
  if (updateError) return { error: updateError.message };

  await logAudit(profile.id, "coffee_chat.booking_cancelled_by_admin", undefined, bookingId);
  revalidateAdmin();
  revalidatePath("/apply/coffee-chat");
  return {};
}

/** Exec-only lookup of swap candidates for a given slot window, called from the client. */
export async function getExecOptionsForSlotAction(date: string, startTime: string, endTime: string) {
  const { error } = await requireExec();
  if (error) return { error, options: [] as { id: string; name: string }[] };
  const options = await getExecOptionsForSlot(date, startTime, endTime);
  return { error: undefined, options };
}
