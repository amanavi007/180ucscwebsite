"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isElevatedOrAbove, isExec } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import {
  emailClientMeetingCancelled,
  emailClientMeetingLink,
  notifyClientMeetingExecs,
} from "@/lib/email/notify-client-meeting";
import {
  getClientMeetingAvailability,
  getClientMeetingExecOptions,
  getClientMeetingSettings,
  getClientMeetingSlots,
} from "@/lib/data/client-meeting";
import { expandAvailabilityEntry, overlaps, type TimeBlockInput } from "@/lib/coffee-chat";
import {
  PANEL_SIZE,
  generateClientMeetingSlots,
  validateMeetingUrl,
} from "@/lib/client-meeting";

export interface ActionResult {
  error?: string;
}

async function requireExec() {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) return { profile: null, error: "Only exec can do that." };
  return { profile, error: undefined };
}

function revalidateAdmin() {
  revalidatePath("/portal/admin/client-meetings");
  revalidatePath("/services/book");
}

export async function setClientMeetingPanelAction(execIds: string[]): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  const ids = [...new Set(execIds)];
  if (ids.length !== PANEL_SIZE) return { error: "Pick exactly 3 execs." };
  const options = await getClientMeetingExecOptions();
  if (!ids.every((id) => options.some((o) => o.id === id))) return { error: "Panel members must be execs." };
  const supabase = await createClient();
  const { error: upsertError } = await supabase
    .from("org_settings")
    .upsert({ key: "client_meeting_panel", value: JSON.stringify(ids) }, { onConflict: "key" });
  if (upsertError) return { error: upsertError.message };
  await logAudit(profile.id, "client_meeting.panel_set", undefined, ids.join(","));
  revalidateAdmin();
  return {};
}

export async function setClientMeetingBookingOpenAction(open: boolean): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("org_settings")
    .upsert({ key: "client_meeting_booking_open", value: open ? "true" : "false" }, { onConflict: "key" });
  if (updateError) return { error: updateError.message };

  await logAudit(profile.id, "client_meeting.booking_toggled", undefined, open ? "opened" : "closed");
  revalidateAdmin();
  return {};
}

export async function addClientMeetingAvailabilityAction(
  dates: string[],
  blocks: TimeBlockInput[],
): Promise<ActionResult & { addedCount?: number }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const settings = await getClientMeetingSettings();
  if (!settings.panelExecIds.includes(profile.id)) {
    return { error: "Only panel members can add availability." };
  }

  const expanded = expandAvailabilityEntry(dates, blocks);
  if ("error" in expanded) return { error: expanded.error };

  const supabase = await createClient();
  const { error: insertError } = await supabase.from("client_meeting_availability").insert(
    expanded.rows.map((row) => ({
      exec_id: profile.id,
      date: row.date,
      start_time: row.startTime,
      end_time: row.endTime,
    })),
  );
  if (insertError) return { error: insertError.message };

  revalidateAdmin();
  return { addedCount: expanded.rows.length };
}

/** Removes a free block, plus any open (unbooked) slot overlapping it. Booked slots are kept; admin regenerates afterwards. */
export async function removeClientMeetingAvailabilityAction(
  id: string,
): Promise<ActionResult & { removedSlotCount?: number; keptBookedCount?: number }> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  const { data: block } = await supabase
    .from("client_meeting_availability")
    .select("exec_id, date, start_time, end_time")
    .eq("id", id)
    .maybeSingle();

  const { error: deleteError } = await supabase.from("client_meeting_availability").delete().eq("id", id);
  if (deleteError) return { error: deleteError.message };

  let removedSlotCount = 0;
  let keptBookedCount = 0;
  if (block) {
    const slots = await getClientMeetingSlots();
    const affected = slots.filter(
      (s) =>
        s.date === block.date &&
        overlaps(s.startTime, s.endTime, block.start_time.slice(0, 5), block.end_time.slice(0, 5)),
    );
    const deletable = affected.filter((s) => s.bookingStatus === "open").map((s) => s.id);
    keptBookedCount = affected.length - deletable.length;
    if (deletable.length > 0) {
      const { error: slotDeleteError } = await supabase.from("client_meeting_slots").delete().in("id", deletable);
      if (slotDeleteError) return { error: slotDeleteError.message };
      removedSlotCount = deletable.length;
    }
  }

  revalidateAdmin();
  return { removedSlotCount, keptBookedCount };
}

