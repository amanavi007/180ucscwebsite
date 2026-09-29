"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import { getAllAvailability, getAllSlots, getExecOptionsForSlot } from "@/lib/data/coffee-chat";
import {
  DEFAULT_CHUNK_MINUTES,
  generateSlots,
  isSwapEligible,
  type AvailabilityBlock,
  type ExistingSlotAssignment,
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
}

export async function addAvailabilityBlockAction(date: string, startTime: string, endTime: string): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  if (startTime >= endTime) return { error: "End time must be after start time." };

  const supabase = await createClient();
  const { error: insertError } = await supabase
    .from("coffee_chat_availability")
    .insert({ exec_id: profile.id, date, start_time: startTime, end_time: endTime });
  if (insertError) return { error: insertError.message };

  revalidateAdmin();
  return {};
}

export async function removeAvailabilityBlockAction(id: string): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  const { error: deleteError } = await supabase.from("coffee_chat_availability").delete().eq("id", id);
  if (deleteError) return { error: deleteError.message };

  revalidateAdmin();
  return {};
}

export async function generateSlotsAction(): Promise<ActionResult & { createdCount?: number }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const supabase = await createClient();
  const [availabilityRows, existingSlots] = await Promise.all([getAllAvailability(), getAllSlots()]);

  const availability: AvailabilityBlock[] = availabilityRows.map((a) => ({
    execId: a.execId,
    date: a.date,
    startTime: a.startTime,
    endTime: a.endTime,
  }));

  const generated = generateSlots(availability, DEFAULT_CHUNK_MINUTES);

  // Never touch a slot that's already booked -- only fill in windows that
  // don't already have an unbooked or booked slot recorded.
  const existingKeys = new Set(existingSlots.map((s) => `${s.date}|${s.startTime}|${s.execId1}|${s.execId2 ?? ""}`));
  const toInsert = generated
    .filter((g) => !existingKeys.has(`${g.date}|${g.startTime}|${g.execId1}|${g.execId2 ?? ""}`))
    .map((g) => ({
      date: g.date,
      start_time: g.startTime,
      end_time: g.endTime,
      exec_id_1: g.execId1,
      exec_id_2: g.execId2,
      published: false,
    }));

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase.from("coffee_chat_slots").insert(toInsert);
    if (insertError) return { error: insertError.message };
  }

  await logAudit(profile.id, "coffee_chat.slots_generated", undefined, `${toInsert.length} slot(s) created`);
  revalidateAdmin();
  return { createdCount: toInsert.length };
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

export async function deleteSlotAction(slotId: string): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
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
