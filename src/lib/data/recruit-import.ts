import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/paginate";
import { getQuarters } from "@/lib/data/quarters";
import { getAllBookings } from "@/lib/data/coffee-chat";
import { getInterviewBookings } from "@/lib/data/interview";
import { getMatchableApplicants } from "@/lib/data/recruit";
import { normalizeName, type MatchableApplicant } from "@/lib/recruit-matching";
import {
  bookingKey,
  bookingsInQuarter,
  splitQueue,
  type AttendanceStatus,
  type QueueBooking,
} from "@/lib/recruit-attendance";

export async function getImportContext(quarterId: string): Promise<{
  applicants: MatchableApplicant[];
  ignoredNames: Set<string>;
  memberNames: Set<string>;
}> {
  const supabase = await createClient();
  const [applicants, ignored, profiles] = await Promise.all([
    getMatchableApplicants(quarterId),
    fetchAllPages((from, to) =>
      supabase.from("recruit_ignored_names").select("name").eq("quarter_id", quarterId).order("id").range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase.from("profiles").select("name").is("archived_at", null).order("id").range(from, to),
    ),
  ]);
  return {
    applicants,
    ignoredNames: new Set(ignored.map((i) => normalizeName(i.name)).filter(Boolean)),
    memberNames: new Set(profiles.map((p) => normalizeName(p.name)).filter(Boolean)),
  };
}

/** Applicants who already hold live (non-voided) points for this event. */
export async function getAwardedApplicantIds(eventId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const rows = await fetchAllPages((from, to) =>
    supabase
      .from("recruit_points")
      .select("applicant_id")
      .eq("event_id", eventId)
      .is("voided_at", null)
      .order("id")
      .range(from, to),
  );
  return new Set(rows.map((r) => r.applicant_id));
}

export interface AttendanceItem extends QueueBooking {
  applicantId: string | null;
  markStatus: AttendanceStatus | null;
}

export interface AttendanceData {
  toMark: AttendanceItem[];
  cancelled: AttendanceItem[];
  marked: AttendanceItem[];
  upcoming: number;
}

export async function getAttendanceData(quarterId: string): Promise<AttendanceData> {
  const supabase = await createClient();
  const quarters = await getQuarters();
  const quarter = quarters.find((q) => q.id === quarterId);
  if (!quarter) return { toMark: [], cancelled: [], marked: [], upcoming: 0 };

  const [coffee, interviews, links] = await Promise.all([
    getAllBookings(),
    getInterviewBookings(),
    fetchAllPages((from, to) => supabase.from("recruit_booking_links").select("*").order("id").range(from, to)),
  ]);

  const all: QueueBooking[] = [
    ...coffee.map(
      (b): QueueBooking => ({
        kind: "coffee_chat",
        bookingId: b.id,
        applicantName: b.applicantName,
        applicantEmail: b.applicantEmail,
        status: b.status,
        date: b.date,
        startTime: b.startTime,
        endTime: b.endTime,
      }),
    ),
    ...interviews.map(
      (b): QueueBooking => ({
        kind: "interview",
        bookingId: b.id,
        applicantName: b.applicantName,
        applicantEmail: b.applicantEmail,
        status: b.status,
        date: b.date,
        startTime: b.startTime,
        endTime: b.endTime,
      }),
    ),
  ].filter((b) => b.date);

  const inQuarter = bookingsInQuarter(all, quarter);
  const linkByKey = new Map(links.map((l) => [bookingKey(l.booking_kind, l.booking_id), l]));
  const { toMark, cancelled, upcoming } = splitQueue(inQuarter, new Set(linkByKey.keys()), new Date());

  const withLink = (b: QueueBooking): AttendanceItem => {
    const link = linkByKey.get(bookingKey(b.kind, b.bookingId));
    return { ...b, applicantId: link?.applicant_id ?? null, markStatus: link?.status ?? null };
  };

  const marked = inQuarter
    .filter((b) => linkByKey.has(bookingKey(b.kind, b.bookingId)))
    .map(withLink)
    .sort((a, b) => `${b.date}T${b.startTime}`.localeCompare(`${a.date}T${a.startTime}`));

  return { toMark: toMark.map(withLink), cancelled: cancelled.map(withLink), marked, upcoming };
}