/** Creates unpublished slots where all 3 panel execs are free. Existing slots are never touched. */
export async function generateClientMeetingSlotsAction(): Promise<ActionResult & { createdCount?: number }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const settings = await getClientMeetingSettings();
  if (settings.panelExecIds.length !== PANEL_SIZE) {
    return { error: "Set a panel of exactly 3 execs first." };
  }
  const [availability, existing] = await Promise.all([
    getClientMeetingAvailability(),
    getClientMeetingSlots(),
  ]);

  const generated = generateClientMeetingSlots(
    settings.panelExecIds,
    availability.map((a) => ({ execId: a.execId, date: a.date, startTime: a.startTime, endTime: a.endTime })),
    existing.map((s) => ({ date: s.date, startTime: s.startTime, endTime: s.endTime })),
    settings.slotMinutes,
  );

  if (generated.length > 0) {
    const supabase = await createClient();
    const { error: slotError } = await supabase.from("client_meeting_slots").insert(
      generated.map((g) => ({ date: g.date, start_time: g.startTime, end_time: g.endTime, published: false })),
    );
    if (slotError) return { error: slotError.message };
  }

  await logAudit(profile.id, "client_meeting.slots_generated", undefined, `${generated.length} slot(s) created`);
  revalidateAdmin();
  return { createdCount: generated.length };
}

/** Unpublishing only hides the slot from new bookings; an existing booking is left alone. */
export async function publishClientMeetingSlotAction(slotId: string, published: boolean): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  const { error: updateError } = await supabase.from("client_meeting_slots").update({ published }).eq("id", slotId);
  if (updateError) return { error: updateError.message };

  revalidateAdmin();
  return {};
}

export async function publishAllClientMeetingSlotsAction(): Promise<ActionResult & { publishedCount?: number }> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  const { data, error: updateError } = await supabase
    .from("client_meeting_slots")
    .update({ published: true })
    .eq("published", false)
    .select("id");
  if (updateError) return { error: updateError.message };

  revalidateAdmin();
  return { publishedCount: data?.length ?? 0 };
}

export async function deleteClientMeetingSlotAction(slotId: string): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  // The bookings FK cascades, so deleting a booked slot would silently wipe the client's booking.
  const { data: active, error: activeError } = await supabase
    .from("client_meetings")
    .select("id")
    .eq("slot_id", slotId)
    .eq("status", "confirmed")
    .maybeSingle();
  if (activeError) return { error: activeError.message };
  if (active) return { error: "That slot has a confirmed booking. Cancel the booking first." };

  const { error: deleteError } = await supabase.from("client_meeting_slots").delete().eq("id", slotId);
  if (deleteError) return { error: deleteError.message };

  revalidateAdmin();
  return {};
}

/** Sets or clears the video link. Only a panel member on that booking, or an elevated-or-above role, may do so. */
export async function setClientMeetingUrlAction(bookingId: string, raw: string): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const validated = validateMeetingUrl(raw);
  if ("error" in validated) return { error: validated.error };

  const supabase = await createClient();
  const { data: booking, error: loadError } = await supabase
    .from("client_meetings")
    .select("panel_exec_ids, status, meeting_url")
    .eq("id", bookingId)
    .maybeSingle();
  if (loadError) return { error: loadError.message };
  if (!booking) return { error: "Booking not found." };
  if (booking.status !== "confirmed") return { error: "Only confirmed bookings can have a link." };
  if (!booking.panel_exec_ids.includes(profile.id) && !isElevatedOrAbove(profile.role)) {
    return { error: "Only the panel for this meeting can set the link." };
  }

  const { data: updated, error: updateError } = await supabase
    .from("client_meetings")
    .update({ meeting_url: validated.url })
    .eq("id", bookingId)
    .eq("status", "confirmed")
    .select("id");
  if (updateError) return { error: updateError.message };
  if (!updated || updated.length === 0) return { error: "That meeting is no longer confirmed." };

  if (validated.url && validated.url !== booking.meeting_url) {
    await emailClientMeetingLink(bookingId);
  }

  await logAudit(profile.id, "client_meeting.link_set", undefined, bookingId);
  revalidateAdmin();
  return {};
}

/** Cancels a booking for the client: panel execs are notified, and so is the client. */
export async function cancelClientMeetingAsAdminAction(bookingId: string): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const supabase = await createClient();
  const { data: cancelled, error: updateError } = await supabase
    .from("client_meetings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", bookingId)
    .eq("status", "confirmed")
    .select("id");
  if (updateError) return { error: updateError.message };

  if ((cancelled ?? []).length > 0) {
    await Promise.all([
      notifyClientMeetingExecs(bookingId, "cancelled"),
      emailClientMeetingCancelled(bookingId, "admin"),
    ]);
  }

  await logAudit(profile.id, "client_meeting.booking_cancelled_by_admin", undefined, bookingId);
  revalidateAdmin();
  return {};
}
