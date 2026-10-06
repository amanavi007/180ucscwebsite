import "server-only";
import { createClient } from "@/lib/supabase/server";
import { normalizeTime } from "@/lib/coffee-chat";
import { EXEC_ROLES } from "@/lib/auth/roles";
import { parseInterviewSettings } from "@/lib/interview";
import { fetchAllPages } from "@/lib/paginate";
import type { ExecOption } from "@/lib/data/coffee-chat";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function lookupProfileNames(
  supabase: Supabase,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name")
    .in("id", ids);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id, p.name]));
}

export interface InviteeRow {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  booking: { date: string; startTime: string; endTime: string } | null;
}

export async function getInvitees(): Promise<InviteeRow[]> {
  const supabase = await createClient();
  const [invitees, bookings, slots] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from("interview_invitees")
        .select("id, email, name, created_at")
        .order("created_at", { ascending: true })
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("interview_bookings")
        .select("applicant_email, slot_id")
        .eq("status", "confirmed")
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("interview_slots")
        .select("id, date, start_time, end_time")
        .order("id")
        .range(from, to),
    ),
  ]);
  const slotsById = new Map(slots.map((s) => [s.id, s]));

  const bookingByEmail = new Map<string, InviteeRow["booking"]>();
  for (const b of bookings) {
    const slot = slotsById.get(b.slot_id);
    if (slot) {
      bookingByEmail.set(b.applicant_email, {
        date: slot.date,
        startTime: normalizeTime(slot.start_time),
        endTime: normalizeTime(slot.end_time),
      });
    }
  }

  return invitees.map((i) => ({
    id: i.id,
    email: i.email,
    name: i.name,
    createdAt: i.created_at,
    booking: bookingByEmail.get(i.email) ?? null,
  }));
}

export interface InterviewAvailabilityRow {
  id: string;
  execId: string;
  execName: string;
  date: string;
  startTime: string;
  endTime: string;
}

export async function getInterviewAvailability(): Promise<
  InterviewAvailabilityRow[]
> {
  const supabase = await createClient();
  const rows = await fetchAllPages((from, to) =>
    supabase
      .from("interview_availability")
      .select("id, exec_id, date, start_time, end_time")
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .order("id")
      .range(from, to),
  );
  const names = await lookupProfileNames(supabase, [
    ...new Set(rows.map((r) => r.exec_id)),
  ]);
  return rows.map((r) => ({
    id: r.id,
    execId: r.exec_id,
    execName: names.get(r.exec_id) ?? "Unknown",
    date: r.date,
    startTime: normalizeTime(r.start_time),
    endTime: normalizeTime(r.end_time),
  }));
}

export interface InterviewSlotRow {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  published: boolean;
  execs: { id: string; name: string }[];
  bookingStatus: "open" | "booked";
  bookingId: string | null;
  applicantName: string | null;
  applicantEmail: string | null;
}

export async function getInterviewSlots(): Promise<InterviewSlotRow[]> {
  const supabase = await createClient();
  const slotRows = await fetchAllPages((from, to) =>
    supabase
      .from("interview_slots")
      .select("id, date, start_time, end_time, published")
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .order("id")
      .range(from, to),
  );
  if (slotRows.length === 0) return [];

  // Read whole tables page by page (the API caps a single response at 1000 rows) rather than building a long IN list.
  const [links, bookings] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from("interview_slot_execs")
        .select("slot_id, exec_id")
        .order("slot_id")
        .order("exec_id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("interview_bookings")
        .select("id, slot_id, applicant_name, applicant_email")
        .eq("status", "confirmed")
        .order("id")
        .range(from, to),
    ),
  ]);

  const names = await lookupProfileNames(supabase, [
    ...new Set(links.map((l) => l.exec_id)),
  ]);
  const execsBySlot = new Map<string, { id: string; name: string }[]>();
  for (const l of links) {
    if (!execsBySlot.has(l.slot_id)) execsBySlot.set(l.slot_id, []);
    execsBySlot
      .get(l.slot_id)!
      .push({ id: l.exec_id, name: names.get(l.exec_id) ?? "Unknown" });
  }
  const bookingBySlot = new Map(bookings.map((b) => [b.slot_id, b]));

  return slotRows.map((s) => {
    const booking = bookingBySlot.get(s.id);
    return {
      id: s.id,
      date: s.date,
      startTime: normalizeTime(s.start_time),
      endTime: normalizeTime(s.end_time),
      published: s.published,
      execs: (execsBySlot.get(s.id) ?? []).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
      bookingStatus: booking ? "booked" : "open",
      bookingId: booking?.id ?? null,
      applicantName: booking?.applicant_name ?? null,
      applicantEmail: booking?.applicant_email ?? null,
    };
  });
}

