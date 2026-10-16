import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTime } from "@/lib/coffee-chat";
import {
  canSelfCancel,
  isInterviewSlotBookable,
  parseInterviewSettings,
} from "@/lib/interview";
import { fetchAllPages } from "@/lib/paginate";
import { formatOrgDate } from "@/lib/date";

export interface PublicInterviewSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
}

/** Whether booking is open, and every slot an applicant may book right now (published, unbooked, 2+ execs, 12h+ away). */
export async function getPublicInterviewState(): Promise<{
  bookingOpen: boolean;
  slots: PublicInterviewSlot[];
}> {
  const supabase = createAdminClient();
  const { data: settingRows, error: settingsError } = await supabase
    .from("org_settings")
    .select("key, value")
    .in("key", ["interview_booking_open", "interview_slot_minutes", "interview_window_start", "interview_window_end"]);
  if (settingsError) throw settingsError;
  const { bookingOpen, windowStart, windowEnd } = parseInterviewSettings(settingRows ?? []);
  if (!bookingOpen) return { bookingOpen: false, slots: [] };

  const now = new Date();
  // Only today onward: past slots are never bookable, and this keeps the read small as old cycles pile up.
  const slotRows = await fetchAllPages((from, to) =>
    supabase
      .from("interview_slots")
      .select("id, date, start_time, end_time, published")
      .eq("published", true)
      .gte("date", windowStart && windowStart > formatOrgDate(now) ? windowStart : formatOrgDate(now))
      .lte("date", windowEnd ?? "9999-12-31")
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .order("id")
      .range(from, to),
  );
  if (slotRows.length === 0) return { bookingOpen, slots: [] };

  // Page through the whole tables (a single response is capped at 1000 rows).
  const [bookings, links] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from("interview_bookings")
        .select("id, slot_id")
        .eq("status", "confirmed")
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
  const booked = new Set(bookings.map((b) => b.slot_id));
  const execCounts = new Map<string, number>();
  for (const l of links)
    execCounts.set(l.slot_id, (execCounts.get(l.slot_id) ?? 0) + 1);

  return {
    bookingOpen,
    slots: slotRows
      .filter((s) =>
        isInterviewSlotBookable(
          {
            date: s.date,
            startTime: s.start_time,
            published: s.published,
            hasConfirmedBooking: booked.has(s.id),
            execCount: execCounts.get(s.id) ?? 0,
          },
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

export interface ManagedInterviewBooking {
  status: "confirmed" | "cancelled" | "completed";
  applicantName: string;
  applicantEmail: string;
  date: string;
  startTime: string;
  endTime: string;
  canSelfCancel: boolean;
  /** Rescheduling cancels first, so only offer it when the applicant can actually book again right now. */
  canReschedule: boolean;
}

export async function getInterviewBookingByToken(
  token: string,
): Promise<ManagedInterviewBooking | null> {
  const supabase = createAdminClient();
  const { data: booking, error } = await supabase
    .from("interview_bookings")
    .select("status, applicant_name, applicant_email, slot_id")
    .eq("manage_token", token)
    .maybeSingle();
  if (error) throw error;
  if (!booking) return null;

  const { data: slot, error: slotError } = await supabase
    .from("interview_slots")
    .select("date, start_time, end_time")
    .eq("id", booking.slot_id)
    .single();
  if (slotError || !slot) return null;

  const startTime = normalizeTime(slot.start_time);
  const [state, { data: invitee }] = await Promise.all([
    getPublicInterviewState(),
    supabase
      .from("interview_invitees")
      .select("id")
      .eq("email", booking.applicant_email)
      .maybeSingle(),
  ]);
  return {
    status: booking.status as ManagedInterviewBooking["status"],
    applicantName: booking.applicant_name,
    applicantEmail: booking.applicant_email,
    date: slot.date,
    startTime,
    endTime: normalizeTime(slot.end_time),
    canSelfCancel: canSelfCancel(slot.date, startTime, new Date()),
    canReschedule: state.bookingOpen && !!invitee && state.slots.length > 0,
  };
}
