# Client Meeting Scheduling — Design Spec

Date: 2026-10-06

## Purpose

Businesses interested in our consulting services book an intro meeting with
a fixed panel of three execs. Coffee chat (`2026-09-28-coffee-chat-scheduling-design.md`)
and interview (`2026-10-06-interview-scheduling-design.md`) scheduling are
the model: execs enter availability, slots are generated, the public books
with no login. Client meetings differ in these ways:

- **Fixed panel of exactly 3 execs**, chosen by an admin (today: Aman,
  Sudheeksha, Devarsh; for generic roles: DOP, DOE, President). Only panel
  execs enter availability. **All 3 attend every meeting**, so a slot exists
  only where all 3 are free at once.
- **Open to any business.** No allowlist; Turnstile on every booking.
- **30-minute video calls** on the :00/:30 grid. There is no location.
- **Meeting link is added manually** by a panel exec or admin after booking.
- **Booking rules:** no booking within 24 hours of the slot; client
  self-cancel/reschedule until 12 hours before.
- **One active booking per email.**
- Panel execs are **not** blocked from a coffee chat or interview at the
  same time; the features are independent.

**Success looks like:** an admin picks the panel, the three execs enter
availability, slots are generated and published, a business books at
`/services/book` without help, an exec adds the meeting link, and all three
see the meeting in their calendar app automatically.

## Architecture

Same trust model as coffee chat and interviews. Exec/admin actions use the
authenticated server client with RLS gated on `is_exec()`. Client actions
have no session and use `createAdminClient()` (service role); all validation
(email format, slot open, lead time, Turnstile) happens in the action before
any write. There is no `anon` RLS policy.

New `client_meeting_*` tables run parallel to `interview_*` rather than
generalizing them: the rules differ in nearly every field and the existing
features are tested and working. Generic pure helpers are reused from
`src/lib/coffee-chat.ts` (`normalizeTime`, `formatTimeRange`, `overlaps`,
`timeToMinutes`) and `src/lib/date.ts` (`zonedDateTimeToUtc`,
`ORG_TIME_ZONE`). Email and ICS builders follow the interview ones.
Slot generation is new but far simpler than interviews: the panel is always
the same 3 people, so there is no panel splitting or balancing.

## Data model

Migration `supabase/migrations/<timestamp>_client_meeting_scheduling.sql`.
All tables: RLS enabled, one `for all to authenticated using (is_exec())
with check (is_exec())` policy.

### `org_settings` additions
- `client_meeting_panel`: JSON array of exactly 3 profile ids. Empty by
  default; booking is unavailable until a valid panel is set.
- `client_meeting_booking_open` (`'false'` default): pauses the public page.
- `client_meeting_slot_minutes` (`'30'`).

Changing the panel does not alter existing slots or bookings. Existing
availability rows of removed execs are ignored by generation.

### `client_meeting_availability`
`id, exec_id → profiles on delete cascade, date, start_time, end_time,
created_at`, check `end_time > start_time`, indexes on date and exec_id.
Writable only for panel execs (enforced in the action).

### `client_meeting_slots`
`id, date, start_time, end_time, published boolean default false,
created_at, updated_at` (reuse `set_updated_at`), check
`end_time > start_time`, index on date. No exec join table: the panel is
the setting. A slot snapshots nothing; bookings record who the panel was
(below) so later panel changes do not rewrite history.

### `client_meetings` (bookings)
`id, slot_id → client_meeting_slots on delete cascade, contact_name,
business_name, email (lowercased), phone nullable, needs text (not null,
length-capped), panel_exec_ids uuid[] (snapshot of the 3 execs at booking
time), meeting_url text nullable, status ('confirmed' | 'cancelled'),
manage_token text unique, reminder_day_before_sent_at,
reminder_morning_sent_at timestamptz, created_at, cancelled_at`.

Partial unique indexes give race-proof enforcement:
- `unique (slot_id) where status = 'confirmed'`
- `unique (email) where status = 'confirmed'`

Constants in `src/lib/client-meeting.ts`:
`CLIENT_MEETING_GRID_MINUTES = 30`, `CLIENT_MEETING_MIN_LEAD_MINUTES = 1440`
(24h), `CLIENT_MEETING_CANCEL_CUTOFF_MINUTES = 720` (12h).

## Slot generation (`src/lib/client-meeting.ts`, pure, unit-tested)

Input: the 3 panel exec ids, availability blocks, existing slots, slot
length (30). Output: new slot date/time ranges.

1. For each date, intersect the three execs' blocks.
2. Candidate starts are every :00/:30 where `[start, start + 30)` fits
   entirely inside the intersection.
3. Skip any candidate overlapping an existing slot.
4. Deterministic output, chronological.

Generation is a no-op (with a clear message) if the panel is not exactly 3
valid execs. Slots are created unpublished; an admin publishes per slot or
all at once, and may unpublish or delete (deleting a slot with a confirmed
booking is blocked; cancel the booking first).

