# Coffee Chat Scheduling — Design Spec

Date: 2026-09-28

## Purpose

180DC UCSC's recruitment cycle includes coffee chats: casual in-person
conversations between an applicant and (ideally) two exec members. Today
there's no way to schedule these except manually — Calendly's free tier
doesn't cover multi-host bookings. This feature replaces that gap with a
purpose-built scheduler, embedded directly in the marketing site, that:

- lets exec input when they're free, then auto-generates bookable slots
  pairing available exec together (with a manual override),
- lets applicants — no login, no account — browse open slots and book one
  with just their name and UCSC email,
- confirms the booking on-screen and by email, with calendar-add links,
  and lets the applicant cancel/reschedule themselves via a private link.

Interview scheduling is a likely follow-up but is explicitly out of scope
here — it has different rules (likely 1 exec not 2, longer duration, case
exercises) that aren't known yet, and building a premature shared
abstraction risks getting those wrong. This spec covers coffee chats only;
interview scheduling will be its own future spec.

**Success looks like:** exec can input their availability once, publish
slots with a couple clicks, and then not have to touch it again until an
applicant needs to be swapped or a slot manually adjusted. Applicants can
book a slot in under a minute without creating an account.

## Architecture

Every mutation in this codebase already goes through Next.js Server
Actions using a server-side Supabase client (see `src/actions/*.ts`) —
there is no precedent for anonymous-writer RLS policies anywhere in this
app. This feature keeps that convention rather than introducing a new
trust boundary:

- **Exec-side actions** (manage availability, generate/publish slots, swap
  an exec on a slot, manually cancel a booking) use the normal
  authenticated server client and RLS gated on `is_exec()` — identical to
  how Room Bookings and Meeting Days work today. Any exec can view and
  manage the whole feature; there's no finer sub-role (e.g. "recruitment
  lead") anywhere else in this app, so none is introduced here.
- **Applicant-side actions** (list open slots, create a booking, cancel or
  reschedule by token) have no session, so they use the existing
  `createAdminClient()` service-role client (`src/lib/supabase/admin.ts`,
  currently used only for bulk account creation/password resets). All
  validation — UCSC email format, slot still open, duplicate-booking
  check, Turnstile verification — happens in the action, server-side,
  before any write. RLS on the new tables only grants `authenticated` +
  `is_exec()`; the public flow bypasses RLS by using the service-role
  client, not by opening a policy to `anon`.
- One new **route handler** (not a Server Action): `GET
  /api/coffee-chat/[token]/calendar.ics`. This is the first API route in
  the app, needed because a confirmation email's "add to calendar" link
  must be a plain clickable URL, not something that can invoke a form
  post. It's read-only and token-gated (same `manage_token` used for
  cancel/reschedule).

## Data model

Four new tables plus two `org_settings` keys, following the conventions
of `room_bookings` / `meeting_dates` / `org_events`.

### `coffee_chat_availability`

Raw exec input — the blocks of time an exec is personally free.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| exec_id | uuid | references `profiles(id)` on delete cascade |
| date | date | |
| start_time | time | |
| end_time | time | |
| created_at | timestamptz | |

RLS: `authenticated` + `is_exec()` for all operations (blanket exec
access, no per-row ownership restriction — matches the rest of the app).

### `coffee_chat_slots`

The generated, bookable units. Produced by the "Generate Slots" admin
action; independently editable afterward (swap, manual add/remove).

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| date | date | |
| start_time | time | |
| end_time | time | |
| location | text | defaults from `org_settings` |
| exec_id_1 | uuid | references `profiles(id)`, not null |
| exec_id_2 | uuid | references `profiles(id)`, nullable (odd-exec-out fallback) |
| created_at / updated_at | timestamptz | |

RLS: `authenticated` + `is_exec()` for all operations.

**Slot generation algorithm:** chunk each exec's availability into
fixed-length windows (default 20 minutes, configurable via
`org_settings`) aligned to a shared grid (e.g. :00/:20/:40) so overlaps
line up. For each window, collect every exec free then and greedily pair
them two at a time — 4 execs free at 2:00pm produces 2 parallel slots at
2:00pm with distinct pairs; an odd exec out either goes unpaired
(`exec_id_2` null, flagged in the admin UI for manual attention) or is
left for the admin to pair by hand via swap.

Re-running generation only creates/updates slots that have no confirmed
booking — it never touches a slot that's already booked.

**Swap:** for any slot (booked or not — see Usability notes), admin can
replace `exec_id_1` or `exec_id_2` with any exec whose
`coffee_chat_availability` overlaps that slot's time window and who isn't
already assigned to a *different* slot at that same time. This is
enforced in the server action, not a DB constraint, consistent with how
business rules elsewhere in this codebase live in the action layer.

### `coffee_chat_bookings`

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| slot_id | uuid | references `coffee_chat_slots(id)` on delete cascade |
| applicant_name | text | not null |
| applicant_email | text | not null, validated as `@ucsc.edu` server-side |
| status | text | `confirmed` \| `cancelled` |
| manage_token | text | unique, random — powers the no-login manage/cancel link |
| created_at | timestamptz | |
| cancelled_at | timestamptz | nullable |

Two partial unique indexes do the real enforcement work:

- `unique (slot_id) where status = 'confirmed'` — enforces one applicant
  per slot, including under a race (two applicants clicking the same slot
  at once): the loser's insert fails the constraint and the action
  returns "that slot was just taken, pick another" instead of needing
  explicit row locking.
- `unique (applicant_email) where status = 'confirmed'` — enforces one
  active booking per applicant. If someone who already has a confirmed
  booking tries to book again, the action instead returns their existing
  booking + manage link.

RLS: `authenticated` + `is_exec()` for all operations (admin dashboard
reads/writes this directly); the public flow only ever touches it via the
service-role client in a Server Action.