export interface InterviewBookingRow {
  id: string;
  slotId: string;
  applicantName: string;
  applicantEmail: string;
  status: "confirmed" | "cancelled" | "completed";
  date: string;
  startTime: string;
  endTime: string;
  execIds: string[];
  execNames: string[];
  createdAt: string;
  cancelledAt: string | null;
}

export async function getInterviewBookings(): Promise<InterviewBookingRow[]> {
  const supabase = await createClient();
  const bookingRows = await fetchAllPages((from, to) =>
    supabase
      .from("interview_bookings")
      .select(
        "id, slot_id, applicant_name, applicant_email, status, created_at, cancelled_at",
      )
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  if (bookingRows.length === 0) return [];

  const [slots, links] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from("interview_slots")
        .select("id, date, start_time, end_time")
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("interview_slot_execs")
        .select("slot_id, exec_id")
        .order("slot_id")
        .order("exec_id")
        .range(from, to),
    ),
  ]);
  const slotsById = new Map(slots.map((s) => [s.id, s]));
  const names = await lookupProfileNames(supabase, [
    ...new Set(links.map((l) => l.exec_id)),
  ]);
  const execIdsBySlot = new Map<string, string[]>();
  for (const l of links) {
    if (!execIdsBySlot.has(l.slot_id)) execIdsBySlot.set(l.slot_id, []);
    execIdsBySlot.get(l.slot_id)!.push(l.exec_id);
  }

  return bookingRows.map((b) => {
    const slot = slotsById.get(b.slot_id);
    const execIds = execIdsBySlot.get(b.slot_id) ?? [];
    return {
      id: b.id,
      slotId: b.slot_id,
      applicantName: b.applicant_name,
      applicantEmail: b.applicant_email,
      status: b.status as InterviewBookingRow["status"],
      date: slot?.date ?? "",
      startTime: slot ? normalizeTime(slot.start_time) : "",
      endTime: slot ? normalizeTime(slot.end_time) : "",
      execIds,
      execNames: execIds.map((id) => names.get(id) ?? "Unknown"),
      createdAt: b.created_at,
      cancelledAt: b.cancelled_at,
    };
  });
}

export interface InterviewExecOptions {
  /** Execs whose interview availability covers the slot. */
  available: ExecOption[];
  /** Every other exec, for manually taking a slot they didn't mark themselves free for. */
  others: ExecOption[];
}

export async function getInterviewExecOptions(
  date: string,
  startTime: string,
  endTime: string,
): Promise<InterviewExecOptions> {
  const supabase = await createClient();
  const [{ data, error }, { data: execs, error: execsError }] =
    await Promise.all([
      supabase
        .from("interview_availability")
        .select("exec_id")
        .eq("date", date)
        .lte("start_time", startTime)
        .gte("end_time", endTime),
      supabase
        .from("profiles")
        .select("id, name")
        .in("role", EXEC_ROLES)
        .order("name"),
    ]);
  if (error) throw error;
  if (execsError) throw execsError;

  const freeIds = new Set((data ?? []).map((row) => row.exec_id));
  const all = (execs ?? []).map((e) => ({ id: e.id, name: e.name }));
  return {
    available: all.filter((e) => freeIds.has(e.id)),
    others: all.filter((e) => !freeIds.has(e.id)),
  };
}

export async function getInterviewAdminSettings(): Promise<{
  bookingOpen: boolean;
  slotMinutes: number;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("org_settings")
    .select("key, value")
    .in("key", ["interview_booking_open", "interview_slot_minutes"]);
  if (error) throw error;
  return parseInterviewSettings(data ?? []);
}
