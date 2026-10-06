# Interview Scheduling — Design Spec

Date: 2026-10-06

## Purpose

Interviews are for applicants we reach out to, not an open booking. Coffee
chat scheduling (see `2026-09-28-coffee-chat-scheduling-design.md`) is the
model: execs enter availability, slots are generated, applicants book with
no login. Interview scheduling differs in these ways:

- **Invite-only.** Admins maintain a list of invited UCSC emails; only those
  emails can book.
- **Panels of 2 or 3 execs**, never fewer than 2. When 4 execs are free at
  once, make two panels of 2 rather than one of 4.
- **Fixed 60-minute slots at the SnE Library**, no location choice.
- **Starts on the :00 and :30 grid.**
- **Booking rules:** no booking within 12 hours of the slot; applicant
  self-cancel/reschedule until 24 hours before.
- **Reminder emails** to applicants, and booked/cancelled emails to the
  panel (naming the applicant and the other panel members).
- Execs are **not** blocked from holding a coffee chat and an interview at
  the same time; the two features are independent.

**Success looks like:** an admin pastes the invitee list, execs enter
availability, slots are generated and published, invitees book without
help, and execs see interviews in their calendar app automatically.

## Architecture

Same trust model as coffee chat. Exec/admin actions use the authenticated
server client with RLS gated on `is_exec()`. Applicant actions have no
session and use `createAdminClient()` (service role); all validation
(allowlist, email format, slot open, lead time, Turnstile) happens in the
action before any write. There is no `anon` RLS policy.

New `interview_*` tables run parallel to `coffee_chat_*` rather than
generalizing them. The rules differ enough (variable panel size, allowlist,
fixed location, different lead/cutoff) that sharing tables would add
branching. Pure helpers that are already generic are reused from
`src/lib/coffee-chat.ts` (`normalizeTime`, `formatTimeRange`, `overlaps`,
`isValidUcscEmail`, `timeToMinutes`) and `src/lib/date.ts`
(`zonedDateTimeToUtc`, `ORG_TIME_ZONE`). Slot generation is new code.

## Data model

Migration `supabase/migrations/20261006000001_interview_scheduling.sql`.
All tables: RLS enabled, one `for all to authenticated using (is_exec())
with check (is_exec())` policy.

### `interview_invitees`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| email | text | not null, stored lowercased/trimmed, unique |
| name | text | nullable |
| created_at | timestamptz | |

"Has booked" is derived from `interview_bookings`, not stored.

### `interview_availability`
Same shape as `coffee_chat_availability`: `id, exec_id → profiles on
delete cascade, date, start_time, end_time, created_at`, check
`end_time > start_time`, indexes on date and exec_id.

### `interview_slots`
`id, date, start_time, end_time, published boolean default false,
created_at, updated_at` (reuse `set_updated_at` trigger), check
`end_time > start_time`, index on date.

### `interview_slot_execs`
`slot_id → interview_slots on delete cascade, exec_id → profiles on delete
cascade, primary key (slot_id, exec_id)`. A join table because panels are 2
or 3 execs. The 2–3 bound is enforced in the actions and in
`isInterviewSlotBookable` (needs ≥ 2), consistent with how business rules
live in the action layer elsewhere.

### `interview_bookings`
`id, slot_id → interview_slots on delete cascade, applicant_name,
applicant_email (lowercased), status ('confirmed' | 'cancelled'),
manage_token text unique, reminder_day_before_sent_at timestamptz,
reminder_morning_sent_at timestamptz, created_at, cancelled_at`.

Partial unique indexes do the race-proof enforcement:
- `unique (slot_id) where status = 'confirmed'`
- `unique (applicant_email) where status = 'confirmed'`

### `org_settings` additions
- `interview_booking_open` (`'false'` default): pauses the public page.
- `interview_slot_minutes` (`'60'`): slot length used by generation.

Constants in `src/lib/interview.ts`: `INTERVIEW_LOCATION = "SnE Library"`,
`INTERVIEW_GRID_MINUTES = 30`, `INTERVIEW_MIN_LEAD_MINUTES = 720` (12h),
`INTERVIEW_CANCEL_CUTOFF_MINUTES = 1440` (24h).

## Slot generation (`src/lib/interview.ts`, pure, unit-tested)

Input: availability blocks, existing slots, slot length (60). Output:
slots, each with 2–3 exec ids.

1. Candidate start times are every :00/:30 within each exec's block such
   that `[start, start + 60)` fits entirely inside the block.
2. Process start times chronologically. For each, the pool is every exec
   whose block covers the full window and who is not already on a slot
   (existing or created earlier in this run) that overlaps the window. An
   exec can never be on two overlapping slots.
3. Split the pool by size n: n < 2 → none; n = 2 → one slot of 2; n = 3 →
   one slot of 3; n even → n/2 slots of 2; n odd → (n−3)/2 slots of 2 plus
   one of 3. (4 → 2+2, 5 → 2+3, 6 → 2+2+2, 7 → 2+2+3.) No exec is left solo
   in a window.
4. Balance as coffee chat does: least-loaded execs are placed first and
   pairs that have met least are preferred; deterministic tie-breaking by
   id.

Because greedy generation uses everyone free at the earliest start, a :30
start only appears where exec availability is offset. Parallel panels are
not staggered. Re-running generation never touches slots that have a
confirmed booking.

**Swap** (booked or not): replace one exec with another whose availability
covers the slot and who is not on an overlapping interview slot; or add an
exec (max 3) or remove one (min 2). Enforced in the action.

## Applicant-facing flow

Pages under `src/app/(marketing)/apply/interview/`, styled like the coffee
chat pages (same marketing components).