### `org_settings` additions

- `coffee_chat_booking_open` — boolean toggle so exec can pause the
  public page without a deploy.
- `coffee_chat_default_location` — string, prefilled into new slots.

## Applicant-facing flow

New page(s) under the marketing `/apply` area (e.g. `/apply/coffee-chat`),
no login required, built with the existing marketing design system (see
Usability & UI notes below).

1. **Browse.** Open slots grouped by date, each showing time and location
   only — exec names are not shown pre-booking, to keep the picker simple
   and avoid any appearance of applicants picking a favorite. If no slots
   are open (none generated yet, or `coffee_chat_booking_open` is off),
   show a friendly "check back soon" state.
2. **Book.** Applicant picks a slot, enters name + UCSC email, completes a
   Turnstile challenge, and submits. The Server Action re-validates
   everything server-side (slot still open, email domain, no existing
   active booking, min lead time — see below, Turnstile token) before
   writing.
3. **Confirm.** On success: an on-screen confirmation (the source of
   truth — doesn't depend on email deliverability) showing date, time,
   location, and the manage link. A confirmation email is also sent via
   Resend with the same details, a Google Calendar "add event" link (URL
   template, no API needed), the `.ics` download link, and the manage
   link.
4. **Manage.** `/apply/coffee-chat/manage/[token]` shows the current
   booking with **Cancel** (frees the slot immediately) and **Reschedule**
   (cancels the current booking and drops them back into the slot picker,
   prefilled with their name/email, to book a new one — no separate
   reschedule flow to build).

**Minimum booking lead time:** slots starting within the next 2 hours
(configurable) are excluded from the public list, so exec aren't
blindsided by a walk-in with no notice.

## Admin-facing flow

New "Coffee Chats" section under `src/app/portal/(app)/admin`, exec-only
(`is_exec()`), alongside the existing Rooms/Meeting Days/Team Builder
admin pages:

1. **My Availability** — each exec adds/removes their own blocks of free
   time (date + time range).
2. **Slots** — "Generate Slots" runs the pairing algorithm; the resulting
   list shows date/time/location/paired-exec per slot with a swap control
   on each, and a filter to show just the current exec's own slots ("My
   slots" — the one optional addition included in this iteration).
   Publish/unpublish per slot or in bulk.
3. **Bookings** — table of all bookings (confirmed/cancelled) with
   applicant name/email and a manual cancel action for edge cases.

## Usability notes worth calling out

- **Exec notifications, reusing existing infrastructure.** The
  notifications bell (`src/lib/data/notifications.ts`) already works by
  computing a feed from existing tables on read, with no write-on-event
  log. This feature adds two more computed entries to that same feed: "a
  coffee chat you're on this week" when a slot gets booked, and "your
  applicant cancelled" when one does — no new infrastructure needed.
- **Swap works on already-booked slots, not just open ones.** Useful for
  day-of emergencies (an assigned exec gets sick). Because applicants
  never see exec names pre-booking, swapping the exec on a booked slot is
  invisible to the applicant — no awkward "your host changed" notice
  needed.
- **Apply page copy.** The current "How recruitment works" section on
  `/apply` jumps straight from "Submit application" to "Interview with
  our team," with no mention of coffee chats. This will be updated to
  include a coffee chat step (or a note) so the applicant-facing flow
  makes sense end to end. Copy exact wording TBD at implementation time,
  matched to whatever the actual recruitment sequence is.

## Email delivery

- **Provider:** Resend (new dependency + `RESEND_API_KEY` env var). Needs
  a sending domain verified before real launch; Resend's shared test
  domain can be used for development.
- **Content:** booking confirmation only, for this iteration. Reminder
  emails (e.g. 24 hours before) are explicitly out of scope — they'd
  require a scheduled job (Vercel Cron or `pg_cron`), which is real
  infrastructure this spec doesn't need yet and wasn't requested.

## Security / abuse prevention

This is the app's first fully public, anonymous write path — reachable by
anyone on the internet, not just UCSC students. Mitigations:

- **UCSC email domain check** (`@ucsc.edu`), enforced server-side.
- **Cloudflare Turnstile** on the booking form (free tier) — requires
  signing up for a Turnstile site key and adding it as an env var before
  launch.
- **RLS stays exec-only** on all four tables; the public flow only ever
  reaches them through server-side Actions using the service-role client,
  never a client-exposed key.
- **Rate limiting:** not building a dedicated rate limiter for this
  iteration — Turnstile plus the email-domain/dedupe checks are judged
  sufficient for a low-traffic club form. Revisit if actual abuse shows
  up.

## UI

The public booking pages must visually match the existing marketing site
(same components — `mint-panel` cards, `Button`, `Accordion`, existing
typography/spacing conventions from `src/components/marketing`) rather
than looking like a bolted-on tool. The admin pages follow the existing
portal admin look (same pattern as Rooms/Meeting Days). The
frontend-design skill will be used when implementing these pages.

## Testing

- Unit/integration coverage (via the existing Vitest setup) for the parts
  with real logic: the slot-generation/pairing algorithm (including the
  odd-exec-out and multiple-parallel-slots cases), the swap eligibility
  check, and the two partial-unique-index race conditions (double-book
  the same slot, double-book the same applicant).
- Manual verification of the full applicant flow (book → confirm email →
  add to calendar → manage link → cancel/reschedule) and the full admin
  flow (input availability → generate → swap → publish) in a real
  browser before calling this done, per this project's UI verification
  standard.

## Explicitly out of scope for this iteration

- Interview scheduling (future, separate spec).
- Reminder emails / any scheduled job.
- No-show tracking.
- A generic "session type" abstraction shared between coffee chats and
  future interview scheduling.
