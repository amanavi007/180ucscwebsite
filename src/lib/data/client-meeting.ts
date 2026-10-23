import "server-only";
import { createClient } from "@/lib/supabase/server";
import { normalizeTime } from "@/lib/coffee-chat";
import { EXEC_ROLES } from "@/lib/auth/roles";
import { parseClientMeetingSettings } from "@/lib/client-meeting";
import { fetchAllPages } from "@/lib/paginate";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function lookupProfileNames(
  supabase: Supabase,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name")
    .in("id", ids); // in-ok: profile ids of execs
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id, p.name]));
}

export async function getClientMeetingSettings(): Promise<{
  bookingOpen: boolean;
  slotMinutes: number;
  panelExecIds: string[];
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("org_settings")
    .select("key, value")
    .in("key", [
      "client_meeting_booking_open",
      "client_meeting_slot_minutes",
      "client_meeting_panel",
    ]);
  if (error) throw error;
  return parseClientMeetingSettings(data ?? []);
}

/** Every exec-role profile, the pool the 3-person panel is chosen from. */
export async function getClientMeetingExecOptions(): Promise<
  { id: string; name: string }[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name")
    .in("role", EXEC_ROLES)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((e) => ({ id: e.id, name: e.name }));
}

export interface ClientMeetingAvailabilityRow {
  id: string;
  execId: string;
  execName: string;
  date: string;
  startTime: string;
  endTime: string;
}

export async function getClientMeetingAvailability(): Promise<
  ClientMeetingAvailabilityRow[]
> {
  const supabase = await createClient();
  const rows = await fetchAllPages((from, to) =>
    supabase
      .from("client_meeting_availability")
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

export interface ClientMeetingSlotRow {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  published: boolean;
  bookingStatus: "open" | "booked";
  bookingId: string | null;
  businessName: string | null;
}

export async function getClientMeetingSlots(): Promise<ClientMeetingSlotRow[]> {
  const supabase = await createClient();
  const slotRows = await fetchAllPages((from, to) =>
    supabase
      .from("client_meeting_slots")
      .select("id, date, start_time, end_time, published")
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .order("id")
      .range(from, to),
  );
  if (slotRows.length === 0) return [];

  const bookings = await fetchAllPages((from, to) =>
    supabase
      .from("client_meetings")
      .select("id, slot_id, business_name")
      .eq("status", "confirmed")
      .order("id")
      .range(from, to),
  );
  const bookingBySlot = new Map(bookings.map((b) => [b.slot_id, b]));

  return slotRows.map((s) => {
    const booking = bookingBySlot.get(s.id);
    return {
      id: s.id,
      date: s.date,
      startTime: normalizeTime(s.start_time),
      endTime: normalizeTime(s.end_time),
      published: s.published,
      bookingStatus: booking ? "booked" : "open",
      bookingId: booking?.id ?? null,
      businessName: booking?.business_name ?? null,
    };
  });
}

export interface ClientMeetingBookingRow {
  id: string;
  slotId: string;
  contactName: string;
  businessName: string;
  email: string;
  phone: string | null;
  needs: string;
  meetingUrl: string | null;
  status: "confirmed" | "cancelled" | "completed";
  date: string;
  startTime: string;
  endTime: string;
  panelNames: string[];
  panelExecIds: string[];
  createdAt: string;
}

export async function getClientMeetingBookings(): Promise<
  ClientMeetingBookingRow[]
> {
  const supabase = await createClient();
  const bookingRows = await fetchAllPages((from, to) =>
    supabase
      .from("client_meetings")
      .select(
        "id, slot_id, contact_name, business_name, email, phone, needs, meeting_url, status, panel_exec_ids, created_at",
      )
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  if (bookingRows.length === 0) return [];

  const slots = await fetchAllPages((from, to) =>
    supabase
      .from("client_meeting_slots")
      .select("id, date, start_time, end_time")
      .order("id")
      .range(from, to),
  );
  const slotsById = new Map(slots.map((s) => [s.id, s]));
  const names = await lookupProfileNames(supabase, [
    ...new Set(bookingRows.flatMap((b) => b.panel_exec_ids)),
  ]);

  return bookingRows.map((b) => {
    const slot = slotsById.get(b.slot_id);
    return {
      id: b.id,
      slotId: b.slot_id,
      contactName: b.contact_name,
      businessName: b.business_name,
      email: b.email,
      phone: b.phone,
      needs: b.needs,
      meetingUrl: b.meeting_url,
      status: b.status as ClientMeetingBookingRow["status"],
      date: slot?.date ?? "",
      startTime: slot ? normalizeTime(slot.start_time) : "",
      endTime: slot ? normalizeTime(slot.end_time) : "",
      panelNames: b.panel_exec_ids.map((id) => names.get(id) ?? "Unknown"),
      panelExecIds: b.panel_exec_ids,
      createdAt: b.created_at,
    };
  });
}
