import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTime } from "@/lib/coffee-chat";
import { clientMeetingEventLines } from "@/lib/client-meeting-invite";
import { fetchInChunks } from "@/lib/paginate";

/** VEVENT lines for every confirmed client meeting this exec is on (per the booking's panel snapshot). */
export async function buildClientMeetingFeedEvents(execId: string): Promise<string[]> {
  const supabase = createAdminClient();
  const { data: meetings, error } = await supabase
    .from("client_meetings")
    .select("id, slot_id, contact_name, business_name, needs, panel_exec_ids, meeting_url, manage_token")
    .eq("status", "confirmed")
    .contains("panel_exec_ids", [execId]);
  if (error) throw error;
  if (!meetings || meetings.length === 0) return [];

  const slots = await fetchInChunks(
    meetings.map((m) => m.slot_id),
    (chunk, from, to) =>
      supabase.from("client_meeting_slots").select("id, date, start_time, end_time").in("id", chunk).order("id").range(from, to),
  );
  const slotsById = new Map(slots.map((s) => [s.id, s]));

  const otherIds = [...new Set(meetings.flatMap((m) => m.panel_exec_ids).filter((id) => id !== execId))];
  const profiles = await fetchInChunks(otherIds, (chunk, from, to) =>
    supabase.from("profiles").select("id, name").in("id", chunk).order("id").range(from, to),
  );
  const names = new Map(profiles.map((p) => [p.id, p.name]));

  return meetings.flatMap((m) => {
    const slot = slotsById.get(m.slot_id);
    if (!slot) return [];
    return clientMeetingEventLines({
      id: m.id,
      businessName: m.business_name,
      contactName: m.contact_name,
      needs: m.needs,
      date: slot.date,
      startTime: normalizeTime(slot.start_time),
      endTime: normalizeTime(slot.end_time),
      manageToken: m.manage_token,
      meetingUrl: m.meeting_url,
      panelNames: m.panel_exec_ids.filter((id) => id !== execId).map((id) => names.get(id) ?? "Unknown"),
    });
  });
}
