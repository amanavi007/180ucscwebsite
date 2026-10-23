import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { buildAttendanceReminderEmail } from "@/lib/email/attendance-reminder";
import { isReminderHour, selectReminders, type ReminderLead } from "@/lib/attendance-reminders";
import { formatOrgDate } from "@/lib/date";
import { fetchInChunks } from "@/lib/paginate";

// Always run fresh; this reads the clock and the database.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // An unset secret must never authenticate ("Bearer undefined").
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  // Vercel cron is UTC-only, so two schedules fire; only the one landing in 9pm Pacific does work.
  if (!isReminderHour(now)) return Response.json({ skipped: "not 9pm Pacific" });

  const supabase = createAdminClient();
  const today = formatOrgDate(now);

  const { data: quarter, error: quarterError } = await supabase
    .from("quarters")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();
  if (quarterError) return Response.json({ error: quarterError.message }, { status: 500 });
  if (!quarter) return Response.json({ skipped: "no active quarter" });

  const { data: meetingRows, error: meetingError } = await supabase
    .from("meeting_dates")
    .select("date")
    .eq("quarter_id", quarter.id)
    .eq("date", today);
  if (meetingError) return Response.json({ error: meetingError.message }, { status: 500 });
  if (!meetingRows.length) return Response.json({ skipped: "not a meeting day" });

  const { data: projectRows, error: projectError } = await supabase
    .from("projects")
    .select("id, client_name")
    .eq("quarter_id", quarter.id)
    .neq("status", "archived");
  if (projectError) return Response.json({ error: projectError.message }, { status: 500 });
  const projectIds = projectRows.map((p) => p.id);
  if (!projectIds.length) return Response.json({ sent: 0, failed: 0 });

  let sessionRows, leadRows;
  try {
    [sessionRows, leadRows] = await Promise.all([
      fetchInChunks(projectIds, (chunk, from, to) =>
        supabase.from("attendance_sessions").select("project_id").eq("date", today).in("project_id", chunk).order("id").range(from, to),
      ),
      fetchInChunks(projectIds, (chunk, from, to) =>
        supabase
          .from("memberships")
          .select("project_id, profiles(email, archived_at)")
          .in("team_role", ["pm", "sc"])
          .in("project_id", chunk)
          .order("id")
          .range(from, to),
      ),
    ]);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not load attendance data" }, { status: 500 });
  }

  const leads: ReminderLead[] = leadRows.map((row) => {
    // The embedded relation is a single profile row (user_id is a many-to-one FK).
    const profile = row.profiles as unknown as { email: string; archived_at: string | null } | null;
    return { projectId: row.project_id, email: profile?.email ?? null, archivedAt: profile?.archived_at ?? null };
  });

  const reminders = selectReminders({
    today,
    meetingDates: [today],
    projects: projectRows.map((p) => ({ id: p.id, name: p.client_name })),
    loggedProjectIds: sessionRows.map((s) => s.project_id),
    leads,
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  let sent = 0;
  let failed = 0;
  for (const reminder of reminders) {
    const email = buildAttendanceReminderEmail({
      projectName: reminder.projectName,
      date: reminder.date,
      siteUrl,
    });
    try {
      await sendEmail({ to: reminder.to, ...email });
      sent++;
    } catch (err) {
      failed++;
      console.error(`attendance reminder to ${reminder.to} for ${reminder.projectName} failed:`, err);
    }
  }

  return Response.json({ sent, failed });
}