1. **Browse.** Published, unbooked slots with ≥ 2 execs, starting at least
   12 hours from now, grouped by date. Each shows date, time and "SnE
   Library". Exec names are not shown. Slot times are not sensitive, so the
   list is public; the gate is at booking.
2. **Book.** Pick a slot, enter name + UCSC email, pass Turnstile. The
   server action lowercases the email, then checks in order: name present,
   UCSC email format, Turnstile, **email is in `interview_invitees`**, slot
   still open, no existing confirmed booking for that email. A non-invited
   email gets "This booking page is for invited applicants. Contact us if
   you think this is a mistake." (nothing about who is on the list). An
   existing booking never returns the manage token; it points to the
   confirmation email, same as coffee chat.
3. **Confirm.** On-screen confirmation plus a confirmation email (Google
   Calendar link, `.ics` download, manage link).
4. **Manage.** `/apply/interview/manage/[token]` shows the booking.
   **Cancel** and **Reschedule** (cancel + return to the picker prefilled)
   are available until 24 hours before the slot; inside 24 hours the page
   says to contact us and only an admin can cancel.

Calendar: `GET /api/interview/[token]/calendar.ics` (token-gated, read
only), mirroring the coffee chat route. Applicant calendar links are
one-time adds.

## Admin-facing flow

`src/app/portal/(app)/admin/interviews/`, exec-only, four tabs:

1. **Invitees.** Bulk paste (one per line: `email` or `email, name`;
   lowercased, deduplicated, non-UCSC addresses rejected with a message).
   Table shows each invitee as Booked (with slot) or Not booked, with
   remove. Removing someone who already booked leaves their booking intact
   and shows a warning. A capacity line: "N invitees, M open slots."
2. **Availability.** Each exec adds/removes their own free blocks.
3. **Slots.** Generate, swap/add/remove exec, publish/unpublish (per slot
   and all), delete, "My slots" filter.
4. **Bookings.** All bookings with applicant name/email, status, and an
   admin cancel.

## Exec notifications

- **Email** (reusing the exec booking/cancel email pattern in
  `src/lib/email/coffee-chat-confirmation.ts`) to every exec on the panel
  when a slot is booked or cancelled. Includes applicant name and email,
  date/time, location, and the other panel members' names.
- **Notifications bell:** computed entries in `src/lib/data/notifications.ts`
  for interviews booked/cancelled that involve the viewer, as for coffee
  chat.
- **Auto-updating calendar.** The existing signed per-exec feed
  (`buildExecFeed`, `src/lib/calendar-feed.ts`) is extended to also emit
  confirmed interviews, with a stable event UID per booking so calendar apps
  update or drop events on change. Each exec keeps one subscription for both
  coffee chats and interviews. Event title names the applicant; description
  names the other panel members. The feed URL keeps its coffee-chat path.

## Reminder emails

- New cron route `GET /api/cron/interview-reminders`, protected by
  `CRON_SECRET` exactly like `/api/cron/attendance-reminders`.
- `vercel.json` adds two schedules (UTC) so one lands at 8:00am Pacific in
  both PDT and PST (`0 15 * * *` and `0 16 * * *`); the route no-ops unless
  the org-local hour is 8.
- Each run emails applicants with a confirmed booking:
  - **Day before:** interviews tomorrow (org-local) where
    `reminder_day_before_sent_at` is null.
  - **Morning of:** interviews today where `reminder_morning_sent_at` is
    null.
  Each send stamps its column, so a Vercel retry cannot double-send. One
  failed send is logged and does not stop the rest.
- Content: date, time, SnE Library, manage link (with a note that
  cancelling closes 24h before). Sent through the existing `sendEmail`.
- A booking made after the day-before window simply skips that reminder.
- Known limit (same as attendance): on Vercel Hobby the cron may fire
  anywhere within its hour.
- Exec reminders are out of scope; execs have the calendar feed.

## Security / abuse

- Allowlist enforced server-side at booking; applicants never get a list or
  a hint of who is invited.
- UCSC email format check plus Turnstile on every booking attempt, which
  also limits probing the allowlist.
- Known tradeoff: the gate is email-only, so someone who knows an invitee's
  address could book as them. One active booking per email and manage links
  that go only to that address bound the damage. Invite links are a possible
  later hardening.
- RLS stays exec-only on all new tables.

## Other changes

- `/apply` "How recruitment works" copy updated to mention interviews are by
  invitation (exact wording at implementation, matched to the real
  sequence).
- `src/lib/supabase/database.types.ts` regenerated for the new tables.
- New env vars: none beyond what coffee chat and attendance reminders
  already use (`CRON_SECRET`, Turnstile, email provider).

## Testing

Vitest, in `src/lib/interview.test.ts` and the email/reminder helpers:
- Generation: group sizes for n = 1…7, :30 starts, no exec on overlapping
  slots, existing-slot busy handling, load/pair balancing, determinism.
- Swap eligibility including add/remove bounds (2–3).
- Bookability: 12h lead, published, unbooked, ≥ 2 execs.
- Cancel cutoff at exactly 24h.
- Allowlist: case-insensitivity, whitespace, non-invited, removed after
  booking.
- Reminder selection: tomorrow / today windows, already sent, cancelled,
  hour guard in a summer and a winter date.
- Email builders: applicant confirmation and reminder, exec booked/cancelled
  with panel names.

Manual browser verification of the full flow (paste invitees → availability
→ generate → publish → book as invitee → rejected as non-invitee → manage →
cancel → exec feed shows/updates the event) before calling it done.

## Explicitly out of scope

- Staggering parallel panels by 30 minutes.
- Invite links / per-invitee tokens.
- Exec reminder emails, no-show tracking.
- Applicant notification when an admin cancels or swaps a panel exec.
- A shared abstraction over coffee chat and interviews.
