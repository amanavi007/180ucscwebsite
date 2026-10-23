import "server-only";
import { createClient } from "@/lib/supabase/server";
import { normalizeTime } from "@/lib/coffee-chat";
import { EXEC_ROLES } from "@/lib/auth/roles";
import { fetchAllPages } from "@/lib/paginate";

export interface AvailabilityRow {
  id: string;
  execId: string;
  execName: string;
  date: string;
  startTime: string;
  endTime: string;
}

export async function getAllAvailability(): Promise<AvailabilityRow[]> {
  const supabase = await createClient();
  const data = await fetchAllPages((from, to) =>
    supabase
      .from("coffee_chat_availability")
      .select("id, exec_id, date, start_time, end_time, exec:profiles(name)")
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .order("id")
      .range(from, to),
  );

  return (
    (data ?? []) as unknown as {
      id: string;
      exec_id: string;
      date: string;
      start_time: string;
      end_time: string;
      exec: { name: string } | null;
    }[]
  ).map((row) => ({
    id: row.id,
    execId: row.exec_id,
    execName: row.exec?.name ?? "Unknown",
    date: row.date,
    startTime: normalizeTime(row.start_time),
    endTime: normalizeTime(row.end_time),
  }));
}

interface ProfileNameLookup {
  id: string;
  name: string;
}

async function lookupProfileNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from("profiles").select("id, name").in("id", ids);
  if (error) throw error;
  return new Map(((data ?? []) as ProfileNameLookup[]).map((p) => [p.id, p.name]));
}

export interface SlotRow {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  published: boolean;
  execId1: string;
  exec1Name: string;
  execId2: string | null;
  exec2Name: string | null;
  bookingStatus: "open" | "booked";
  applicantName: string | null;
}

export async function getAllSlots(): Promise<SlotRow[]> {
  const supabase = await createClient();
  const slotRows = await fetchAllPages((from, to) =>
    supabase
      .from("coffee_chat_slots")
      .select("id, date, start_time, end_time, location, published, exec_id_1, exec_id_2")
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .order("id")
      .range(from, to),
  );
  if (slotRows.length === 0) return [];

  const execIds = [...new Set(slotRows.flatMap((s) => [s.exec_id_1, s.exec_id_2]).filter((id): id is string => !!id))];
  const namesByExecId = await lookupProfileNames(supabase, execIds);

  // Read the whole table page by page rather than building an IN list of every slot id, which overflows the request URL.
  const bookings = await fetchAllPages((from, to) =>
    supabase
      .from("coffee_chat_bookings")
      .select("slot_id, applicant_name")
      .eq("status", "confirmed")
      .order("id")
      .range(from, to),
  );
  const applicantBySlotId = new Map(bookings.map((b) => [b.slot_id, b.applicant_name]));

  return slotRows.map((s) => ({
    id: s.id,
    date: s.date,
    startTime: normalizeTime(s.start_time),
    endTime: normalizeTime(s.end_time),
    location: s.location,
    published: s.published,
    execId1: s.exec_id_1,
    exec1Name: namesByExecId.get(s.exec_id_1) ?? "Unknown",
    execId2: s.exec_id_2,
    exec2Name: s.exec_id_2 ? (namesByExecId.get(s.exec_id_2) ?? "Unknown") : null,
    bookingStatus: applicantBySlotId.has(s.id) ? "booked" : "open",
    applicantName: applicantBySlotId.get(s.id) ?? null,
  }));
}

export interface BookingRow {
  id: string;
  slotId: string;
  applicantName: string;
  applicantEmail: string;
  status: "confirmed" | "cancelled";
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  exec1Id: string | null;
  exec2Id: string | null;
  exec1Name: string;
  exec2Name: string | null;
  createdAt: string;
  cancelledAt: string | null;
}

export async function getAllBookings(): Promise<BookingRow[]> {
  const supabase = await createClient();
  const bookingRows = await fetchAllPages((from, to) =>
    supabase
      .from("coffee_chat_bookings")
      .select("id, slot_id, applicant_name, applicant_email, status, location, created_at, cancelled_at")
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  if (bookingRows.length === 0) return [];

  const slots = await fetchAllPages((from, to) =>
    supabase
      .from("coffee_chat_slots")
      .select("id, date, start_time, end_time, location, exec_id_1, exec_id_2")
      .order("id")
      .range(from, to),
  );
  const slotsById = new Map(slots.map((s) => [s.id, s]));

  const execIds = [
    ...new Set(slots.flatMap((s) => [s.exec_id_1, s.exec_id_2]).filter((id): id is string => !!id)),
  ];
  const namesByExecId = await lookupProfileNames(supabase, execIds);

  return bookingRows.map((b) => {
    const slot = slotsById.get(b.slot_id);
    return {
      id: b.id,
      slotId: b.slot_id,
      applicantName: b.applicant_name,
      applicantEmail: b.applicant_email,
      status: b.status as "confirmed" | "cancelled",
      date: slot?.date ?? "",
      startTime: slot ? normalizeTime(slot.start_time) : "",
      endTime: slot ? normalizeTime(slot.end_time) : "",
      location: b.location || (slot?.location ?? ""),
      exec1Id: slot?.exec_id_1 ?? null,
      exec2Id: slot?.exec_id_2 ?? null,
      exec1Name: slot ? (namesByExecId.get(slot.exec_id_1) ?? "Unknown") : "Unknown",
      exec2Name: slot?.exec_id_2 ? (namesByExecId.get(slot.exec_id_2) ?? "Unknown") : null,
      createdAt: b.created_at,
      cancelledAt: b.cancelled_at,
    };
  });
}

export interface ExecOption {
  id: string;
  name: string;
}

export interface ExecOptions {
  /** Execs whose availability covers the slot. */
  available: ExecOption[];
  /** Every other exec, for manually taking a slot they didn't mark themselves free for. */
  others: ExecOption[];
}

/** Swap candidates for a slot: execs free at that date/time first, then all remaining execs. */
export async function getExecOptionsForSlot(date: string, startTime: string, endTime: string): Promise<ExecOptions> {
  const supabase = await createClient();
  const [{ data, error }, { data: execs, error: execsError }] = await Promise.all([
    supabase
      .from("coffee_chat_availability")
      .select("exec_id")
      .eq("date", date)
      .lte("start_time", startTime)
      .gte("end_time", endTime),
    supabase.from("profiles").select("id, name").in("role", EXEC_ROLES).order("name"),
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