## Booking rules (pure, unit-tested)

`isClientMeetingBookable`: slot published, no confirmed booking, starts at
least 24h from now, panel valid. `canClientCancel`: until exactly 12h before
start. Reschedule is cancel + new booking (same manage link flow as
interviews). The new booking starts with `meeting_url` copied from the old
one, so a standing link carries over.

## Public flow

Page `/services/book` (`src/app/(marketing)/services/book/`), linked from the
services pages. Shows published, bookable slots grouped by date. Form
fields: contact name, business name, email, optional phone, "what do you
need help with" (required, capped). Turnstile on every attempt. On success,
a confirmation view with add-to-calendar (ICS) and the manage link.

Manage page `/services/book/manage/[token]`: view booking, cancel (until
12h before), reschedule. Past the cutoff the page shows how to contact us.

Errors: slot taken (unique violation) → friendly "just booked, pick another";
active booking exists for that email → direct them to their manage link
email; booking paused → closed message.

Admin pause toggle (`client_meeting_booking_open`) hides slots and rejects
bookings server-side.

## Meeting link

`meeting_url` is nullable. Any panel exec or admin sets or edits it from
the Bookings tab. Validation: `https://` URL, capped length. Setting or
changing it emails the client the new link. Until set, the client
confirmation and reminders say the link will be sent before the meeting.
Exec booked emails and the bell flag bookings still missing a link, and the
Bookings tab highlights them. A reminder email to the client includes the
link when present.

## Emails

Through the existing `sendEmail`, builders in
`src/lib/email/client-meeting-emails.ts` (unit-tested):

- **Client:** confirmation, link-added/changed, day-before and morning-of
  reminders, self-cancel receipt (not sent when the cancel is the first
  half of a reschedule), admin-cancel notice.
- **Execs (all 3 on the booking's panel snapshot):** booked and cancelled,
  with business, contact name/email/phone, the needs note, date/time, link
  status, and the other panel members.

Reminders: `GET /api/cron/client-meeting-reminders`, protected by
`CRON_SECRET` like `/api/cron/interview-reminders`, with the same
dual-UTC schedule in `vercel.json` and org-local 8:00am guard. Day-before
and morning-of columns are stamped per send so retries cannot double-send;
one failed send is logged and does not stop the rest. Cancelled bookings get
none; a booking made after the day-before window skips that reminder.

## Exec notifications and calendar

- **Bell:** computed entries in `src/lib/data/notifications.ts` for client
  meetings booked, cancelled, and awaiting a link, for panel members.
- **Calendar feed:** `buildExecFeed` (`src/lib/calendar-feed.ts`) also emits
  confirmed client meetings for execs on the booking's panel, with a stable
  UID per booking so cancellations drop events. Title names the business;
  description includes contact, needs, and the meeting link. The feed URL
  is unchanged.

## Admin UI

New portal page `admin/client-meetings` (exec/admin gated like the others),
tabs:
1. **Panel & settings:** pick the 3 panel execs, booking on/off, a capacity
   line ("N open slots").
2. **Availability:** each panel exec manages their own blocks.
3. **Slots:** generate, publish/unpublish (per slot and all), delete.
4. **Bookings:** all bookings with business, contact, needs, status, a
   meeting-link editor, and admin cancel.

## Security / abuse

- Turnstile and email format check on every booking; server-side validation
  of lead time, slot state and panel before any write.
- Input lengths capped; needs text rendered escaped everywhere, including
  emails and ICS.
- One active booking per email and manage links only sent to that address
  bound the damage of a spoofed email. Known tradeoff: open booking can be
  spammed; Turnstile is the control, and an admin can pause booking.
- RLS stays exec-only on all new tables.

## Other changes

- Link `/services/book` from the services pages (exact placement at
  implementation).
- Regenerate `src/lib/supabase/database.types.ts`.
- New env vars: none beyond existing (`CRON_SECRET`, Turnstile, email).

## Testing

Vitest in `src/lib/client-meeting.test.ts` and the email/reminder helpers:
- Generation: 3-way intersection, :30 starts, partial overlaps, existing
  slot avoidance, invalid panel, determinism.
- Bookability: 24h lead, published, unbooked, panel valid.
- Cancel cutoff at exactly 12h.
- Reschedule keeps `meeting_url`.
- Meeting-link validation.
- Reminder selection: tomorrow/today windows, already sent, cancelled, hour
  guard in a summer and a winter date.
- Email builders: each client email and the exec emails.

Manual browser verification of the full flow (set panel → availability →
generate → publish → book as a client → second booking same email rejected
→ add meeting link → manage → cancel → feed shows/updates the event) before
calling it done.

## Explicitly out of scope

- Auto-generated Zoom/Meet links.
- Per-client invite links or allowlists.
- Multiple panels or per-service panels.
- Client choice of duration or in-person.
- Exec reminder emails, no-show tracking.
- A shared abstraction over coffee chat, interviews and client meetings.
