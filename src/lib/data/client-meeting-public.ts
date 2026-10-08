import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTime } from "@/lib/coffee-chat";
import {
  canClientCancel,
  isClientMeetingBookable,
  parseClientMeetingSettings,
  PANEL_SIZE,
} from "@/lib/client-meeting";
import { fetchAllPages } from "@/lib/paginate";
import { formatOrgDate } from "@/lib/date";

export interface PublicClientMeetingSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
}

export const CLIENT_MEETING_SETTING_KEYS = [
  "client_meeting_booking_open",
  "client_meeting_slot_minutes",
  "client_meeting_panel",
];

/**
 * Whether booking is open, and every slot a client may book right now (published, unbooked, 24h+ away).
 * Closed and empty when booking is off or the panel setting isn't a valid set of 3 execs.
 */
export async function getPublicClientMeetingState(): Promise<{
  bookingOpen: boolean;
  slots: PublicClientMeetingSlot[];
}> {
  const supabase = createAdminClient();
  const { data: settingRows, error: settingsError } = await supabase
    .from("org_settings")
    .select("key, value")
    .in("key", CLIENT_MEETING_SETTING_KEYS);
  if (settingsError) throw settingsError;
  const { bookingOpen, panelExecIds } = parseClientMeetingSettings(
    settingRows ?? [],
  );
  if (!bookingOpen || panelExecIds.length !== PANEL_SIZE)
    return { bookingOpen: false, slots: [] };

  const now = new Date();
  // Only today onward: past slots are never bookable, and this keeps the read small over time.
  const slotRows = await fetchAllPages((from, to) =>
    supabase
      .from("client_meeting_slots")
      .select("id, date, start_time, end_time, published")
      .eq("published", true)
      .gte("date", formatOrgDate(now))
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .order("id")
      .range(from, to),
  );
  if (slotRows.length === 0) return { bookingOpen, slots: [] };

  // Page through the whole table (a single response is capped at 1000 rows).
  const bookings = await fetchAllPages((from, to) =>
    supabase
      .from("client_meetings")
      .select("id, slot_id")
      .eq("status", "confirmed")
      .order("id")
      .range(from, to),
  );
  const booked = new Set(bookings.map((b) => b.slot_id));

  return {
    bookingOpen,
    slots: slotRows
      .filter((s) =>
        isClientMeetingBookable(
          {
            date: s.date,
            startTime: s.start_time,
            published: s.published,
            hasConfirmedBooking: booked.has(s.id),
          },
          true,
          now,
        ),
      )
      .map((s) => ({
        id: s.id,
        date: s.date,
        startTime: normalizeTime(s.start_time),
        endTime: normalizeTime(s.end_time),
      })),
  };
}

export interface ManagedClientMeeting {
  status: "confirmed" | "cancelled" | "completed";
  contactName: string;
  businessName: string;
  email: string;
  phone: string | null;
  date: string;
  startTime: string;
  endTime: string;
  meetingUrl: string | null;
  canSelfCancel: boolean;
  /** Rescheduling cancels first, so only offer it when the client can actually book again right now. */
  canReschedule: boolean;
}

export async function getClientMeetingByToken(
  token: string,
): Promise<ManagedClientMeeting | null> {
  const supabase = createAdminClient();
  const { data: booking, error } = await supabase
    .from("client_meetings")
    .select("status, contact_name, business_name, email, phone, meeting_url, slot_id")
    .eq("manage_token", token)
    .maybeSingle();
  if (error) throw error;
  if (!booking) return null;

  const { data: slot, error: slotError } = await supabase
    .from("client_meeting_slots")
    .select("date, start_time, end_time")
    .eq("id", booking.slot_id)
    .single();
  if (slotError || !slot) return null;

  const startTime = normalizeTime(slot.start_time);
  const state = await getPublicClientMeetingState();
  return {
    status: booking.status as ManagedClientMeeting["status"],
    contactName: booking.contact_name,
    businessName: booking.business_name,
    email: booking.email,
    phone: booking.phone,
    date: slot.date,
    startTime,
    endTime: normalizeTime(slot.end_time),
    meetingUrl: booking.meeting_url,
    canSelfCancel: canClientCancel(slot.date, startTime, new Date()),
    canReschedule: state.bookingOpen && state.slots.length > 0,
  };
}
