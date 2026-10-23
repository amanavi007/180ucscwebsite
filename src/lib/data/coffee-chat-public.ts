import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_MIN_LEAD_MINUTES, isSlotBookable, normalizeTime } from "@/lib/coffee-chat";
import { fetchAllPages } from "@/lib/paginate";

export interface PublicSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
}

/** Every slot an applicant is currently allowed to book: published, unbooked, and past the minimum lead time. */
export async function getOpenSlots(): Promise<PublicSlot[]> {
  const supabase = createAdminClient();
  const slotRows = await fetchAllPages((from, to) =>
    supabase
      .from("coffee_chat_slots")
      .select("id, date, start_time, end_time, location, published, exec_id_2")
      .eq("published", true)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .order("id")
      .range(from, to),
  );
  if (slotRows.length === 0) return [];

  // Read the bookings table page by page: an IN list of every slot id overflows the request URL as slots pile up.
  const bookings = await fetchAllPages((from, to) =>
    supabase.from("coffee_chat_bookings").select("slot_id").eq("status", "confirmed").order("id").range(from, to),
  );
  const bookedSlotIds = new Set(bookings.map((b) => b.slot_id));

  const now = new Date();
  return slotRows
    .filter((s) =>
      isSlotBookable(
        {
          date: s.date,
          startTime: s.start_time,
          published: s.published,
          hasConfirmedBooking: bookedSlotIds.has(s.id),
          hasTwoExecs: s.exec_id_2 !== null,
        },
        now,
        DEFAULT_MIN_LEAD_MINUTES,
      ),
    )
    .map((s) => ({
      id: s.id,
      date: s.date,
      startTime: normalizeTime(s.start_time),
      endTime: normalizeTime(s.end_time),
      location: s.location,
    }));
}

export interface ManagedBooking {
  status: "confirmed" | "cancelled";
  applicantName: string;
  applicantEmail: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
}

export async function getBookingByToken(token: string): Promise<ManagedBooking | null> {
  const supabase = createAdminClient();
  const { data: booking, error } = await supabase
    .from("coffee_chat_bookings")
    .select("status, applicant_name, applicant_email, slot_id, location")
    .eq("manage_token", token)
    .maybeSingle();
  if (error) throw error;
  if (!booking) return null;

  const { data: slot, error: slotError } = await supabase
    .from("coffee_chat_slots")
    .select("date, start_time, end_time, location")
    .eq("id", booking.slot_id)
    .single();
  if (slotError || !slot) return null;

  return {
    status: booking.status as "confirmed" | "cancelled",
    applicantName: booking.applicant_name,
    applicantEmail: booking.applicant_email,
    date: slot.date,
    startTime: normalizeTime(slot.start_time),
    endTime: normalizeTime(slot.end_time),
    location: booking.location || slot.location,
  };
}
