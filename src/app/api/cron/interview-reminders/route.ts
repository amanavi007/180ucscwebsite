import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { buildInterviewReminderEmail } from "@/lib/email/interview-emails";
import { isInterviewReminderHour, selectInterviewReminders, type ReminderBooking } from "@/lib/interview-reminders";
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
    .from("interview_slots")
    .select("id, date, start_time, end_time")
    .in("date", [today, tomorrow]);
  if (slotsError) return Response.json({ error: slotsError.message }, { status: 500 });
  if (!slots || slots.length === 0) return Response.json({ sent: 0, failed: 0 });
  const slotsById = new Map(slots.map((s) => [s.id, s]));

  const { data: bookingRows, error: bookingsError } = await supabase
    .from("interview_bookings")
    .select(
      "id, slot_id, status, applicant_name, applicant_email, manage_token, reminder_day_before_sent_at, reminder_morning_sent_at",
    )
    .eq("status", "confirmed")
    .in("slot_id", [...slotsById.keys()]);
  if (bookingsError) return Response.json({ error: bookingsError.message }, { status: 500 });

  const bookings: ReminderBooking[] = (bookingRows ?? []).flatMap((b) => {
    const slot = slotsById.get(b.slot_id);
    if (!slot) return [];
    return [
      {
        id: b.id,
        status: b.status,
        applicantName: b.applicant_name,
        applicantEmail: b.applicant_email,
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
  for (const reminder of selectInterviewReminders({ today, tomorrow, bookings })) {
    const column = reminder.kind === "day_before" ? "reminder_day_before_sent_at" : "reminder_morning_sent_at";
    const stamp = (value: string | null) =>
      reminder.kind === "day_before" ? { reminder_day_before_sent_at: value } : { reminder_morning_sent_at: value };

    // Claim the reminder first (only one concurrent run can win the null -> now update), so a retried
    // invocation can't send it twice. If the send then fails, release the claim so it can be retried.
    const { data: claimed, error: claimError } = await supabase
      .from("interview_bookings")
      .update(stamp(new Date().toISOString()))
      .eq("id", reminder.bookingId)
      .is(column, null)
      .select("id");
    if (claimError || !claimed || claimed.length === 0) continue;

    const email = buildInterviewReminderEmail({
      kind: reminder.kind,
      applicantName: reminder.applicantName,
      date: reminder.date,
      startTime: reminder.startTime,
      endTime: reminder.endTime,
      manageToken: reminder.manageToken,
      siteUrl,
    });
    try {
      await sendEmail({ to: reminder.to, ...email });
      sent++;
    } catch (err) {
      failed++;
      console.error(`interview reminder (${reminder.kind}) to ${reminder.to} failed:`, err);
      await supabase.from("interview_bookings").update(stamp(null)).eq("id", reminder.bookingId);
    }
  }

  return Response.json({ sent, failed });
}
