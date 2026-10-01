# Attendance reminder emails

## Goal
Keep PMs/SCs on top of attendance. If a project has a meeting today and no attendance has been logged by 9pm Pacific, email that project's PM and SC leads a reminder.

## Trigger
- `vercel.json` defines two crons, `0 4 * * *` and `0 5 * * *` (UTC), both calling `GET /api/cron/attendance-reminders`.
- Vercel cron is UTC-only; 9pm Pacific is 04:00 UTC (PDT) or 05:00 UTC (PST). The route computes the current hour in `America/Los_Angeles` (`ORG_TIME_ZONE`) and no-ops unless it is 21, so exactly one run per day does work and DST is handled.
- The route requires `Authorization: Bearer $CRON_SECRET` (sent automatically by Vercel); otherwise 401.

## Logic (`src/lib/attendance-reminders.ts`, pure and unit-tested)
`findProjectsMissingAttendance` takes today's org-local date and data and returns the projects and leads to remind:
1. Stop if today is not in `meeting_dates`.
2. Take active projects in that quarter with no `attendance_sessions` row for today.
3. For each, load `memberships` with `team_role` in (`pm`, `sc`) and their profile emails; skip archived members.
4. The route sends each lead one email through the existing `sendEmail` (Gmail first, Resend fallback), linking to `/portal/attendance`. One failed send is logged and does not stop the rest.

## Data and config
- The route uses the service-role admin client (`src/lib/supabase/admin.ts`); there is no user session in a cron run.
- No new tables or migrations.
- New env var `CRON_SECRET`, documented in `.env.local.example`.

## Email
Short HTML + plain text, styled like `src/lib/email/coffee-chat-confirmation.ts`. Subject: `Reminder: log attendance for <project> (<date>)`.

## Testing
- Vitest for selection logic: not a meeting day, already logged, no leads, archived lead, multiple leads.
- Vitest for the hour guard on a winter and a summer date.
- Manual `curl` with the secret against the local dev server.

## Known limits
- Vercel Hobby may fire a cron anywhere within its hour, so the email arrives 9:00-9:59pm. Pro is exact.
- A Vercel retry of a failed invocation could send a duplicate. No sent-log table (YAGNI); about 30 lines to add if wanted.
