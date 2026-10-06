import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTime } from "@/lib/coffee-chat";
import { interviewEventLines } from "@/lib/interview-invite";

/** VEVENT lines for every confirmed interview this exec is on, for the shared exec calendar feed. */
export async function buildInterviewFeedEvents(execId: string): Promise<string[]> {
  const supabase = createAdminClient();

  const { data: mine, error } = await supabase.from("interview_slot_execs").select("slot_id").eq("exec_id", execId);
  if (error) throw error;
  const slotIds = (mine ?? []).map((r) => r.slot_id);
  if (slotIds.length === 0) return [];

  const [{ data: slots, error: slotsError }, { data: panel, error: panelError }, { data: bookings, error: bookingsError }] =
    await Promise.all([
      supabase.from("interview_slots").select("id, date, start_time, end_time").in("id", slotIds),
      supabase.from("interview_slot_execs").select("slot_id, exec_id").in("slot_id", slotIds),
      supabase
        .from("interview_bookings")
        .select("id, slot_id, applicant_name, manage_token")
        .eq("status", "confirmed")
        .in("slot_id", slotIds),
    ]);
  if (slotsError) throw slotsError;
  if (panelError) throw panelError;
  if (bookingsError) throw bookingsError;

  const otherIds = [...new Set((panel ?? []).map((p) => p.exec_id).filter((id) => id !== execId))];
  const { data: profiles, error: profilesError } =
    otherIds.length > 0 ? await supabase.from("profiles").select("id, name").in("id", otherIds) : { data: [], error: null };
  if (profilesError) throw profilesError;
  const names = new Map((profiles ?? []).map((p) => [p.id, p.name]));
  const slotsById = new Map((slots ?? []).map((s) => [s.id, s]));

  return (bookings ?? []).flatMap((b) => {
    const slot = slotsById.get(b.slot_id);
    if (!slot) return [];
    const panelNames = (panel ?? [])
      .filter((p) => p.slot_id === b.slot_id && p.exec_id !== execId)
      .map((p) => names.get(p.exec_id) ?? "Unknown");
    return interviewEventLines({
      id: b.id,
      applicantName: b.applicant_name,
      date: slot.date,
      startTime: normalizeTime(slot.start_time),
      endTime: normalizeTime(slot.end_time),
      manageToken: b.manage_token,
      panelNames,
    });
  });
}
