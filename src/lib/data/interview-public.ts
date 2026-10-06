import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTime } from "@/lib/coffee-chat";
import { canSelfCancel, isInterviewSlotBookable, parseInterviewSettings } from "@/lib/interview";

export interface PublicInterviewSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
}

/** Whether booking is open, and every slot an applicant may book right now (published, unbooked, 2+ execs, 12h+ away). */
export async function getPublicInterviewState(): Promise<{ bookingOpen: boolean; slots: PublicInterviewSlot[] }> {
  const supabase = createAdminClient();
  const { data: settingRows, error: settingsError } = await supabase
    .from("org_settings")
    .select("key, value")
    .in("key", ["interview_booking_open", "interview_slot_minutes"]);
  if (settingsError) throw settingsError;
  const { bookingOpen } = parseInterviewSettings(settingRows ?? []);
  if (!bookingOpen) return { bookingOpen: false, slots: [] };

  const { data: slots, error } = await supabase
    .from("interview_slots")
    .select("id, date, start_time, end_time, published")
    .eq("published", true)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw error;
  const slotRows = slots ?? [];
  if (slotRows.length === 0) return { bookingOpen, slots: [] };

  const [{ data: bookings, error: bookingsError }, { data: links, error: linksError }] = await Promise.all([
    supabase.from("interview_bookings").select("slot_id").eq("status", "confirmed"),
    supabase.from("interview_slot_execs").select("slot_id"),
  ]);
  if (bookingsError) throw bookingsError;
  if (linksError) throw linksError;
  const booked = new Set((bookings ?? []).map((b) => b.slot_id));
  const execCounts = new Map<string, number>();
  for (const l of links ?? []) execCounts.set(l.slot_id, (execCounts.get(l.slot_id) ?? 0) + 1);

  const now = new Date();
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
      .map((s) => ({ id: s.id, date: s.date, startTime: normalizeTime(s.start_time), endTime: normalizeTime(s.end_time) })),
  };
}

export interface ManagedInterviewBooking {
  status: "confirmed" | "cancelled";
  applicantName: string;
  applicantEmail: string;
  date: string;
  startTime: string;
  endTime: string;
  canSelfCancel: boolean;
}

export async function getInterviewBookingByToken(token: string): Promise<ManagedInterviewBooking | null> {
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
  return {
    status: booking.status as "confirmed" | "cancelled",
    applicantName: booking.applicant_name,
    applicantEmail: booking.applicant_email,
    date: slot.date,
    startTime,
    endTime: normalizeTime(slot.end_time),
    canSelfCancel: canSelfCancel(slot.date, startTime, new Date()),
  };
}
