import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTime } from "@/lib/coffee-chat";
import { buildIcsCalendar, type CoffeeChatBookingForInvite } from "@/lib/calendar-invite";
import { buildInterviewFeedEvents } from "@/lib/interview-feed";
import { buildClientMeetingFeedEvents } from "@/lib/client-meeting-feed";

/** Unguessable per-exec signature, derived from the service key so no extra storage or secret is needed. */
function signExecId(execId: string): string {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!).update(`calendar-feed:${execId}`).digest("hex");
}

export function isValidFeedSignature(execId: string, sig: string): boolean {
  const expected = Buffer.from(signExecId(execId));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function calendarFeedPath(execId: string): string {
  return `/api/coffee-chat/feed/${execId}/${signExecId(execId)}/calendar.ics`;
}

/** Every confirmed coffee chat this exec is on, as calendar events. */
async function buildCoffeeChatEvents(execId: string): Promise<(CoffeeChatBookingForInvite & { id: string })[]> {
  const supabase = createAdminClient();
  const { data: slots, error } = await supabase
    .from("coffee_chat_slots")
    .select("id, date, start_time, end_time, location, exec_id_1, exec_id_2")
    .or(`exec_id_1.eq.${execId},exec_id_2.eq.${execId}`);
  if (error) throw error;
  const slotsById = new Map((slots ?? []).map((s) => [s.id, s]));
  if (slotsById.size === 0) return [];

  const otherExecIds = [
    ...new Set(
      (slots ?? []).map((s) => (s.exec_id_1 === execId ? s.exec_id_2 : s.exec_id_1)).filter((id): id is string => !!id),
    ),
  ];
  const { data: profiles, error: profilesError } =
    otherExecIds.length > 0
      ? await supabase.from("profiles").select("id, name").in("id", otherExecIds)
      : { data: [], error: null };
  if (profilesError) throw profilesError;
  const namesById = new Map((profiles ?? []).map((p) => [p.id, p.name]));

  const { data: bookings, error: bookingsError } = await supabase
    .from("coffee_chat_bookings")
    .select("id, slot_id, applicant_name, location")
    .eq("status", "confirmed")
    .in("slot_id", [...slotsById.keys()]);
  if (bookingsError) throw bookingsError;

  return (bookings ?? []).flatMap((b) => {
      const slot = slotsById.get(b.slot_id);
      if (!slot) return [];
      return [
        {
          id: b.id,
          applicantName: b.applicant_name,
          date: slot.date,
          startTime: normalizeTime(slot.start_time),
          endTime: normalizeTime(slot.end_time),
          location: b.location || slot.location,
          manageToken: b.id,
          otherExecName: namesById.get(slot.exec_id_1 === execId ? (slot.exec_id_2 ?? "") : slot.exec_id_1) ?? null,
        },
      ];
    });
}

/** Every confirmed coffee chat and interview this exec is on, as one subscribable calendar. */
export async function buildExecFeed(execId: string): Promise<string> {
  const [coffeeChats, interviewLines, clientMeetingLines] = await Promise.all([
    buildCoffeeChatEvents(execId),
    buildInterviewFeedEvents(execId),
    buildClientMeetingFeedEvents(execId),
  ]);
  return buildIcsCalendar(coffeeChats, [...interviewLines, ...clientMeetingLines]);
}
