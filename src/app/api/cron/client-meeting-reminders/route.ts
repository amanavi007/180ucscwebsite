import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { buildClientMeetingReminderEmail } from "@/lib/email/client-meeting-emails";
import { isInterviewReminderHour } from "@/lib/interview-reminders";
import { selectClientMeetingReminders, type ClientMeetingReminderBooking } from "@/lib/client-meeting-reminders";
import { normalizeTime } from "@/lib/coffee-chat";
import { formatOrgDate } from "@/lib/date";

// Always run fresh; this reads the clock and the database.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // An unset secret must never authenticate ("Bearer undefined").
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  // Vercel cron is UTC-only, so two schedules fire; only the one landing in 8am Pacific does work.
  if (!isInterviewReminderHour(now)) return Response.json({ skipped: "not 8am Pacific" });

  const today = formatOrgDate(now);
  const tomorrow = formatOrgDate(new Date(now.getTime() + 24 * 60 * 60 * 1000));

  const supabase = createAdminClient();
  const { data: slots, error: slotsError } = await supabase
    .from("client_meeting_slots")
    .select("id, date, start_time, end_time")
    .in("date", [today, tomorrow]);
  if (slotsError) return Response.json({ error: slotsError.message }, { status: 500 });
  if (!slots || slots.length === 0) return Response.json({ sent: 0, failed: 0 });
  const slotsById = new Map(slots.map((s) => [s.id, s]));

  const { data: bookingRows, error: bookingsError } = await supabase
    .from("client_meetings")
    .select(
      "id, slot_id, status, contact_name, email, manage_token, meeting_url, reminder_day_before_sent_at, reminder_morning_sent_at",
    )
    .eq("status", "confirmed")
    .in("slot_id", [...slotsById.keys()]);
  if (bookingsError) return Response.json({ error: bookingsError.message }, { status: 500 });

  const bookings: ClientMeetingReminderBooking[] = (bookingRows ?? []).flatMap((b) => {
    const slot = slotsById.get(b.slot_id);
    if (!slot) return [];
    return [
      {
        id: b.id,
        status: b.status,
        contactName: b.contact_name,
        email: b.email,
        meetingUrl: b.meeting_url,
        manageToken: b.manage_token,
        date: slot.date,
        startTime: normalizeTime(slot.start_time),
        endTime: normalizeTime(slot.end_time),
        reminderDayBeforeSentAt: b.reminder_day_before_sent_at,
        reminderMorningSentAt: b.reminder_morning_sent_at,
      },
    ];
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  let sent = 0;
  let failed = 0;
  for (const reminder of selectClientMeetingReminders({ today, tomorrow, bookings })) {
    const column = reminder.kind === "day_before" ? "reminder_day_before_sent_at" : "reminder_morning_sent_at";
    const stamp = (value: string | null) =>
      reminder.kind === "day_before" ? { reminder_day_before_sent_at: value } : { reminder_morning_sent_at: value };

    // Claim the reminder first (only one concurrent run can win the null -> now update), so a retried
    // invocation can't send it twice. If the send then fails, release the claim so it can be retried.
    const { data: claimed, error: claimError } = await supabase
      .from("client_meetings")
      .update(stamp(new Date().toISOString()))
      .eq("id", reminder.bookingId)
      .is(column, null)
      .select("id");
    if (claimError || !claimed || claimed.length === 0) continue;

    const email = buildClientMeetingReminderEmail({
      kind: reminder.kind,
      contactName: reminder.contactName,
      date: reminder.date,
      startTime: reminder.startTime,
      endTime: reminder.endTime,
      manageToken: reminder.manageToken,
      meetingUrl: reminder.meetingUrl,
      siteUrl,
    });
    try {
      await sendEmail({ to: reminder.to, ...email });
      sent++;
    } catch (err) {
      failed++;
      console.error(`client meeting reminder (${reminder.kind}) to ${reminder.to} failed:`, err);
      await supabase.from("client_meetings").update(stamp(null)).eq("id", reminder.bookingId);
    }
  }

  return Response.json({ sent, failed });
}
