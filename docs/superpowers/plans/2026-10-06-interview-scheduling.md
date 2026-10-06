# Interview Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Invite-only interview booking: admins paste an invitee list, execs enter availability, 2–3-exec panel slots are generated on a :00/:30 grid, and only invited UCSC emails can book (60 min, SnE Library), with confirmation, reminder and exec/admin notification emails and an auto-updating exec calendar feed.

**Architecture:** New `interview_*` tables run parallel to `coffee_chat_*` (no shared abstraction). Pure, unit-tested logic lives in `src/lib/interview.ts`; exec/admin mutations are Server Actions on the authenticated client (RLS `is_exec()`); the anonymous applicant flow uses Server Actions on the service-role client and enforces the allowlist server-side. Reminders run from a Vercel cron route copied from the attendance-reminders pattern.

**Tech Stack:** Next.js 16 (App Router, Server Actions, route handlers), Supabase (Postgres + RLS), Vitest, Tailwind/shadcn components, nodemailer/Resend via `src/lib/email/send.ts`, Cloudflare Turnstile.

**Spec:** `docs/superpowers/specs/2026-10-06-interview-scheduling-design.md` (executors read it too). Existing model to mirror: `docs/superpowers/specs/2026-09-28-coffee-chat-scheduling-design.md`.

## Global Constraints

- `AGENTS.md`: this Next.js has breaking changes. Mirror the existing coffee chat files for every Next pattern (async `params: Promise<...>`, `"use server"`, route handlers); if you must deviate, read the relevant guide in `node_modules/next/dist/docs/` first.
- Slot length is **60 minutes** (`interview_slot_minutes` setting, default `60`); grid starts on **:00 and :30** (`INTERVIEW_GRID_MINUTES = 30`).
- Panels are **2 or 3 execs, never fewer than 2**. Group sizes for N free execs: 2→[2], 3→[3], 4→[2,2], 5→[2,3], 6→[2,2,2], 7→[2,2,3]. No parallel-panel staggering.
- An exec can never be on two overlapping interview slots. Execs are **not** checked against coffee chat slots.
- Location is the constant `"SnE Library"`; there is no location picker.
- Booking lead time **12 hours** (`INTERVIEW_MIN_LEAD_MINUTES = 720`): a slot starting less than 12h from now is not listed or bookable. Applicant self-cancel/reschedule cutoff **24 hours** (`INTERVIEW_CANCEL_CUTOFF_MINUTES = 1440`); inside it only an admin can cancel.
- Emails are lowercased and trimmed everywhere (invitees, bookings). Email format must pass `isValidUcscEmail` (`@ucsc.edu`).
- Non-invited email message, verbatim: `This booking page is for invited applicants. Contact us if you think this is a mistake.`
- Duplicate-booking path never returns or reveals the manage token.
- All dates/times use `ORG_TIME_ZONE` (`America/Los_Angeles`) via `src/lib/date.ts`; never `new Date("YYYY-MM-DD")`.
- Reminder cron: `/api/cron/interview-reminders`, schedules exactly `0 15 * * *` and `0 16 * * *` (UTC), runs only when org-local hour is 8, protected by `Authorization: Bearer $CRON_SECRET` (unset secret must 401).
- Admin cancel emails the applicant; exec swap emails nobody; self-cancel shows on-screen confirmation only; cancelled bookings never get reminders.
- Commits: **no Claude/Co-Authored-By attribution lines** (user memory rule `no_claude_signature_in_commits`). Commit messages are plain.
- Verification commands used throughout: `npx vitest run <file>`, `npx tsc --noEmit`, `npm run lint`.

## Review Focus

Failure modes the spec implies but a task's happy-path tests would not catch, most likely first (each is pinned by a test in the named task):

1. Invitee typed as `  Jane.Doe@UCSC.edu ` while stored as `jane.doe@ucsc.edu` must still match; pasted lists with blank lines, duplicates, tabs/semicolons, and non-UCSC addresses must not crash or add bad rows (Task 2 `parseInviteeList`/`normalizeInviteeEmail` tests).
2. :00 and :30 windows overlap, so a naive per-window generator would put one exec on 2:00 and 2:30 slots; generation must never do that, including against pre-existing slots (Task 2 generation tests).
3. Exactly-on-the-boundary behavior: slot exactly 12h away is bookable, 1 minute inside is not; exactly 24h before may self-cancel, 1 minute inside may not (Task 2 tests).
4. Reminder double-send / wrong recipients: cancelled bookings excluded, already-stamped bookings excluded, DST hour guard right in both summer and winter (Task 9 tests).
5. Removing an invitee who already booked must not cancel their booking, and an applicant whose booking was cancelled can book again (partial unique index is `where status = 'confirmed'`) (Task 1 migration review + Task 11 manual check).

## File Structure

Create:
- `supabase/migrations/20261006000001_interview_scheduling.sql`: five tables + settings rows.
- `src/lib/interview.ts` (+ `interview.test.ts`): constants, panel sizing, slot generation, bookability, cancel cutoff, swap eligibility, panel bounds, invitee parsing, settings parsing. Pure.
- `src/lib/interview-invite.ts` (+ test): Google Calendar URL, `.ics` for one booking, VEVENT lines for the exec feed.
- `src/lib/interview-reminders.ts` (+ test): hour guard and pure reminder selection.
- `src/lib/interview-feed.ts`: server-only, builds exec-feed VEVENT lines for interviews.
- `src/lib/email/interview-emails.ts` (+ test): five email builders.
- `src/lib/email/notify-interview.ts`: sends exec booked/cancelled emails and the applicant admin-cancel email.
- `src/lib/data/interview.ts`: admin (RLS client) reads.
- `src/lib/data/interview-public.ts`: public (service-role) reads.
- `src/actions/interview.ts`: exec/admin actions.
- `src/actions/interview-public.ts`: applicant actions.
- `src/app/api/interview/[token]/calendar.ics/route.ts`
- `src/app/api/cron/interview-reminders/route.ts`
- `src/app/(marketing)/apply/interview/{page.tsx,interview-booking-form.tsx,interview-confirmation.tsx,interview-add-to-calendar.tsx,manage/[token]/page.tsx,manage/[token]/manage-view.tsx}`
- `src/app/portal/(app)/admin/interviews/{page.tsx,invitees-view.tsx,availability-view.tsx,schedule-view.tsx,booking-toggle.tsx}`

Modify:
- `src/lib/supabase/database.types.ts`: five new tables.
- `src/lib/coffee-chat.ts`: export `timeToMinutes`, `minutesToTime`.
- `src/lib/calendar-invite.ts`: export `toUtcStamp`, `icsLines`; `buildIcsCalendar` takes extra event lines.
- `src/lib/calendar-feed.ts`: feed also emits interviews.
- `src/lib/email/coffee-chat-confirmation.ts`: export `escapeHtml`.
- `src/app/(marketing)/apply/coffee-chat/booking-form.tsx`: export shared pieces (`BookingShell`, `ChoiceRadio`, `FieldMessage`, `TimeChips`, `inputClass`).
- `src/app/(marketing)/apply/coffee-chat/add-to-calendar.tsx`: export `GoogleIcon`.
- `src/app/portal/(app)/admin/coffee-chats/schedule-view.tsx`: export `CalendarHelp`, `Pill`; text now covers interviews.
- `src/lib/data/notifications.ts`: interview bell entries.
- `src/components/layout/nav-links.ts`: "Interviews" admin link.
- `src/lib/audit-labels.ts`, `vercel.json`, `.env.local.example`, `src/app/(marketing)/apply/page.tsx`.

---

### Task 1: Migration and DB types

**Files:**
- Create: `supabase/migrations/20261006000001_interview_scheduling.sql`
- Modify: `src/lib/supabase/database.types.ts` (add after the `coffee_chat_bookings` block, ~line 690)

**Interfaces:**
- Produces: tables `interview_invitees`, `interview_availability`, `interview_slots`, `interview_slot_execs`, `interview_bookings` and typed `Database["public"]["Tables"][...]` entries used by every later task. `org_settings` keys `interview_booking_open` (`'false'`) and `interview_slot_minutes` (`'60'`).

- [ ] **Step 1: Write the migration**

```sql
-- Interview scheduling: invite-only booking of 60-minute interview slots
-- staffed by a panel of 2-3 execs. See docs/superpowers/specs/2026-10-06-
-- interview-scheduling-design.md.
--
-- Exec/admin writes use the authenticated client (RLS below). Applicant
-- writes come from Server Actions using the service-role client and never
-- touch RLS; there is deliberately no anon policy.

create table public.interview_invitees (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  created_at timestamptz not null default now(),
  constraint interview_invitees_email_normalized check (email = lower(btrim(email)))
);

create unique index interview_invitees_email_idx on public.interview_invitees (email);

alter table public.interview_invitees enable row level security;
create policy interview_invitees_all on public.interview_invitees
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create table public.interview_availability (
  id uuid primary key default gen_random_uuid(),
  exec_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  constraint interview_availability_time_check check (end_time > start_time)
);

create index interview_availability_date_idx on public.interview_availability (date);
create index interview_availability_exec_id_idx on public.interview_availability (exec_id);

alter table public.interview_availability enable row level security;
create policy interview_availability_all on public.interview_availability
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create table public.interview_slots (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_time time not null,
  end_time time not null,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interview_slots_time_check check (end_time > start_time)
);

create index interview_slots_date_idx on public.interview_slots (date);

alter table public.interview_slots enable row level security;
create policy interview_slots_all on public.interview_slots
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create trigger interview_slots_set_updated_at
  before update on public.interview_slots
  for each row execute procedure public.set_updated_at();

-- A panel is 2 or 3 execs, so execs live in a join table. The 2-3 bound is
-- enforced in the server actions (and by the bookable check), like other
-- business rules in this app.
create table public.interview_slot_execs (
  slot_id uuid not null references public.interview_slots (id) on delete cascade,
  exec_id uuid not null references public.profiles (id) on delete cascade,
  primary key (slot_id, exec_id)
);

create index interview_slot_execs_exec_id_idx on public.interview_slot_execs (exec_id);

alter table public.interview_slot_execs enable row level security;
create policy interview_slot_execs_all on public.interview_slot_execs
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create table public.interview_bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.interview_slots (id) on delete cascade,
  applicant_name text not null,
  applicant_email text not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  manage_token text not null unique,
  reminder_day_before_sent_at timestamptz,
  reminder_morning_sent_at timestamptz,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint interview_bookings_email_normalized check (applicant_email = lower(btrim(applicant_email)))
);

-- Race-proof enforcement: one confirmed booking per slot, and one confirmed
-- booking per applicant email. Cancelling frees both, so a cancelled
-- applicant can book again.
create unique index interview_bookings_slot_active_idx
  on public.interview_bookings (slot_id) where status = 'confirmed';

create unique index interview_bookings_email_active_idx
  on public.interview_bookings (applicant_email) where status = 'confirmed';

alter table public.interview_bookings enable row level security;
create policy interview_bookings_all on public.interview_bookings
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

insert into public.org_settings (key, value) values
  ('interview_booking_open', 'false'),
  ('interview_slot_minutes', '60')
on conflict (key) do nothing;
```

- [ ] **Step 2: Add the types**

Insert after the `coffee_chat_bookings` block in `database.types.ts` (same style: hand-written, `Relationships: []`):

```ts
      interview_invitees: {
        Row: { id: string; email: string; name: string | null; created_at: string };
        Insert: { id?: string; email: string; name?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["interview_invitees"]["Insert"]>;
        Relationships: [];
      };
      interview_availability: {
        Row: { id: string; exec_id: string; date: string; start_time: string; end_time: string; created_at: string };
        Insert: { id?: string; exec_id: string; date: string; start_time: string; end_time: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["interview_availability"]["Insert"]>;
        Relationships: [];
      };
      interview_slots: {
        Row: {
          id: string;
          date: string;
          start_time: string;
          end_time: string;
          published: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          start_time: string;
          end_time: string;
          published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["interview_slots"]["Insert"]>;
        Relationships: [];
      };
      interview_slot_execs: {
        Row: { slot_id: string; exec_id: string };
        Insert: { slot_id: string; exec_id: string };
        Update: Partial<Database["public"]["Tables"]["interview_slot_execs"]["Insert"]>;
        Relationships: [];
      };
      interview_bookings: {
        Row: {
          id: string;
          slot_id: string;
          applicant_name: string;
          applicant_email: string;
          status: string;
          manage_token: string;
          reminder_day_before_sent_at: string | null;
          reminder_morning_sent_at: string | null;
          created_at: string;
          cancelled_at: string | null;
        };
        Insert: {
          id?: string;
          slot_id: string;
          applicant_name: string;
          applicant_email: string;
          status?: string;
          manage_token: string;
          reminder_day_before_sent_at?: string | null;
          reminder_morning_sent_at?: string | null;
          created_at?: string;
          cancelled_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["interview_bookings"]["Insert"]>;
        Relationships: [];
      };
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Apply the migration to the dev database (ask the user first)**

This project keeps migrations in `supabase/migrations/`. Tell the user the migration is ready and ask whether to apply it with the Supabase CLI (`npx supabase db push`) or whether they run it themselves; do not push to a remote database without their yes. Later manual verification (Task 11) needs it applied.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261006000001_interview_scheduling.sql src/lib/supabase/database.types.ts
git commit -m "Add interview scheduling tables"
```

---

### Task 2: Core interview logic (pure, TDD)

**Files:**
- Modify: `src/lib/coffee-chat.ts` (export two helpers)
- Create: `src/lib/interview.ts`
- Test: `src/lib/interview.test.ts`

**Interfaces:**
- Consumes (from `src/lib/coffee-chat.ts`): `isValidUcscEmail(email: string): boolean`, `normalizeTime(time: string): string`, `overlaps(aStart, aEnd, bStart, bEnd): boolean`, and newly exported `timeToMinutes(time: string): number`, `minutesToTime(totalMinutes: number): string`. From `src/lib/date.ts`: `zonedDateTimeToUtc(dateStr, timeStr): Date`.
- Produces (exact):

```ts
export const INTERVIEW_LOCATION = "SnE Library";
export const DEFAULT_INTERVIEW_SLOT_MINUTES = 60;
export const INTERVIEW_GRID_MINUTES = 30;
export const INTERVIEW_MIN_LEAD_MINUTES = 720;
export const INTERVIEW_CANCEL_CUTOFF_MINUTES = 1440;
export const MIN_PANEL_SIZE = 2;
export const MAX_PANEL_SIZE = 3;

export interface InterviewAvailabilityBlock { execId: string; date: string; startTime: string; endTime: string }
export interface InterviewSlotAssignment { slotId: string; date: string; startTime: string; endTime: string; execIds: string[] }
export interface GeneratedInterviewSlot { date: string; startTime: string; endTime: string; execIds: string[] }

export function panelSizes(freeCount: number): number[];
export function generateInterviewSlots(
  availability: InterviewAvailabilityBlock[],
  existingSlots?: InterviewSlotAssignment[],
  slotMinutes?: number,
): GeneratedInterviewSlot[];
export interface InterviewBookabilityInput { date: string; startTime: string; published: boolean; hasConfirmedBooking: boolean; execCount: number }
export function isInterviewSlotBookable(slot: InterviewBookabilityInput, now: Date, minLeadMinutes?: number): boolean;
export function canSelfCancel(date: string, startTime: string, now: Date): boolean;
export function isInterviewSwapEligible(target: InterviewSlotAssignment, candidateExecId: string, allSlots: InterviewSlotAssignment[]): boolean;
export function canAddToPanel(currentCount: number): boolean;
export function canRemoveFromPanel(currentCount: number): boolean;
export function normalizeInviteeEmail(email: string): string;
export function parseInviteeList(text: string): { invitees: { email: string; name: string | null }[]; errors: string[] };
export function parseInterviewSettings(rows: { key: string; value: string }[]): { bookingOpen: boolean; slotMinutes: number };
```

- [ ] **Step 1: Export the two time helpers**

In `src/lib/coffee-chat.ts` change `function timeToMinutes(` to `export function timeToMinutes(` and `function minutesToTime(` to `export function minutesToTime(`. No other change.

- [ ] **Step 2: Write the failing tests**

Create `src/lib/interview.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  canAddToPanel,
  canRemoveFromPanel,
  canSelfCancel,
  generateInterviewSlots,
  isInterviewSlotBookable,
  isInterviewSwapEligible,
  normalizeInviteeEmail,
  panelSizes,
  parseInterviewSettings,
  parseInviteeList,
  type InterviewAvailabilityBlock,
  type InterviewSlotAssignment,
} from "./interview";

const D = "2026-10-06";
const block = (execId: string, startTime: string, endTime: string, date = D): InterviewAvailabilityBlock => ({
  execId,
  date,
  startTime,
  endTime,
});

describe("panelSizes", () => {
  it.each([
    [0, []],
    [1, []],
    [2, [2]],
    [3, [3]],
    [4, [2, 2]],
    [5, [2, 3]],
    [6, [2, 2, 2]],
    [7, [2, 2, 3]],
  ])("splits %i free execs into %j", (n, expected) => {
    expect(panelSizes(n)).toEqual(expected);
  });
});

describe("generateInterviewSlots", () => {
  it("makes one slot from two execs free for a full hour", () => {
    const slots = generateInterviewSlots([block("a", "14:00", "15:00"), block("b", "14:00", "15:00")]);
    expect(slots).toEqual([{ date: D, startTime: "14:00", endTime: "15:00", execIds: ["a", "b"] }]);
  });

  it("makes one slot of three when three execs are free", () => {
    const slots = generateInterviewSlots(["a", "b", "c"].map((id) => block(id, "14:00", "15:00")));
    expect(slots).toHaveLength(1);
    expect(slots[0].execIds).toEqual(["a", "b", "c"]);
  });

  it("makes two slots of two when four execs are free", () => {
    const slots = generateInterviewSlots(["a", "b", "c", "d"].map((id) => block(id, "14:00", "15:00")));
    expect(slots.map((s) => s.execIds.length)).toEqual([2, 2]);
    expect(slots.flatMap((s) => s.execIds).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("makes a 2 and a 3 when five execs are free", () => {
    const slots = generateInterviewSlots(["a", "b", "c", "d", "e"].map((id) => block(id, "14:00", "15:00")));
    expect(slots.map((s) => s.execIds.length).sort()).toEqual([2, 3]);
  });

  it("makes nothing for a single exec", () => {
    expect(generateInterviewSlots([block("a", "14:00", "16:00")])).toEqual([]);
  });

  it("makes nothing when the block is shorter than the slot", () => {
    const slots = generateInterviewSlots([block("a", "14:00", "14:50"), block("b", "14:00", "14:50")]);
    expect(slots).toEqual([]);
  });

  it("starts slots on :00 and :30 only, rounding a block start up to the grid", () => {
    const slots = generateInterviewSlots([block("a", "14:10", "15:30"), block("b", "14:10", "15:30")]);
    expect(slots).toEqual([{ date: D, startTime: "14:30", endTime: "15:30", execIds: ["a", "b"] }]);
  });

  it("uses a :30 start when availability is offset", () => {
    const slots = generateInterviewSlots([
      block("a", "14:00", "15:00"),
      block("b", "14:00", "15:00"),
      block("c", "14:30", "15:30"),
      block("d", "14:30", "15:30"),
    ]);
    expect(slots).toEqual([
      { date: D, startTime: "14:00", endTime: "15:00", execIds: ["a", "b"] },
      { date: D, startTime: "14:30", endTime: "15:30", execIds: ["c", "d"] },
    ]);
  });

  it("never puts an exec on two overlapping slots, so a 2-hour block yields back-to-back hours", () => {
    const slots = generateInterviewSlots(["a", "b", "c", "d"].map((id) => block(id, "14:00", "16:00")));
    expect(slots.map((s) => s.startTime)).toEqual(["14:00", "14:00", "15:00", "15:00"]);
    for (const x of slots) {
      for (const y of slots) {
        if (x === y) continue;
        const shared = x.execIds.some((id) => y.execIds.includes(id));
        const overlap = x.startTime < y.endTime && y.startTime < x.endTime;
        expect(shared && overlap).toBe(false);
      }
    }
  });

  it("does not repeat a pairing when other pairings are possible", () => {
    const slots = generateInterviewSlots(["a", "b", "c", "d"].map((id) => block(id, "14:00", "16:00")));
    const pairs = slots.map((s) => [...s.execIds].sort().join("|"));
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("skips an exec already on an overlapping existing slot", () => {
    const existing: InterviewSlotAssignment[] = [
      { slotId: "s1", date: D, startTime: "13:30", endTime: "14:30", execIds: ["b", "x"] },
    ];
    const slots = generateInterviewSlots(
      [block("a", "14:00", "15:00"), block("b", "14:00", "15:00"), block("c", "14:00", "15:00")],
      existing,
    );
    expect(slots).toEqual([{ date: D, startTime: "14:00", endTime: "15:00", execIds: ["a", "c"] }]);
  });

  it("is deterministic", () => {
    const input = ["d", "b", "a", "c"].map((id) => block(id, "14:00", "16:00"));
    expect(generateInterviewSlots(input)).toEqual(generateInterviewSlots([...input].reverse()));
  });

  it("keeps dates separate", () => {
    const slots = generateInterviewSlots([
      block("a", "14:00", "15:00", "2026-10-06"),
      block("b", "14:00", "15:00", "2026-10-06"),
      block("a", "14:00", "15:00", "2026-10-07"),
      block("b", "14:00", "15:00", "2026-10-07"),
    ]);
    expect(slots.map((s) => s.date)).toEqual(["2026-10-06", "2026-10-07"]);
  });

  it("accepts Postgres HH:MM:SS times", () => {
    const slots = generateInterviewSlots([block("a", "14:00:00", "15:00:00"), block("b", "14:00:00", "15:00:00")]);
    expect(slots).toHaveLength(1);
  });
});

describe("isInterviewSlotBookable", () => {
  // 2026-10-07 09:00 Pacific (PDT, UTC-7) = 2026-10-07T16:00:00Z. Twelve hours earlier = 04:00Z.
  const slot = { date: "2026-10-07", startTime: "09:00", published: true, hasConfirmedBooking: false, execCount: 2 };

  it("is bookable exactly 12 hours before", () => {
    expect(isInterviewSlotBookable(slot, new Date("2026-10-07T04:00:00Z"))).toBe(true);
  });

  it("is not bookable one minute inside 12 hours", () => {
    expect(isInterviewSlotBookable(slot, new Date("2026-10-07T04:01:00Z"))).toBe(false);
  });

  it("rejects unpublished, booked, or under-staffed slots", () => {
    const now = new Date("2026-10-06T12:00:00Z");
    expect(isInterviewSlotBookable({ ...slot, published: false }, now)).toBe(false);
    expect(isInterviewSlotBookable({ ...slot, hasConfirmedBooking: true }, now)).toBe(false);
    expect(isInterviewSlotBookable({ ...slot, execCount: 1 }, now)).toBe(false);
    expect(isInterviewSlotBookable({ ...slot, execCount: 3 }, now)).toBe(true);
  });
});

describe("canSelfCancel", () => {
  it("allows cancelling exactly 24 hours before and blocks one minute later", () => {
    expect(canSelfCancel("2026-10-07", "09:00", new Date("2026-10-06T16:00:00Z"))).toBe(true);
    expect(canSelfCancel("2026-10-07", "09:00", new Date("2026-10-06T16:01:00Z"))).toBe(false);
  });
});

describe("isInterviewSwapEligible", () => {
  const target: InterviewSlotAssignment = { slotId: "t", date: D, startTime: "14:00", endTime: "15:00", execIds: ["a", "b"] };
  const other: InterviewSlotAssignment = { slotId: "o", date: D, startTime: "14:30", endTime: "15:30", execIds: ["c", "d"] };

  it("rejects an exec already on the slot", () => {
    expect(isInterviewSwapEligible(target, "a", [target, other])).toBe(false);
  });

  it("rejects an exec on an overlapping slot", () => {
    expect(isInterviewSwapEligible(target, "c", [target, other])).toBe(false);
  });

  it("allows an exec on a non-overlapping slot or no slot", () => {
    const later: InterviewSlotAssignment = { ...other, slotId: "l", startTime: "15:00", endTime: "16:00" };
    expect(isInterviewSwapEligible(target, "c", [target, later])).toBe(true);
    expect(isInterviewSwapEligible(target, "z", [target, other])).toBe(true);
  });
});

describe("panel bounds", () => {
  it("allows adding up to three and removing down to two", () => {
    expect(canAddToPanel(2)).toBe(true);
    expect(canAddToPanel(3)).toBe(false);
    expect(canRemoveFromPanel(3)).toBe(true);
    expect(canRemoveFromPanel(2)).toBe(false);
  });
});

describe("invitee parsing", () => {
  it("normalizes case and whitespace", () => {
    expect(normalizeInviteeEmail("  Jane.Doe@UCSC.edu ")).toBe("jane.doe@ucsc.edu");
  });

  it("parses email-only and email,name lines, ignoring blanks", () => {
    const { invitees, errors } = parseInviteeList("a@ucsc.edu\n\n  B@UCSC.EDU , Bea Smith \nc@ucsc.edu;Cy\nd@ucsc.edu\tDee");
    expect(errors).toEqual([]);
    expect(invitees).toEqual([
      { email: "a@ucsc.edu", name: null },
      { email: "b@ucsc.edu", name: "Bea Smith" },
      { email: "c@ucsc.edu", name: "Cy" },
      { email: "d@ucsc.edu", name: "Dee" },
    ]);
  });

  it("de-duplicates by email, keeping the first", () => {
    const { invitees } = parseInviteeList("a@ucsc.edu, First\nA@ucsc.edu, Second");
    expect(invitees).toEqual([{ email: "a@ucsc.edu", name: "First" }]);
  });

  it("reports non-UCSC addresses by line without adding them", () => {
    const { invitees, errors } = parseInviteeList("a@ucsc.edu\nbad@gmail.com\nnot-an-email");
    expect(invitees).toEqual([{ email: "a@ucsc.edu", name: null }]);
    expect(errors).toEqual(['Line 2: "bad@gmail.com" is not a @ucsc.edu address.', 'Line 3: "not-an-email" is not a @ucsc.edu address.']);
  });
});

describe("parseInterviewSettings", () => {
  it("defaults to closed and 60 minutes", () => {
    expect(parseInterviewSettings([])).toEqual({ bookingOpen: false, slotMinutes: 60 });
  });

  it("reads open and a valid slot length, rejecting nonsense lengths", () => {
    expect(parseInterviewSettings([{ key: "interview_booking_open", value: "true" }, { key: "interview_slot_minutes", value: "45" }])).toEqual({
      bookingOpen: true,
      slotMinutes: 45,
    });
    expect(parseInterviewSettings([{ key: "interview_slot_minutes", value: "abc" }]).slotMinutes).toBe(60);
    expect(parseInterviewSettings([{ key: "interview_slot_minutes", value: "5" }]).slotMinutes).toBe(60);
  });
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `npx vitest run src/lib/interview.test.ts`
Expected: FAIL (module `./interview` not found).

- [ ] **Step 4: Implement `src/lib/interview.ts`**

```ts
import { isValidUcscEmail, minutesToTime, normalizeTime, overlaps, timeToMinutes } from "./coffee-chat";
import { zonedDateTimeToUtc } from "./date";

export const INTERVIEW_LOCATION = "SnE Library";
export const DEFAULT_INTERVIEW_SLOT_MINUTES = 60;
export const INTERVIEW_GRID_MINUTES = 30;
export const INTERVIEW_MIN_LEAD_MINUTES = 12 * 60;
export const INTERVIEW_CANCEL_CUTOFF_MINUTES = 24 * 60;
export const MIN_PANEL_SIZE = 2;
export const MAX_PANEL_SIZE = 3;

export interface InterviewAvailabilityBlock {
  execId: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM" or "HH:MM:SS"
  endTime: string;
}

export interface InterviewSlotAssignment {
  slotId: string;
  date: string;
  startTime: string;
  endTime: string;
  execIds: string[];
}

export interface GeneratedInterviewSlot {
  date: string;
  startTime: string;
  endTime: string;
  execIds: string[];
}

/** How to split N free execs into panels: pairs, with one trio when N is odd. Nobody is left alone. */
export function panelSizes(freeCount: number): number[] {
  if (freeCount < MIN_PANEL_SIZE) return [];
  if (freeCount === 3) return [3];
  if (freeCount % 2 === 0) return Array<number>(freeCount / 2).fill(2);
  return [...Array<number>((freeCount - 3) / 2).fill(2), 3];
}

interface Interval {
  date: string;
  start: string;
  end: string;
}

/**
 * Builds interview panels. Candidate starts are every :00/:30 for which an
 * exec's block covers the whole slot. Windows are processed in time order;
 * for each, every free exec who is not already on an overlapping slot
 * (existing, or created earlier in this run) is split into panels of 2-3.
 * Ties favour the least-used exec and the pairing that has happened least,
 * then ids, so the same input always gives the same result. Existing slots
 * are never modified.
 */
export function generateInterviewSlots(
  availability: InterviewAvailabilityBlock[],
  existingSlots: InterviewSlotAssignment[] = [],
  slotMinutes: number = DEFAULT_INTERVIEW_SLOT_MINUTES,
): GeneratedInterviewSlot[] {
  const free = new Map<string, Set<string>>();
  for (const raw of availability) {
    const start = timeToMinutes(normalizeTime(raw.startTime));
    const end = timeToMinutes(normalizeTime(raw.endTime));
    for (let t = Math.ceil(start / INTERVIEW_GRID_MINUTES) * INTERVIEW_GRID_MINUTES; t + slotMinutes <= end; t += INTERVIEW_GRID_MINUTES) {
      const key = `${raw.date}|${minutesToTime(t)}`;
      if (!free.has(key)) free.set(key, new Set());
      free.get(key)!.add(raw.execId);
    }
  }

  const intervals = new Map<string, Interval[]>();
  const load = new Map<string, number>();
  const pairCount = new Map<string, number>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const loadOf = (id: string) => load.get(id) ?? 0;
  const pairsOf = (a: string, b: string) => pairCount.get(pairKey(a, b)) ?? 0;

  function record(execIds: string[], date: string, start: string, end: string) {
    for (const id of execIds) {
      if (!intervals.has(id)) intervals.set(id, []);
      intervals.get(id)!.push({ date, start, end });
      load.set(id, loadOf(id) + 1);
    }
    for (let i = 0; i < execIds.length; i++) {
      for (let j = i + 1; j < execIds.length; j++) {
        pairCount.set(pairKey(execIds[i], execIds[j]), pairsOf(execIds[i], execIds[j]) + 1);
      }
    }
  }

  for (const s of existingSlots) {
    record(s.execIds, s.date, normalizeTime(s.startTime), normalizeTime(s.endTime));
  }

  const generated: GeneratedInterviewSlot[] = [];
  for (const [key, execIds] of [...free].sort(([a], [b]) => a.localeCompare(b))) {
    const [date, startTime] = key.split("|");
    const endTime = minutesToTime(timeToMinutes(startTime) + slotMinutes);

    const pool = [...execIds]
      .filter((id) => !(intervals.get(id) ?? []).some((i) => i.date === date && overlaps(i.start, i.end, startTime, endTime)))
      .sort((x, y) => loadOf(x) - loadOf(y) || x.localeCompare(y));

    for (const size of panelSizes(pool.length)) {
      const group = [pool.shift()!];
      while (group.length < size) {
        let bestIndex = 0;
        let bestScore: [number, number, string] | null = null;
        pool.forEach((candidate, index) => {
          const score: [number, number, string] = [
            group.reduce((sum, member) => sum + pairsOf(member, candidate), 0),
            loadOf(candidate),
            candidate,
          ];
          if (
            bestScore === null ||
            score[0] < bestScore[0] ||
            (score[0] === bestScore[0] && (score[1] < bestScore[1] || (score[1] === bestScore[1] && score[2] < bestScore[2])))
          ) {
            bestScore = score;
            bestIndex = index;
          }
        });
        group.push(pool.splice(bestIndex, 1)[0]);
      }
      const sorted = [...group].sort();
      record(sorted, date, startTime, endTime);
      generated.push({ date, startTime, endTime, execIds: sorted });
    }
  }
  return generated;
}

export interface InterviewBookabilityInput {
  date: string;
  startTime: string;
  published: boolean;
  hasConfirmedBooking: boolean;
  execCount: number;
}

/** Whether a slot should be listed to (and bookable by) applicants right now. */
export function isInterviewSlotBookable(
  slot: InterviewBookabilityInput,
  now: Date,
  minLeadMinutes: number = INTERVIEW_MIN_LEAD_MINUTES,
): boolean {
  if (!slot.published || slot.hasConfirmedBooking || slot.execCount < MIN_PANEL_SIZE) return false;
  const slotStart = zonedDateTimeToUtc(slot.date, normalizeTime(slot.startTime));
  return slotStart.getTime() - now.getTime() >= minLeadMinutes * 60_000;
}

/** Applicants can cancel or reschedule themselves until 24 hours before the interview. */
export function canSelfCancel(date: string, startTime: string, now: Date): boolean {
  const slotStart = zonedDateTimeToUtc(date, normalizeTime(startTime));
  return slotStart.getTime() - now.getTime() >= INTERVIEW_CANCEL_CUTOFF_MINUTES * 60_000;
}

/** An exec can join a slot unless they are already on it or on an overlapping one. */
export function isInterviewSwapEligible(
  target: InterviewSlotAssignment,
  candidateExecId: string,
  allSlots: InterviewSlotAssignment[],
): boolean {
  if (target.execIds.includes(candidateExecId)) return false;
  return !allSlots.some(
    (slot) =>
      slot.slotId !== target.slotId &&
      slot.date === target.date &&
      slot.execIds.includes(candidateExecId) &&
      overlaps(normalizeTime(slot.startTime), normalizeTime(slot.endTime), normalizeTime(target.startTime), normalizeTime(target.endTime)),
  );
}

export function canAddToPanel(currentCount: number): boolean {
  return currentCount < MAX_PANEL_SIZE;
}

export function canRemoveFromPanel(currentCount: number): boolean {
  return currentCount > MIN_PANEL_SIZE;
}

export function normalizeInviteeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Parses the admin's pasted invitee list: one per line, `email` or
 * `email, name` (comma, semicolon or tab). Emails are lowercased and
 * de-duplicated (first wins); anything that isn't a @ucsc.edu address is
 * reported by line number instead of being added.
 */
export function parseInviteeList(text: string): { invitees: { email: string; name: string | null }[]; errors: string[] } {
  const invitees: { email: string; name: string | null }[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  text.split(/\r?\n/).forEach((line, index) => {
    if (line.trim() === "") return;
    const [rawEmail, ...rest] = line.split(/[,;\t]/);
    const email = normalizeInviteeEmail(rawEmail);
    if (!isValidUcscEmail(email)) {
      errors.push(`Line ${index + 1}: "${rawEmail.trim()}" is not a @ucsc.edu address.`);
      return;
    }
    if (seen.has(email)) return;
    seen.add(email);
    const name = rest.join(" ").trim();
    invitees.push({ email, name: name === "" ? null : name });
  });

  return { invitees, errors };
}

/** Reads the two interview `org_settings` rows, falling back to closed / 60 minutes. */
export function parseInterviewSettings(rows: { key: string; value: string }[]): { bookingOpen: boolean; slotMinutes: number } {
  const get = (key: string) => rows.find((r) => r.key === key)?.value;
  const minutes = Number(get("interview_slot_minutes"));
  const valid = Number.isInteger(minutes) && minutes >= 15 && minutes <= 240;
  return {
    bookingOpen: get("interview_booking_open") === "true",
    slotMinutes: valid ? minutes : DEFAULT_INTERVIEW_SLOT_MINUTES,
  };
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/lib/interview.test.ts src/lib/coffee-chat.test.ts`
Expected: all PASS (the coffee-chat suite confirms the export change broke nothing). If a determinism or pairing test fails, fix the implementation (not the test): the tie-break order is (repeat pairings, load, id).

- [ ] **Step 6: Commit**

```bash
git add src/lib/coffee-chat.ts src/lib/interview.ts src/lib/interview.test.ts
git commit -m "Add interview scheduling core logic"
```

---

### Task 3: Calendar invites and email builders (pure, TDD)

**Files:**
- Modify: `src/lib/calendar-invite.ts` (export `toUtcStamp`, `icsLines`; extend `buildIcsCalendar`)
- Modify: `src/lib/email/coffee-chat-confirmation.ts` (export `escapeHtml`)
- Create: `src/lib/interview-invite.ts`, `src/lib/email/interview-emails.ts`
- Test: `src/lib/interview-invite.test.ts`, `src/lib/email/interview-emails.test.ts`

**Interfaces:**
- Consumes: `formatTime12h` (coffee-chat), `formatDateLong` (date), `INTERVIEW_LOCATION` (interview), `EmailContent` type from `coffee-chat-confirmation`.
- Produces (exact):

```ts
// src/lib/interview-invite.ts
export interface InterviewInviteInput {
  applicantName: string; date: string; startTime: string; endTime: string; manageToken: string;
  audience?: "applicant" | "exec"; panelNames?: string[];
}
export function buildInterviewGoogleCalendarUrl(input: InterviewInviteInput): string;
export function buildInterviewIcs(input: InterviewInviteInput): string;
export function interviewEventLines(input: InterviewInviteInput & { id: string }): string[]; // exec-feed VEVENT lines
// src/lib/calendar-invite.ts
export function buildIcsCalendar(bookings: (...)[], extraEventLines?: string[]): string;
// src/lib/email/interview-emails.ts (all return EmailContent)
buildInterviewConfirmationEmail(i: { applicantName; date; startTime; endTime; manageToken; siteUrl })
buildInterviewReminderEmail(i: { kind: "day_before" | "morning"; applicantName; date; startTime; endTime; manageToken; siteUrl })
buildInterviewAdminCancelledEmail(i: { applicantName; date; startTime; endTime; siteUrl })
buildInterviewExecBookedEmail(i: { execName; applicantName; applicantEmail; otherPanelNames: string[]; date; startTime; endTime; manageToken; siteUrl })
buildInterviewExecCancelledEmail(i: { execName; applicantName; applicantEmail; otherPanelNames: string[]; date; startTime; endTime; siteUrl })
```

- [ ] **Step 1: Small exports in existing files**

`src/lib/calendar-invite.ts`: change `function toUtcStamp(` and `function icsLines(` to `export function ...`. Change the `buildIcsCalendar` signature and body tail to:

```ts
export function buildIcsCalendar(
  bookings: (CoffeeChatBookingForInvite & { id: string })[],
  extraEventLines: string[] = [],
): string {
```
and in the final `icsLines([...])` change `"X-WR-CALNAME:180DC Coffee Chats",` to `"X-WR-CALNAME:180DC Recruitment",` and replace `...events,` with `...events,\n    ...extraEventLines,`.

`src/lib/email/coffee-chat-confirmation.ts`: change `function escapeHtml(` to `export function escapeHtml(`.

- [ ] **Step 2: Write failing tests**

`src/lib/interview-invite.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildInterviewGoogleCalendarUrl, buildInterviewIcs, interviewEventLines } from "./interview-invite";

const base = {
  applicantName: "Jane Doe",
  date: "2026-10-07",
  startTime: "09:00",
  endTime: "10:00",
  manageToken: "tok123",
};

describe("interview invites", () => {
  it("builds a Google Calendar link in UTC with the fixed location", () => {
    const url = buildInterviewGoogleCalendarUrl(base);
    expect(url).toContain("dates=20261007T160000Z%2F20261007T170000Z");
    expect(url).toContain("location=SnE+Library");
    expect(url).toContain("text=180DC+UCSC+Interview");
  });

  it("keeps the applicant copy generic and names the applicant and panel on the exec copy", () => {
    expect(buildInterviewIcs(base)).not.toContain("Jane Doe");
    const exec = buildInterviewIcs({ ...base, audience: "exec", panelNames: ["Ava", "Ben"] });
    expect(exec).toContain("SUMMARY:Interview with Jane Doe");
    expect(exec).toContain("Ava\\, Ben"); // commas are RFC 5545-escaped
  });

  it("emits CRLF-separated .ics with correct times", () => {
    const ics = buildInterviewIcs(base);
    expect(ics).toContain("\r\n");
    expect(ics).toContain("DTSTART:20261007T160000Z");
    expect(ics).toContain("DTEND:20261007T170000Z");
    expect(ics).toContain("LOCATION:SnE Library");
  });

  it("gives feed events a stable per-booking UID", () => {
    const lines = interviewEventLines({ ...base, id: "b1", audience: "exec", panelNames: ["Ava"] });
    expect(lines).toContain("UID:b1-interview-exec@180dcucsc.org");
    expect(lines[0]).toBe("BEGIN:VEVENT");
    expect(lines[lines.length - 1]).toBe("END:VEVENT");
  });

  it("escapes commas, semicolons and newlines in text fields", () => {
    const lines = interviewEventLines({ ...base, id: "b1", applicantName: "Doe, Jane; Jr", audience: "exec" });
    expect(lines.find((l) => l.startsWith("SUMMARY:"))).toBe("SUMMARY:Interview with Doe\\, Jane\\; Jr");
  });
});
```

`src/lib/email/interview-emails.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildInterviewAdminCancelledEmail,
  buildInterviewConfirmationEmail,
  buildInterviewExecBookedEmail,
  buildInterviewExecCancelledEmail,
  buildInterviewReminderEmail,
} from "./interview-emails";

const when = { date: "2026-10-07", startTime: "09:00", endTime: "10:00" };
const siteUrl = "https://example.org";

describe("interview emails", () => {
  it("confirmation has date, time, SnE Library, calendar links and manage link", () => {
    const { subject, html, text } = buildInterviewConfirmationEmail({ applicantName: "Jane", ...when, manageToken: "tok", siteUrl });
    expect(subject).toBe("You're booked for your 180DC UCSC interview");
    for (const body of [html, text]) {
      expect(body).toContain("SnE Library");
      expect(body).toContain("9:00 AM");
      expect(body).toContain("https://example.org/apply/interview/manage/tok");
      expect(body).toContain("https://example.org/api/interview/tok/calendar.ics");
    }
    expect(html).toContain("calendar.google.com");
    expect(text).toContain("24 hours");
  });

  it("reminder subject depends on kind and links to manage", () => {
    const dayBefore = buildInterviewReminderEmail({ kind: "day_before", applicantName: "Jane", ...when, manageToken: "tok", siteUrl });
    const morning = buildInterviewReminderEmail({ kind: "morning", applicantName: "Jane", ...when, manageToken: "tok", siteUrl });
    expect(dayBefore.subject).toBe("Reminder: your 180DC UCSC interview is tomorrow");
    expect(morning.subject).toBe("Reminder: your 180DC UCSC interview is today");
    expect(dayBefore.text).toContain("https://example.org/apply/interview/manage/tok");
  });

  it("admin-cancelled email says it was cancelled and asks them to get in touch, with no manage link", () => {
    const { subject, html, text } = buildInterviewAdminCancelledEmail({ applicantName: "Jane", ...when, siteUrl });
    expect(subject).toBe("Your 180DC UCSC interview was cancelled");
    expect(html).toContain("Wednesday, October 7, 2026");
    expect(text.toLowerCase()).toContain("contact us");
    expect(text).not.toContain("/manage/");
  });

  it("exec booked email names the applicant and the other panel members", () => {
    const { subject, html, text } = buildInterviewExecBookedEmail({
      execName: "Ava",
      applicantName: "Jane Doe",
      applicantEmail: "jane@ucsc.edu",
      otherPanelNames: ["Ben", "Cy"],
      ...when,
      manageToken: "tok",
      siteUrl,
    });
    expect(subject).toBe("Jane Doe booked an interview with you");
    for (const body of [html, text]) {
      expect(body).toContain("jane@ucsc.edu");
      expect(body).toContain("Ben, Cy");
      expect(body).toContain("SnE Library");
    }
  });

  it("exec cancelled email names the applicant and panel", () => {
    const { subject, text } = buildInterviewExecCancelledEmail({
      execName: "Ava",
      applicantName: "Jane Doe",
      applicantEmail: "jane@ucsc.edu",
      otherPanelNames: ["Ben"],
      ...when,
      siteUrl,
    });
    expect(subject).toBe("Jane Doe's interview was cancelled");
    expect(text).toContain("Ben");
  });

  it("escapes applicant names in html", () => {
    const { html } = buildInterviewConfirmationEmail({ applicantName: "<b>Jane</b>", ...when, manageToken: "tok", siteUrl });
    expect(html).toContain("&lt;b&gt;Jane&lt;/b&gt;");
    expect(html).not.toContain("<b>Jane");
  });
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `npx vitest run src/lib/interview-invite.test.ts src/lib/email/interview-emails.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement `src/lib/interview-invite.ts`**

```ts
import { icsLines, toUtcStamp } from "./calendar-invite";
import { INTERVIEW_LOCATION } from "./interview";

export interface InterviewInviteInput {
  applicantName: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM"
  endTime: string;
  manageToken: string;
  /** Exec copies name the applicant and panel; the applicant's own copy stays generic. */
  audience?: "applicant" | "exec";
  /** The other panel members, shown on exec copies. */
  panelNames?: string[];
}

function eventText(input: InterviewInviteInput): { title: string; description: string } {
  if (input.audience === "exec") {
    const panel = input.panelNames && input.panelNames.length > 0 ? ` Panel: ${input.panelNames.join(", ")}.` : "";
    return {
      title: `Interview with ${input.applicantName}`,
      description: `180DC UCSC recruitment interview with ${input.applicantName} at ${INTERVIEW_LOCATION}.${panel}`,
    };
  }
  return {
    title: "180DC UCSC Interview",
    description: `Interview with 180DC UCSC exec as part of recruitment. Location: ${INTERVIEW_LOCATION}.`,
  };
}

/** RFC 5545 TEXT escaping so names with commas or semicolons can't break a line. */
function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export function buildInterviewGoogleCalendarUrl(input: InterviewInviteInput): string {
  const { title, description } = eventText(input);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${toUtcStamp(input.date, input.startTime)}/${toUtcStamp(input.date, input.endTime)}`,
    details: description,
    location: INTERVIEW_LOCATION,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function eventLines(input: InterviewInviteInput, uid: string): string[] {
  const { title, description } = eventText(input);
  return [
    "BEGIN:VEVENT",
    `UID:${uid}@180dcucsc.org`,
    `DTSTAMP:${toUtcStamp(input.date, input.startTime)}`,
    `DTSTART:${toUtcStamp(input.date, input.startTime)}`,
    `DTEND:${toUtcStamp(input.date, input.endTime)}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `LOCATION:${escapeIcsText(INTERVIEW_LOCATION)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    "END:VEVENT",
  ];
}

/** One-booking calendar file, for the applicant's "Apple / Outlook" download. */
export function buildInterviewIcs(input: InterviewInviteInput): string {
  const suffix = input.audience === "exec" ? "-exec" : "";
  return icsLines([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//180DC UCSC//Interview//EN",
    ...eventLines(input, `${input.manageToken}-interview${suffix}`),
    "END:VCALENDAR",
    "",
  ]);
}

/**
 * VEVENT lines for the exec calendar feed. The UID is stable per booking, so
 * calendar apps update the event in place and drop it once the booking is
 * cancelled and no longer in the feed.
 */
export function interviewEventLines(input: InterviewInviteInput & { id: string }): string[] {
  return eventLines({ ...input, audience: "exec" }, `${input.id}-interview-exec`);
}
```

- [ ] **Step 5: Implement `src/lib/email/interview-emails.ts`**

```ts
import { formatTime12h } from "../coffee-chat";
import { formatDateLong } from "../date";
import { INTERVIEW_LOCATION } from "../interview";
import { buildInterviewGoogleCalendarUrl } from "../interview-invite";
import { escapeHtml, type EmailContent } from "./coffee-chat-confirmation";

interface When {
  date: string;
  startTime: string;
  endTime: string;
}

const dateLabel = (w: When) => formatDateLong(w.date);
const timeLabel = (w: When) => `${formatTime12h(w.startTime)} to ${formatTime12h(w.endTime)}`;

function detailsList(w: When): string {
  return `
    <ul>
      <li><strong>Date:</strong> ${escapeHtml(dateLabel(w))}</li>
      <li><strong>Time:</strong> ${escapeHtml(timeLabel(w))}</li>
      <li><strong>Location:</strong> ${escapeHtml(INTERVIEW_LOCATION)}</li>
    </ul>`;
}

function detailsText(w: When): string[] {
  return [`Date: ${dateLabel(w)}`, `Time: ${timeLabel(w)}`, `Location: ${INTERVIEW_LOCATION}`];
}

const manageUrl = (siteUrl: string, token: string) => `${siteUrl}/apply/interview/manage/${token}`;
const icsUrl = (siteUrl: string, token: string) => `${siteUrl}/api/interview/${token}/calendar.ics`;

export interface InterviewConfirmationEmailInput extends When {
  applicantName: string;
  manageToken: string;
  siteUrl: string;
}

export function buildInterviewConfirmationEmail(input: InterviewConfirmationEmailInput): EmailContent {
  const googleUrl = buildInterviewGoogleCalendarUrl(input);
  const manage = manageUrl(input.siteUrl, input.manageToken);
  const ics = icsUrl(input.siteUrl, input.manageToken);
  const logoUrl = `${input.siteUrl}/email-logo.png`;

  const html = `
    <p>Hi ${escapeHtml(input.applicantName)},</p>
    <p>Your interview with 180DC UCSC is confirmed:</p>
    ${detailsList(input)}
    <p>
      Add it to your calendar:
      <a href="${escapeHtml(googleUrl)}">Google Calendar</a> ·
      <a href="${escapeHtml(ics)}">Apple / Outlook (.ics)</a>
    </p>
    <p>Need to cancel or pick a different time? <a href="${escapeHtml(manage)}">Manage your booking</a>. You can change it up to 24 hours before.</p>
    <p>Good luck!</p>
    <img src="${escapeHtml(logoUrl)}" alt="180 Degrees Consulting UC Santa Cruz" width="240" style="display:block;width:240px;max-width:100%;height:auto;margin:24px 0 0;" />
  `.trim();

  const text = [
    `Hi ${input.applicantName},`,
    "Your interview with 180DC UCSC is confirmed:",
    ...detailsText(input),
    `Add to Google Calendar: ${googleUrl}`,
    `Add to Apple/Outlook: ${ics}`,
    `Manage your booking (cancel or reschedule up to 24 hours before): ${manage}`,
    "Good luck!",
  ].join("\n");

  return { subject: "You're booked for your 180DC UCSC interview", html, text };
}

export interface InterviewReminderEmailInput extends When {
  kind: "day_before" | "morning";
  applicantName: string;
  manageToken: string;
  siteUrl: string;
}

export function buildInterviewReminderEmail(input: InterviewReminderEmailInput): EmailContent {
  const when = input.kind === "day_before" ? "tomorrow" : "today";
  const manage = manageUrl(input.siteUrl, input.manageToken);

  const html = `
    <p>Hi ${escapeHtml(input.applicantName)},</p>
    <p>A reminder that your 180DC UCSC interview is ${when}:</p>
    ${detailsList(input)}
    <p>Need to make a change? <a href="${escapeHtml(manage)}">Manage your booking</a> (changes close 24 hours before the interview, after that please contact us).</p>
    <p>See you soon!</p>
  `.trim();

  const text = [
    `Hi ${input.applicantName},`,
    `A reminder that your 180DC UCSC interview is ${when}:`,
    ...detailsText(input),
    `Manage your booking (changes close 24 hours before; after that please contact us): ${manage}`,
  ].join("\n");

  return { subject: `Reminder: your 180DC UCSC interview is ${when}`, html, text };
}

export interface InterviewAdminCancelledEmailInput extends When {
  applicantName: string;
  siteUrl: string;
}

export function buildInterviewAdminCancelledEmail(input: InterviewAdminCancelledEmailInput): EmailContent {
  const bookUrl = `${input.siteUrl}/apply/interview`;
  const html = `
    <p>Hi ${escapeHtml(input.applicantName)},</p>
    <p>Your 180DC UCSC interview has been cancelled:</p>
    ${detailsList(input)}
    <p>Please contact us if you'd like to rebook or have any questions. If booking is open you can also pick a new time at <a href="${escapeHtml(bookUrl)}">${escapeHtml(bookUrl)}</a>.</p>
  `.trim();

  const text = [
    `Hi ${input.applicantName},`,
    "Your 180DC UCSC interview has been cancelled:",
    ...detailsText(input),
    `Please contact us if you'd like to rebook or have any questions. If booking is open you can also pick a new time at ${bookUrl}`,
  ].join("\n");

  return { subject: "Your 180DC UCSC interview was cancelled", html, text };
}

export interface InterviewExecEmailInput extends When {
  execName: string;
  applicantName: string;
  applicantEmail: string;
  otherPanelNames: string[];
  siteUrl: string;
}

const panelLine = (names: string[]) => (names.length > 0 ? names.join(", ") : "none yet");

export function buildInterviewExecBookedEmail(input: InterviewExecEmailInput & { manageToken: string }): EmailContent {
  const portalUrl = `${input.siteUrl}/portal/admin/interviews?tab=schedule`;
  const googleUrl = buildInterviewGoogleCalendarUrl({
    ...input,
    audience: "exec",
    panelNames: input.otherPanelNames,
  });

  const html = `
    <p>Hi ${escapeHtml(input.execName)},</p>
    <p>${escapeHtml(input.applicantName)} (${escapeHtml(input.applicantEmail)}) booked an interview with you:</p>
    ${detailsList(input)}
    <p><strong>Rest of the panel:</strong> ${escapeHtml(panelLine(input.otherPanelNames))}</p>
    <p>
      Add it to your calendar: <a href="${escapeHtml(googleUrl)}">Google Calendar</a>. If you've subscribed to your portal calendar link, it appears there automatically.
    </p>
    <p><a href="${escapeHtml(portalUrl)}">View interviews in the portal</a></p>
  `.trim();

  const text = [
    `Hi ${input.execName},`,
    `${input.applicantName} (${input.applicantEmail}) booked an interview with you:`,
    ...detailsText(input),
    `Rest of the panel: ${panelLine(input.otherPanelNames)}`,
    `Add to Google Calendar: ${googleUrl}`,
    `View interviews: ${portalUrl}`,
  ].join("\n");

  return { subject: `${input.applicantName} booked an interview with you`, html, text };
}

export function buildInterviewExecCancelledEmail(input: InterviewExecEmailInput): EmailContent {
  const portalUrl = `${input.siteUrl}/portal/admin/interviews?tab=schedule`;

  const html = `
    <p>Hi ${escapeHtml(input.execName)},</p>
    <p>${escapeHtml(input.applicantName)} (${escapeHtml(input.applicantEmail)}) is no longer booked for this interview:</p>
    ${detailsList(input)}
    <p><strong>Rest of the panel:</strong> ${escapeHtml(panelLine(input.otherPanelNames))}</p>
    <p>You can remove it from your calendar. <a href="${escapeHtml(portalUrl)}">View interviews in the portal</a></p>
  `.trim();

  const text = [
    `Hi ${input.execName},`,
    `${input.applicantName} (${input.applicantEmail}) is no longer booked for this interview:`,
    ...detailsText(input),
    `Rest of the panel: ${panelLine(input.otherPanelNames)}`,
    "You can remove it from your calendar.",
    `View interviews: ${portalUrl}`,
  ].join("\n");

  return { subject: `${input.applicantName}'s interview was cancelled`, html, text };
}
```

- [ ] **Step 6: Run tests and the full suite for regressions**

Run: `npx vitest run`
Expected: all PASS (calendar-invite tests still pass with the extended signature).

- [ ] **Step 7: Commit**

```bash
git add src/lib/calendar-invite.ts src/lib/email/coffee-chat-confirmation.ts src/lib/interview-invite.ts src/lib/interview-invite.test.ts src/lib/email/interview-emails.ts src/lib/email/interview-emails.test.ts
git commit -m "Add interview calendar invites and email templates"
```

---

### Task 4: Data layer

**Files:**
- Create: `src/lib/data/interview.ts`, `src/lib/data/interview-public.ts`

**Interfaces:**
- Consumes: Task 1 tables; Task 2 `parseInterviewSettings`, `isInterviewSlotBookable`, `canSelfCancel`; `normalizeTime`; `createClient` (`@/lib/supabase/server`), `createAdminClient` (`@/lib/supabase/admin`); `EXEC_ROLES` (`@/lib/auth/roles`); `ExecOption` type from `@/lib/data/coffee-chat`.
- Produces (exact):

```ts
// src/lib/data/interview.ts (server-only, RLS client)
export interface InviteeRow { id: string; email: string; name: string | null; createdAt: string; booking: { date: string; startTime: string; endTime: string } | null }
export interface InterviewAvailabilityRow { id: string; execId: string; execName: string; date: string; startTime: string; endTime: string }
export interface InterviewSlotRow { id: string; date: string; startTime: string; endTime: string; published: boolean; execs: { id: string; name: string }[]; bookingStatus: "open" | "booked"; bookingId: string | null; applicantName: string | null; applicantEmail: string | null }
export interface InterviewBookingRow { id: string; slotId: string; applicantName: string; applicantEmail: string; status: "confirmed" | "cancelled"; date: string; startTime: string; endTime: string; execIds: string[]; execNames: string[]; createdAt: string; cancelledAt: string | null }
export interface InterviewExecOptions { available: ExecOption[]; others: ExecOption[] }
export async function getInvitees(): Promise<InviteeRow[]>
export async function getInterviewAvailability(): Promise<InterviewAvailabilityRow[]>
export async function getInterviewSlots(): Promise<InterviewSlotRow[]>
export async function getInterviewBookings(): Promise<InterviewBookingRow[]>
export async function getInterviewExecOptions(date: string, startTime: string, endTime: string): Promise<InterviewExecOptions>
export async function getInterviewAdminSettings(): Promise<{ bookingOpen: boolean; slotMinutes: number }>
// src/lib/data/interview-public.ts (server-only, service role)
export interface PublicInterviewSlot { id: string; date: string; startTime: string; endTime: string }
export async function getPublicInterviewState(): Promise<{ bookingOpen: boolean; slots: PublicInterviewSlot[] }>
export interface ManagedInterviewBooking { status: "confirmed" | "cancelled"; applicantName: string; applicantEmail: string; date: string; startTime: string; endTime: string; canSelfCancel: boolean }
export async function getInterviewBookingByToken(token: string): Promise<ManagedInterviewBooking | null>
```

- [ ] **Step 1: Write `src/lib/data/interview.ts`**

```ts
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { normalizeTime } from "@/lib/coffee-chat";
import { EXEC_ROLES } from "@/lib/auth/roles";
import { parseInterviewSettings } from "@/lib/interview";
import type { ExecOption } from "@/lib/data/coffee-chat";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function lookupProfileNames(supabase: Supabase, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from("profiles").select("id, name").in("id", ids);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id, p.name]));
}

export interface InviteeRow {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  booking: { date: string; startTime: string; endTime: string } | null;
}

export async function getInvitees(): Promise<InviteeRow[]> {
  const supabase = await createClient();
  const { data: invitees, error } = await supabase
    .from("interview_invitees")
    .select("id, email, name, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const { data: bookings, error: bookingsError } = await supabase
    .from("interview_bookings")
    .select("applicant_email, slot_id")
    .eq("status", "confirmed");
  if (bookingsError) throw bookingsError;

  const slotIds = [...new Set((bookings ?? []).map((b) => b.slot_id))];
  const { data: slots, error: slotsError } =
    slotIds.length > 0
      ? await supabase.from("interview_slots").select("id, date, start_time, end_time").in("id", slotIds)
      : { data: [], error: null };
  if (slotsError) throw slotsError;
  const slotsById = new Map((slots ?? []).map((s) => [s.id, s]));

  const bookingByEmail = new Map<string, InviteeRow["booking"]>();
  for (const b of bookings ?? []) {
    const slot = slotsById.get(b.slot_id);
    if (slot) {
      bookingByEmail.set(b.applicant_email, {
        date: slot.date,
        startTime: normalizeTime(slot.start_time),
        endTime: normalizeTime(slot.end_time),
      });
    }
  }

  return (invitees ?? []).map((i) => ({
    id: i.id,
    email: i.email,
    name: i.name,
    createdAt: i.created_at,
    booking: bookingByEmail.get(i.email) ?? null,
  }));
}

export interface InterviewAvailabilityRow {
  id: string;
  execId: string;
  execName: string;
  date: string;
  startTime: string;
  endTime: string;
}

export async function getInterviewAvailability(): Promise<InterviewAvailabilityRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("interview_availability")
    .select("id, exec_id, date, start_time, end_time")
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  const names = await lookupProfileNames(supabase, [...new Set(rows.map((r) => r.exec_id))]);
  return rows.map((r) => ({
    id: r.id,
    execId: r.exec_id,
    execName: names.get(r.exec_id) ?? "Unknown",
    date: r.date,
    startTime: normalizeTime(r.start_time),
    endTime: normalizeTime(r.end_time),
  }));
}

export interface InterviewSlotRow {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  published: boolean;
  execs: { id: string; name: string }[];
  bookingStatus: "open" | "booked";
  bookingId: string | null;
  applicantName: string | null;
  applicantEmail: string | null;
}

export async function getInterviewSlots(): Promise<InterviewSlotRow[]> {
  const supabase = await createClient();
  const { data: slots, error } = await supabase
    .from("interview_slots")
    .select("id, date, start_time, end_time, published")
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw error;
  const slotRows = slots ?? [];
  if (slotRows.length === 0) return [];

  // The join table is small (2-3 rows per slot), so read it whole rather than building a long IN list.
  const [{ data: links, error: linksError }, { data: bookings, error: bookingsError }] = await Promise.all([
    supabase.from("interview_slot_execs").select("slot_id, exec_id"),
    supabase.from("interview_bookings").select("id, slot_id, applicant_name, applicant_email").eq("status", "confirmed"),
  ]);
  if (linksError) throw linksError;
  if (bookingsError) throw bookingsError;

  const names = await lookupProfileNames(supabase, [...new Set((links ?? []).map((l) => l.exec_id))]);
  const execsBySlot = new Map<string, { id: string; name: string }[]>();
  for (const l of links ?? []) {
    if (!execsBySlot.has(l.slot_id)) execsBySlot.set(l.slot_id, []);
    execsBySlot.get(l.slot_id)!.push({ id: l.exec_id, name: names.get(l.exec_id) ?? "Unknown" });
  }
  const bookingBySlot = new Map((bookings ?? []).map((b) => [b.slot_id, b]));

  return slotRows.map((s) => {
    const booking = bookingBySlot.get(s.id);
    return {
      id: s.id,
      date: s.date,
      startTime: normalizeTime(s.start_time),
      endTime: normalizeTime(s.end_time),
      published: s.published,
      execs: (execsBySlot.get(s.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
      bookingStatus: booking ? "booked" : "open",
      bookingId: booking?.id ?? null,
      applicantName: booking?.applicant_name ?? null,
      applicantEmail: booking?.applicant_email ?? null,
    };
  });
}

export interface InterviewBookingRow {
  id: string;
  slotId: string;
  applicantName: string;
  applicantEmail: string;
  status: "confirmed" | "cancelled";
  date: string;
  startTime: string;
  endTime: string;
  execIds: string[];
  execNames: string[];
  createdAt: string;
  cancelledAt: string | null;
}

export async function getInterviewBookings(): Promise<InterviewBookingRow[]> {
  const supabase = await createClient();
  const { data: bookings, error } = await supabase
    .from("interview_bookings")
    .select("id, slot_id, applicant_name, applicant_email, status, created_at, cancelled_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const bookingRows = bookings ?? [];
  if (bookingRows.length === 0) return [];

  const [{ data: slots, error: slotsError }, { data: links, error: linksError }] = await Promise.all([
    supabase.from("interview_slots").select("id, date, start_time, end_time"),
    supabase.from("interview_slot_execs").select("slot_id, exec_id"),
  ]);
  if (slotsError) throw slotsError;
  if (linksError) throw linksError;
  const slotsById = new Map((slots ?? []).map((s) => [s.id, s]));
  const names = await lookupProfileNames(supabase, [...new Set((links ?? []).map((l) => l.exec_id))]);
  const execIdsBySlot = new Map<string, string[]>();
  for (const l of links ?? []) {
    if (!execIdsBySlot.has(l.slot_id)) execIdsBySlot.set(l.slot_id, []);
    execIdsBySlot.get(l.slot_id)!.push(l.exec_id);
  }

  return bookingRows.map((b) => {
    const slot = slotsById.get(b.slot_id);
    const execIds = execIdsBySlot.get(b.slot_id) ?? [];
    return {
      id: b.id,
      slotId: b.slot_id,
      applicantName: b.applicant_name,
      applicantEmail: b.applicant_email,
      status: b.status as "confirmed" | "cancelled",
      date: slot?.date ?? "",
      startTime: slot ? normalizeTime(slot.start_time) : "",
      endTime: slot ? normalizeTime(slot.end_time) : "",
      execIds,
      execNames: execIds.map((id) => names.get(id) ?? "Unknown"),
      createdAt: b.created_at,
      cancelledAt: b.cancelled_at,
    };
  });
}

export interface InterviewExecOptions {
  /** Execs whose interview availability covers the slot. */
  available: ExecOption[];
  /** Every other exec, for manually taking a slot they didn't mark themselves free for. */
  others: ExecOption[];
}

export async function getInterviewExecOptions(date: string, startTime: string, endTime: string): Promise<InterviewExecOptions> {
  const supabase = await createClient();
  const [{ data, error }, { data: execs, error: execsError }] = await Promise.all([
    supabase
      .from("interview_availability")
      .select("exec_id")
      .eq("date", date)
      .lte("start_time", startTime)
      .gte("end_time", endTime),
    supabase.from("profiles").select("id, name").in("role", EXEC_ROLES).order("name"),
  ]);
  if (error) throw error;
  if (execsError) throw execsError;

  const freeIds = new Set((data ?? []).map((row) => row.exec_id));
  const all = (execs ?? []).map((e) => ({ id: e.id, name: e.name }));
  return { available: all.filter((e) => freeIds.has(e.id)), others: all.filter((e) => !freeIds.has(e.id)) };
}

export async function getInterviewAdminSettings(): Promise<{ bookingOpen: boolean; slotMinutes: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("org_settings")
    .select("key, value")
    .in("key", ["interview_booking_open", "interview_slot_minutes"]);
  if (error) throw error;
  return parseInterviewSettings(data ?? []);
}
```

- [ ] **Step 2: Write `src/lib/data/interview-public.ts`**

```ts
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
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (No unit tests here: these are thin queries over tested pure logic and are exercised in Task 11's manual run.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/interview.ts src/lib/data/interview-public.ts
git commit -m "Add interview data layer"
```

---

### Task 5: Exec/admin actions and notifications

**Files:**
- Create: `src/lib/email/notify-interview.ts`, `src/actions/interview.ts`
- Modify: `src/lib/audit-labels.ts`

**Interfaces:**
- Consumes: Tasks 2–4 exports; `getCurrentProfile` (`@/lib/data/profile`), `isExec` (`@/lib/auth/roles`), `logAudit(actorId, action, targetLabel?, detail?)` (`@/lib/audit`), `expandAvailabilityEntry(dates, blocks)` and types `TimeBlockInput`, `overlaps` (`@/lib/coffee-chat`), `createClient`, `createAdminClient`, `sendEmail`.
- Produces (exact):

```ts
// src/lib/email/notify-interview.ts
export async function notifyInterviewExecs(bookingId: string, kind: "booked" | "cancelled"): Promise<{ sentTo: string[]; errors: string[] }>
export async function emailApplicantInterviewCancelled(bookingId: string): Promise<void>
// src/actions/interview.ts ("use server"); ActionResult = { error?: string }
addInviteesAction(text: string): Promise<ActionResult & { addedCount?: number; errors?: string[] }>
removeInviteeAction(id: string): Promise<ActionResult & { hadActiveBooking?: boolean }>
addInterviewAvailabilityAction(dates: string[], blocks: TimeBlockInput[]): Promise<ActionResult & { addedCount?: number }>
removeInterviewAvailabilityAction(id: string): Promise<ActionResult & { removedSlotCount?: number; keptBookedCount?: number }>
generateInterviewSlotsAction(): Promise<ActionResult & { createdCount?: number }>
swapInterviewExecAction(slotId: string, oldExecId: string, newExecId: string): Promise<ActionResult>
addExecToInterviewSlotAction(slotId: string, execId: string): Promise<ActionResult>
removeExecFromInterviewSlotAction(slotId: string, execId: string): Promise<ActionResult>
publishInterviewSlotAction(slotId: string, published: boolean): Promise<ActionResult>
publishAllInterviewSlotsAction(): Promise<ActionResult & { publishedCount?: number }>
deleteInterviewSlotAction(slotId: string): Promise<ActionResult>
cancelInterviewBookingAsAdminAction(bookingId: string): Promise<ActionResult>
getInterviewExecOptionsAction(date: string, startTime: string, endTime: string): Promise<{ error?: string; options: InterviewExecOptions | null }>
setInterviewBookingOpenAction(open: boolean): Promise<ActionResult>
```

- [ ] **Step 1: Audit labels**

Add to `AUDIT_ACTION_LABELS` in `src/lib/audit-labels.ts` (before the closing `};`):

```ts
  "interview.slots_generated": "Generated interview slots",
  "interview.booking_cancelled_by_admin": "Cancelled an interview booking",
  "interview.invitees_added": "Added interview invitees",
  "interview.invitee_removed": "Removed an interview invitee",
  "interview.booking_toggled": "Opened or closed interview booking",
```

- [ ] **Step 2: Write `src/lib/email/notify-interview.ts`**

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTime } from "@/lib/coffee-chat";
import {
  buildInterviewAdminCancelledEmail,
  buildInterviewExecBookedEmail,
  buildInterviewExecCancelledEmail,
} from "./interview-emails";
import { sendEmail } from "./send";

async function loadBookingContext(bookingId: string) {
  const supabase = createAdminClient();
  const { data: booking, error } = await supabase
    .from("interview_bookings")
    .select("applicant_name, applicant_email, manage_token, slot_id")
    .eq("id", bookingId)
    .single();
  if (error) throw error;
  const { data: slot, error: slotError } = await supabase
    .from("interview_slots")
    .select("date, start_time, end_time")
    .eq("id", booking.slot_id)
    .single();
  if (slotError) throw slotError;
  const { data: links, error: linksError } = await supabase
    .from("interview_slot_execs")
    .select("exec_id")
    .eq("slot_id", booking.slot_id);
  if (linksError) throw linksError;
  const { data: execs, error: execsError } = await supabase
    .from("profiles")
    .select("id, name, email")
    .in(
      "id",
      (links ?? []).map((l) => l.exec_id),
    );
  if (execsError) throw execsError;
  return {
    booking,
    when: { date: slot.date, startTime: normalizeTime(slot.start_time), endTime: normalizeTime(slot.end_time) },
    execs: execs ?? [],
  };
}

/**
 * Emails every exec on the booking's panel. Best effort: the booking change
 * has already happened, so failures are logged rather than surfaced.
 */
export async function notifyInterviewExecs(
  bookingId: string,
  kind: "booked" | "cancelled",
): Promise<{ sentTo: string[]; errors: string[] }> {
  const result = { sentTo: [] as string[], errors: [] as string[] };
  try {
    const { booking, when, execs } = await loadBookingContext(bookingId);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;

    await Promise.all(
      execs.map(async (exec) => {
        const base = {
          execName: exec.name,
          applicantName: booking.applicant_name,
          applicantEmail: booking.applicant_email,
          otherPanelNames: execs.filter((e) => e.id !== exec.id).map((e) => e.name),
          ...when,
          siteUrl,
        };
        const content =
          kind === "booked"
            ? buildInterviewExecBookedEmail({ ...base, manageToken: booking.manage_token })
            : buildInterviewExecCancelledEmail(base);
        try {
          await sendEmail({ to: exec.email, subject: content.subject, html: content.html, text: content.text });
          result.sentTo.push(exec.email);
        } catch (emailError) {
          console.error(`interview exec ${kind} email failed:`, emailError);
          result.errors.push(`${exec.email}: ${emailError instanceof Error ? emailError.message : String(emailError)}`);
        }
      }),
    );
  } catch (err) {
    console.error(`interview exec ${kind} notification failed:`, err);
    result.errors.push(err instanceof Error ? err.message : JSON.stringify(err));
  }
  return result;
}

/** Tells the applicant an admin cancelled their interview. Best effort, like the exec emails. */
export async function emailApplicantInterviewCancelled(bookingId: string): Promise<void> {
  try {
    const { booking, when } = await loadBookingContext(bookingId);
    const content = buildInterviewAdminCancelledEmail({
      applicantName: booking.applicant_name,
      ...when,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL!,
    });
    await sendEmail({ to: booking.applicant_email, subject: content.subject, html: content.html, text: content.text });
  } catch (err) {
    console.error("interview admin-cancel email to applicant failed:", err);
  }
}
```

- [ ] **Step 3: Write `src/actions/interview.ts`**

```ts
"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import { emailApplicantInterviewCancelled, notifyInterviewExecs } from "@/lib/email/notify-interview";
import { getInterviewAdminSettings, getInterviewAvailability, getInterviewExecOptions, getInterviewSlots } from "@/lib/data/interview";
import { expandAvailabilityEntry, overlaps, type TimeBlockInput } from "@/lib/coffee-chat";
import {
  canAddToPanel,
  canRemoveFromPanel,
  generateInterviewSlots,
  isInterviewSwapEligible,
  parseInviteeList,
  type InterviewSlotAssignment,
} from "@/lib/interview";

export interface ActionResult {
  error?: string;
}

async function requireExec() {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) return { profile: null, error: "Only exec can do that." };
  return { profile, error: undefined };
}

function revalidateAdmin() {
  revalidatePath("/portal/admin/interviews");
  revalidatePath("/apply/interview");
}

export async function addInviteesAction(text: string): Promise<ActionResult & { addedCount?: number; errors?: string[] }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const { invitees, errors } = parseInviteeList(text);
  if (invitees.length === 0) return { error: errors[0] ?? "Paste at least one UCSC email.", errors };

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("interview_invitees")
    .select("email")
    .in(
      "email",
      invitees.map((i) => i.email),
    );
  if (existingError) return { error: existingError.message };
  const known = new Set((existing ?? []).map((e) => e.email));
  const fresh = invitees.filter((i) => !known.has(i.email));

  if (fresh.length > 0) {
    const { error: insertError } = await supabase.from("interview_invitees").insert(fresh);
    if (insertError) return { error: insertError.message };
  }

  await logAudit(profile.id, "interview.invitees_added", undefined, `${fresh.length} added`);
  revalidateAdmin();
  return { addedCount: fresh.length, errors };
}

/** Removes someone from the allowlist. Their existing booking (if any) is deliberately left alone. */
export async function removeInviteeAction(id: string): Promise<ActionResult & { hadActiveBooking?: boolean }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const supabase = await createClient();
  const { data: invitee } = await supabase.from("interview_invitees").select("email").eq("id", id).maybeSingle();
  const { data: active } = invitee
    ? await supabase
        .from("interview_bookings")
        .select("id")
        .eq("applicant_email", invitee.email)
        .eq("status", "confirmed")
        .maybeSingle()
    : { data: null };

  const { error: deleteError } = await supabase.from("interview_invitees").delete().eq("id", id);
  if (deleteError) return { error: deleteError.message };

  await logAudit(profile.id, "interview.invitee_removed", invitee?.email ?? null);
  revalidateAdmin();
  return { hadActiveBooking: !!active };
}

export async function addInterviewAvailabilityAction(
  dates: string[],
  blocks: TimeBlockInput[],
): Promise<ActionResult & { addedCount?: number }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const expanded = expandAvailabilityEntry(dates, blocks);
  if ("error" in expanded) return { error: expanded.error };

  const supabase = await createClient();
  const { error: insertError } = await supabase.from("interview_availability").insert(
    expanded.rows.map((row) => ({
      exec_id: profile.id,
      date: row.date,
      start_time: row.startTime,
      end_time: row.endTime,
    })),
  );
  if (insertError) return { error: insertError.message };

  revalidateAdmin();
  return { addedCount: expanded.rows.length };
}

/** Removes a free block, plus any not-yet-booked slot that exec was on during it (admin regenerates afterwards). */
export async function removeInterviewAvailabilityAction(
  id: string,
): Promise<ActionResult & { removedSlotCount?: number; keptBookedCount?: number }> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  const { data: block } = await supabase
    .from("interview_availability")
    .select("exec_id, date, start_time, end_time")
    .eq("id", id)
    .maybeSingle();

  const { error: deleteError } = await supabase.from("interview_availability").delete().eq("id", id);
  if (deleteError) return { error: deleteError.message };

  let removedSlotCount = 0;
  let keptBookedCount = 0;
  if (block) {
    const slots = await getInterviewSlots();
    const affected = slots.filter(
      (s) =>
        s.date === block.date &&
        s.execs.some((e) => e.id === block.exec_id) &&
        overlaps(s.startTime, s.endTime, block.start_time.slice(0, 5), block.end_time.slice(0, 5)),
    );
    const deletable = affected.filter((s) => s.bookingStatus === "open").map((s) => s.id);
    keptBookedCount = affected.length - deletable.length;
    if (deletable.length > 0) {
      const { error: slotDeleteError } = await supabase.from("interview_slots").delete().in("id", deletable);
      if (slotDeleteError) return { error: slotDeleteError.message };
      removedSlotCount = deletable.length;
    }
  }

  revalidateAdmin();
  return { removedSlotCount, keptBookedCount };
}

/** Creates unpublished slots for availability not already covered. Existing slots are never touched. */
export async function generateInterviewSlotsAction(): Promise<ActionResult & { createdCount?: number }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const [availability, existing, settings] = await Promise.all([
    getInterviewAvailability(),
    getInterviewSlots(),
    getInterviewAdminSettings(),
  ]);

  const assignments: InterviewSlotAssignment[] = existing.map((s) => ({
    slotId: s.id,
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    execIds: s.execs.map((e) => e.id),
  }));
  const generated = generateInterviewSlots(
    availability.map((a) => ({ execId: a.execId, date: a.date, startTime: a.startTime, endTime: a.endTime })),
    assignments,
    settings.slotMinutes,
  );

  if (generated.length > 0) {
    const supabase = await createClient();
    const withIds = generated.map((g) => ({ ...g, id: randomUUID() }));
    const { error: slotError } = await supabase.from("interview_slots").insert(
      withIds.map((g) => ({ id: g.id, date: g.date, start_time: g.startTime, end_time: g.endTime, published: false })),
    );
    if (slotError) return { error: slotError.message };
    const { error: linkError } = await supabase
      .from("interview_slot_execs")
      .insert(withIds.flatMap((g) => g.execIds.map((execId) => ({ slot_id: g.id, exec_id: execId }))));
    if (linkError) {
      // Don't leave staffless slots behind.
      await supabase.from("interview_slots").delete().in("id", withIds.map((g) => g.id));
      return { error: linkError.message };
    }
  }

  await logAudit(profile.id, "interview.slots_generated", undefined, `${generated.length} slot(s) created`);
  revalidateAdmin();
  return { createdCount: generated.length };
}

async function loadAssignments(): Promise<InterviewSlotAssignment[]> {
  const slots = await getInterviewSlots();
  return slots.map((s) => ({
    slotId: s.id,
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    execIds: s.execs.map((e) => e.id),
  }));
}

export async function swapInterviewExecAction(slotId: string, oldExecId: string, newExecId: string): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const all = await loadAssignments();
  const target = all.find((s) => s.slotId === slotId);
  if (!target || !target.execIds.includes(oldExecId)) return { error: "Slot not found." };
  if (!isInterviewSwapEligible(target, newExecId, all)) {
    return { error: "That exec is already on this slot or is assigned to an overlapping slot." };
  }

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("interview_slot_execs")
    .update({ exec_id: newExecId })
    .eq("slot_id", slotId)
    .eq("exec_id", oldExecId);
  if (updateError) return { error: updateError.message };

  revalidateAdmin();
  return {};
}

export async function addExecToInterviewSlotAction(slotId: string, execId: string): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const all = await loadAssignments();
  const target = all.find((s) => s.slotId === slotId);
  if (!target) return { error: "Slot not found." };
  if (!canAddToPanel(target.execIds.length)) return { error: "A panel can have at most 3 execs." };
  if (!isInterviewSwapEligible(target, execId, all)) {
    return { error: "That exec is already on this slot or is assigned to an overlapping slot." };
  }

  const supabase = await createClient();
  const { error: insertError } = await supabase.from("interview_slot_execs").insert({ slot_id: slotId, exec_id: execId });
  if (insertError) return { error: insertError.message };

  revalidateAdmin();
  return {};
}

export async function removeExecFromInterviewSlotAction(slotId: string, execId: string): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const all = await loadAssignments();
  const target = all.find((s) => s.slotId === slotId);
  if (!target || !target.execIds.includes(execId)) return { error: "Slot not found." };
  if (!canRemoveFromPanel(target.execIds.length)) return { error: "A panel needs at least 2 execs. Swap instead, or delete the slot." };

  const supabase = await createClient();
  const { error: deleteError } = await supabase.from("interview_slot_execs").delete().eq("slot_id", slotId).eq("exec_id", execId);
  if (deleteError) return { error: deleteError.message };

  revalidateAdmin();
  return {};
}

export async function publishInterviewSlotAction(slotId: string, published: boolean): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  const { error: updateError } = await supabase.from("interview_slots").update({ published }).eq("id", slotId);
  if (updateError) return { error: updateError.message };

  revalidateAdmin();
  return {};
}

export async function publishAllInterviewSlotsAction(): Promise<ActionResult & { publishedCount?: number }> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  const { data, error: updateError } = await supabase
    .from("interview_slots")
    .update({ published: true })
    .eq("published", false)
    .select("id");
  if (updateError) return { error: updateError.message };

  revalidateAdmin();
  return { publishedCount: data?.length ?? 0 };
}

export async function deleteInterviewSlotAction(slotId: string): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  // The bookings FK cascades, so deleting a booked slot would silently wipe the applicant's booking.
  const { data: active } = await supabase
    .from("interview_bookings")
    .select("id")
    .eq("slot_id", slotId)
    .eq("status", "confirmed")
    .maybeSingle();
  if (active) return { error: "That slot has a confirmed booking. Cancel the booking first." };

  const { error: deleteError } = await supabase.from("interview_slots").delete().eq("id", slotId);
  if (deleteError) return { error: deleteError.message };

  revalidateAdmin();
  return {};
}

/** Cancels a booking for the applicant: execs are notified, and so is the applicant. */
export async function cancelInterviewBookingAsAdminAction(bookingId: string): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const supabase = await createClient();
  const { data: cancelled, error: updateError } = await supabase
    .from("interview_bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", bookingId)
    .eq("status", "confirmed")
    .select("id");
  if (updateError) return { error: updateError.message };

  if ((cancelled ?? []).length > 0) {
    await Promise.all([notifyInterviewExecs(bookingId, "cancelled"), emailApplicantInterviewCancelled(bookingId)]);
  }

  await logAudit(profile.id, "interview.booking_cancelled_by_admin", undefined, bookingId);
  revalidateAdmin();
  return {};
}

export async function getInterviewExecOptionsAction(date: string, startTime: string, endTime: string) {
  const { error } = await requireExec();
  if (error) return { error, options: null };
  return { error: undefined, options: await getInterviewExecOptions(date, startTime, endTime) };
}

export async function setInterviewBookingOpenAction(open: boolean): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("org_settings")
    .upsert({ key: "interview_booking_open", value: open ? "true" : "false" }, { onConflict: "key" });
  if (updateError) return { error: updateError.message };

  await logAudit(profile.id, "interview.booking_toggled", undefined, open ? "opened" : "closed");
  revalidateAdmin();
  return {};
}
```

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. If `org_settings` has a different column shape than `{key, value}`, check `supabase/migrations/*org_settings*` and the `Database` type and adjust the upsert.

- [ ] **Step 5: Commit**

```bash
git add src/lib/audit-labels.ts src/lib/email/notify-interview.ts src/actions/interview.ts
git commit -m "Add interview admin actions and exec notifications"
```

---

### Task 6: Applicant actions and calendar route

**Files:**
- Create: `src/actions/interview-public.ts`, `src/app/api/interview/[token]/calendar.ics/route.ts`

**Interfaces:**
- Consumes: Task 2 (`isInterviewSlotBookable`, `canSelfCancel`, `normalizeInviteeEmail`), Task 3 (`buildInterviewConfirmationEmail`, `buildInterviewIcs`), Task 5 (`notifyInterviewExecs`), Task 4 (`getInterviewBookingByToken`), `verifyTurnstileToken`, `isValidUcscEmail`, `sendEmail`, `createAdminClient`.
- Produces (exact):

```ts
export interface CreateInterviewBookingInput { slotId: string; name: string; email: string; turnstileToken: string }
export interface CreateInterviewBookingResult { error?: string; booking?: { manageToken: string; date: string; startTime: string; endTime: string } }
export async function createInterviewBookingAction(input: CreateInterviewBookingInput): Promise<CreateInterviewBookingResult>
export async function cancelInterviewBookingByTokenAction(token: string): Promise<{ error?: string }>
// GET /api/interview/[token]/calendar.ics
```

- [ ] **Step 1: Write `src/actions/interview-public.ts`**

```ts
"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidUcscEmail, normalizeTime } from "@/lib/coffee-chat";
import { canSelfCancel, isInterviewSlotBookable, normalizeInviteeEmail, parseInterviewSettings } from "@/lib/interview";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { buildInterviewConfirmationEmail } from "@/lib/email/interview-emails";
import { sendEmail } from "@/lib/email/send";
import { notifyInterviewExecs } from "@/lib/email/notify-interview";

const UNIQUE_VIOLATION = "23505";

const NOT_INVITED_MESSAGE =
  "This booking page is for invited applicants. Contact us if you think this is a mistake.";

export interface CreateInterviewBookingInput {
  slotId: string;
  name: string;
  email: string;
  turnstileToken: string;
}

export interface CreateInterviewBookingResult {
  error?: string;
  booking?: { manageToken: string; date: string; startTime: string; endTime: string };
}

export async function createInterviewBookingAction(input: CreateInterviewBookingInput): Promise<CreateInterviewBookingResult> {
  const name = input.name.trim();
  const email = normalizeInviteeEmail(input.email);

  if (!name) return { error: "Enter your name." };
  if (!isValidUcscEmail(email)) return { error: "Enter a valid @ucsc.edu email address." };

  const turnstileOk = await verifyTurnstileToken(input.turnstileToken);
  if (!turnstileOk) return { error: "We couldn't verify you're not a robot. Please try again." };

  const supabase = createAdminClient();

  const { data: settingRows } = await supabase
    .from("org_settings")
    .select("key, value")
    .in("key", ["interview_booking_open", "interview_slot_minutes"]);
  if (!parseInterviewSettings(settingRows ?? []).bookingOpen) {
    return { error: "Interview booking isn't open right now. Check back soon." };
  }

  // The allowlist gate. Never reveal who is (or isn't) on the list beyond this one message.
  const { data: invitee } = await supabase.from("interview_invitees").select("id").eq("email", email).maybeSingle();
  if (!invitee) return { error: NOT_INVITED_MESSAGE };

  const { data: existing } = await supabase
    .from("interview_bookings")
    .select("id")
    .eq("applicant_email", email)
    .eq("status", "confirmed")
    .maybeSingle();
  if (existing) {
    // Never hand back the manage token: the only "proof" here is typing an email address.
    return {
      error:
        "You already have an interview booked with that email. Check your confirmation email for the link to cancel or reschedule.",
    };
  }

  const { data: slot, error: slotError } = await supabase
    .from("interview_slots")
    .select("id, date, start_time, end_time, published")
    .eq("id", input.slotId)
    .single();
  if (slotError || !slot) return { error: "That slot no longer exists. Please pick another." };

  const [{ data: activeBookings }, { data: links }] = await Promise.all([
    supabase.from("interview_bookings").select("id").eq("slot_id", slot.id).eq("status", "confirmed"),
    supabase.from("interview_slot_execs").select("exec_id").eq("slot_id", slot.id),
  ]);

  const bookable = isInterviewSlotBookable(
    {
      date: slot.date,
      startTime: slot.start_time,
      published: slot.published,
      hasConfirmedBooking: (activeBookings ?? []).length > 0,
      execCount: (links ?? []).length,
    },
    new Date(),
  );
  if (!bookable) return { error: "That slot was just taken or is no longer available. Please pick another." };

  const manageToken = randomUUID();
  const { data: inserted, error: insertError } = await supabase
    .from("interview_bookings")
    .insert({ slot_id: slot.id, applicant_name: name, applicant_email: email, manage_token: manageToken })
    .select("id")
    .single();

  if (insertError) {
    if ((insertError as { code?: string }).code === UNIQUE_VIOLATION) {
      return { error: "That slot was just taken, or you already have a booking. Please refresh and try again." };
    }
    return { error: insertError.message };
  }

  const startTime = normalizeTime(slot.start_time);
  const endTime = normalizeTime(slot.end_time);

  const content = buildInterviewConfirmationEmail({
    applicantName: name,
    date: slot.date,
    startTime,
    endTime,
    manageToken,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL!,
  });
  try {
    await sendEmail({ to: email, subject: content.subject, html: content.html, text: content.text });
  } catch (emailError) {
    // The booking already succeeded and is shown on-screen.
    console.error("interview confirmation email failed:", emailError);
  }

  await notifyInterviewExecs(inserted.id, "booked");

  revalidatePath("/apply/interview");
  revalidatePath("/portal/admin/interviews");

  return { booking: { manageToken, date: slot.date, startTime, endTime } };
}

export async function cancelInterviewBookingByTokenAction(token: string): Promise<{ error?: string }> {
  const supabase = createAdminClient();
  const { data: booking, error } = await supabase
    .from("interview_bookings")
    .select("id, status, slot_id")
    .eq("manage_token", token)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!booking) return { error: "We couldn't find that booking." };
  if (booking.status === "cancelled") return {};

  const { data: slot } = await supabase.from("interview_slots").select("date, start_time").eq("id", booking.slot_id).single();
  if (!slot || !canSelfCancel(slot.date, normalizeTime(slot.start_time), new Date())) {
    return { error: "Interviews can only be changed up to 24 hours ahead. Please contact us and we'll help." };
  }

  const { data: cancelled, error: updateError } = await supabase
    .from("interview_bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", booking.id)
    .eq("status", "confirmed")
    .select("id");
  if (updateError) return { error: updateError.message };

  if ((cancelled ?? []).length > 0) await notifyInterviewExecs(booking.id, "cancelled");

  revalidatePath("/apply/interview");
  revalidatePath("/portal/admin/interviews");
  return {};
}
```

Note: a `"use server"` file may only export async functions, which is why `NOT_INVITED_MESSAGE` is a module-private `const`.

- [ ] **Step 2: Write the `.ics` route**

`src/app/api/interview/[token]/calendar.ics/route.ts`:

```ts
import { getInterviewBookingByToken } from "@/lib/data/interview-public";
import { buildInterviewIcs } from "@/lib/interview-invite";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const booking = await getInterviewBookingByToken(token);

  if (!booking || booking.status !== "confirmed") {
    return new Response("Booking not found.", { status: 404 });
  }

  const audience = new URL(request.url).searchParams.get("for") === "exec" ? "exec" : "applicant";
  const ics = buildInterviewIcs({
    applicantName: booking.applicantName,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    manageToken: token,
    audience,
  });

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="interview.ics"',
    },
  });
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/actions/interview-public.ts "src/app/api/interview/[token]/calendar.ics/route.ts"
git commit -m "Add interview applicant actions and calendar route"
```

---

### Task 7: Applicant pages

**Files:**
- Modify: `src/app/(marketing)/apply/coffee-chat/booking-form.tsx` (exports), `src/app/(marketing)/apply/coffee-chat/add-to-calendar.tsx` (export `GoogleIcon`)
- Create: `src/app/(marketing)/apply/interview/page.tsx`, `interview-booking-form.tsx`, `interview-confirmation.tsx`, `interview-add-to-calendar.tsx`, `manage/[token]/page.tsx`, `manage/[token]/manage-view.tsx`

**Interfaces:**
- Consumes: `getPublicInterviewState`, `getInterviewBookingByToken`, `PublicInterviewSlot`, `ManagedInterviewBooking` (Task 4); `createInterviewBookingAction`, `cancelInterviewBookingByTokenAction` (Task 6); `INTERVIEW_LOCATION`, `buildInterviewGoogleCalendarUrl`.
- Produces: pages `/apply/interview` and `/apply/interview/manage/[token]`. Coffee chat files export: `BookingShell`, `ChoiceRadio`, `FieldMessage`, `TimeChips`, `inputClass` (from `booking-form.tsx`) and `GoogleIcon` (from `add-to-calendar.tsx`).

This task intentionally reuses the existing marketing look (mint panel, same components), so no new visual design is needed: match the coffee chat pages exactly.

- [ ] **Step 1: Export shared pieces from the coffee chat form**

In `booking-form.tsx`: add `export` to `function BookingShell`, `function ChoiceRadio`, `function FieldMessage`, and `const inputClass`. Change `TimeChips` to be generic over what it needs and export it:

```tsx
export function TimeChips({
  slots,
  selectedSlotId,
  onSelect,
}: {
  slots: { id: string; startTime: string }[];
  selectedSlotId: string | null;
  onSelect: (id: string) => void;
}) {
  const chip = (slot: { id: string; startTime: string }) => {
```
and replace the two `(group as PublicSlot[])` casts and `PublicSlot[]` annotations inside it with `{ id: string; startTime: string }[]`. Leave `groupByDate`/`BookingForm` using `PublicSlot` as is. In `add-to-calendar.tsx` change `function GoogleIcon()` to `export function GoogleIcon()`.

Run `npx tsc --noEmit` to confirm the coffee chat page still compiles before continuing.

- [ ] **Step 2: Page (`page.tsx`)**

```tsx
import type { Metadata } from "next";
import { getPublicInterviewState } from "@/lib/data/interview-public";
import { InterviewBookingForm } from "./interview-booking-form";

export const metadata: Metadata = { title: "Book Your Interview" };

// Availability depends on the clock (12h lead time) and other applicants' bookings, so never serve statically.
export const dynamic = "force-dynamic";

export default async function InterviewPage() {
  const { bookingOpen, slots } = await getPublicInterviewState();

  return (
    <InterviewBookingForm
      bookingOpen={bookingOpen}
      slots={slots}
      turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
      intro={
        <>
          <h1 className="font-brand text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-5xl">
            Book your interview
          </h1>
          <p className="mt-5 max-w-xl text-lg text-foreground/70 text-pretty">
            This page is for applicants we&apos;ve invited to interview. Pick a time and use the UCSC email we contacted
            you at.
          </p>
        </>
      }
    />
  );
}
```

- [ ] **Step 3: Form (`interview-booking-form.tsx`)**

```tsx
"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { CircleAlert, MapPin } from "lucide-react";
import { createInterviewBookingAction } from "@/actions/interview-public";
import type { PublicInterviewSlot } from "@/lib/data/interview-public";
import { formatTime12h, isValidUcscEmail } from "@/lib/coffee-chat";
import { INTERVIEW_LOCATION } from "@/lib/interview";
import { formatDateParts, parseLocalDate, toDateString } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { BookingShell, FieldMessage, TimeChips, inputClass } from "../coffee-chat/booking-form";
import { InterviewConfirmation, type ConfirmedInterview } from "./interview-confirmation";

type Errors = { slot?: string; name?: string; email?: string; verification?: string };

export function InterviewBookingForm({
  bookingOpen,
  slots,
  turnstileSiteKey,
  intro,
}: {
  bookingOpen: boolean;
  slots: PublicInterviewSlot[];
  turnstileSiteKey: string;
  intro: ReactNode;
}) {
  const [isPending, startTransition] = useTransition();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [chosenSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileScriptReady, setTurnstileScriptReady] = useState(false);
  const [touched, setTouched] = useState<{ name?: boolean; email?: boolean }>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedInterview | null>(null);
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const noticeRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  // If the list refreshes and the chosen time is gone (someone took it), treat it as unselected.
  const selectedSlotId = chosenSlotId && slots.some((s) => s.id === chosenSlotId) ? chosenSlotId : null;
  const selectedSlot = selectedSlotId ? (slots.find((s) => s.id === selectedSlotId) ?? null) : null;

  const byDate = useMemo(() => {
    const map = new Map<string, PublicInterviewSlot[]>();
    for (const slot of slots) {
      if (!map.has(slot.date)) map.set(slot.date, []);
      map.get(slot.date)!.push(slot);
    }
    return map;
  }, [slots]);
  const dates = useMemo(() => [...byDate.keys()].sort(), [byDate]);
  const availableDates = useMemo(() => new Set(dates), [dates]);
  const availableDayObjects = useMemo(() => dates.map(parseLocalDate), [dates]);
  // Several panels can share a start time; the applicant only needs each time once (the server assigns the panel).
  const timesForSelectedDate = useMemo(() => {
    const seen = new Set<string>();
    return (selectedDate ? (byDate.get(selectedDate) ?? []) : []).filter((s) => !seen.has(s.startTime) && seen.add(s.startTime));
  }, [selectedDate, byDate]);
  const selectedParts = selectedDate ? formatDateParts(selectedDate) : null;

  const errors: Errors = {};
  if (!selectedSlotId) errors.slot = "Pick a time.";
  if (!name.trim()) errors.name = "Enter your name.";
  if (!email.trim()) errors.email = "Enter your UCSC email.";
  else if (!isValidUcscEmail(email)) errors.email = "Use your @ucsc.edu address.";
  if (!turnstileToken) errors.verification = "Complete the verification check.";
  const showName = (touched.name || submitAttempted) && errors.name;
  const showEmail = (touched.email || submitAttempted) && errors.email;
  const showVerification = submitAttempted && errors.verification;

  // Render the Turnstile widget once both the script has loaded and its container exists.
  useEffect(() => {
    if (!turnstileScriptReady || !turnstileContainerRef.current || !window.turnstile) return;
    if (turnstileContainerRef.current.childElementCount > 0) return;
    turnstileWidgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
      sitekey: turnstileSiteKey,
      callback: setTurnstileToken,
    });
  }, [turnstileScriptReady, selectedSlotId, turnstileSiteKey]);

  function focusFirstProblem() {
    const target = errors.slot
      ? document.querySelector<HTMLElement>('input[name="slot"]')
      : errors.name
        ? document.getElementById("name")
        : errors.email
          ? document.getElementById("email")
          : turnstileContainerRef.current;
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    if (target instanceof HTMLInputElement) target.focus({ preventScroll: true });
  }

  function handleSubmit() {
    setSubmitAttempted(true);
    setServerError(null);
    if (Object.keys(errors).length > 0 || !selectedSlotId) {
      focusFirstProblem();
      return;
    }

    startTransition(async () => {
      const result = await createInterviewBookingAction({ slotId: selectedSlotId, name, email, turnstileToken });
      if (result.error) {
        // Turnstile tokens are single-use and the server has spent this one: get a fresh challenge.
        setTurnstileToken("");
        window.turnstile?.reset(turnstileWidgetIdRef.current ?? undefined);
        setServerError(result.error);
        router.refresh();
        noticeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
      if (result.booking) setConfirmed(result.booking);
    });
  }

  if (confirmed) return <InterviewConfirmation booking={confirmed} applicantName={name} />;

  if (!bookingOpen || slots.length === 0) {
    return (
      <BookingShell intro={intro}>
        <p className="text-center text-foreground/70">
          {bookingOpen
            ? "No interview times are open right now. Check back soon, or reply to the email we sent you."
            : "Interview booking isn't open yet. We'll email you when it is."}
        </p>
      </BookingShell>
    );
  }

  const bookLabel =
    selectedSlot && selectedParts
      ? `Book ${selectedParts.weekday.slice(0, 3)}, ${selectedParts.month} ${selectedParts.day} at ${formatTime12h(selectedSlot.startTime)}`
      : "Book this interview";

  return (
    <BookingShell intro={intro}>
      <div className="space-y-8">
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="lazyOnload"
          onReady={() => setTurnstileScriptReady(true)}
        />

        <div
          ref={noticeRef}
          role="alert"
          className={serverError ? "flex items-start gap-2.5 rounded-2xl border-2 border-red-700 bg-white p-4 text-red-800" : "hidden"}
        >
          {serverError && (
            <>
              <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
              <p className="font-medium">{serverError}</p>
            </>
          )}
        </div>

        <div className="grid gap-8 md:grid-cols-[19rem_1fr]">
          <div>
            <h2 className="sr-only">Pick a date and time</h2>
            <Calendar
              mode="single"
              selected={selectedDate ? parseLocalDate(selectedDate) : undefined}
              onSelect={(day) => {
                if (!day) return;
                setSelectedDate(toDateString(day));
                setSelectedSlotId(null);
                setServerError(null);
              }}
              defaultMonth={availableDayObjects[0]}
              disabled={(day) => !availableDates.has(toDateString(day))}
              modifiers={{ available: availableDayObjects }}
              classNames={{ today: "rounded-(--cell-radius)" }}
              components={{
                DayButton: (props) => (
                  <CalendarDayButton
                    {...props}
                    className={cn(
                      props.modifiers.available && "bg-primary/10 font-semibold text-deep",
                      props.modifiers.today && "ring-[1.5px] ring-deep ring-inset",
                      "group-data-[focused=true]/day:ring-foreground data-[selected-single=true]:hover:bg-primary data-[selected-single=true]:hover:text-primary-foreground",
                    )}
                  >
                    {props.children}
                    {props.modifiers.available && (
                      <i aria-hidden className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-primary opacity-100! group-data-[selected=true]/day:bg-white" />
                    )}
                  </CalendarDayButton>
                ),
              }}
              showOutsideDays={false}
              className="w-full rounded-2xl bg-white shadow-[0_1px_2px_rgb(0_0_0/0.05),0_6px_18px_rgb(47_74_23/0.08)] [--cell-size:--spacing(8)] min-[360px]:[--cell-size:--spacing(10)]"
            />
            <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <i aria-hidden className="size-3 rounded border border-primary/30 bg-primary/10" />
                Open times
              </span>
              <span className="flex items-center gap-1.5">
                <i aria-hidden className="size-3 rounded border border-border" />
                Nothing open
              </span>
            </p>
          </div>

          <div>
            {!selectedDate || !selectedParts ? (
              <p className="px-1 text-sm text-muted-foreground">Pick a shaded day to see its times.</p>
            ) : (
              <fieldset>
                <legend className="sr-only">
                  Times on {selectedParts.weekday}, {selectedParts.month} {selectedParts.day}
                </legend>
                <div className="mb-2 flex items-baseline justify-between px-1" aria-hidden>
                  <span className="font-bold">
                    {selectedParts.weekday}, {selectedParts.month} {selectedParts.day}
                  </span>
                  <span className="text-xs text-muted-foreground">Pacific Time</span>
                </div>
                <TimeChips
                  slots={timesForSelectedDate}
                  selectedSlotId={selectedSlotId}
                  onSelect={(id) => {
                    setSelectedSlotId(id);
                    setServerError(null);
                  }}
                />
                <p className="mt-3 flex items-center gap-1.5 px-1 text-sm text-muted-foreground">
                  <MapPin className="size-4" aria-hidden />
                  {INTERVIEW_LOCATION} · 1 hour
                </p>
              </fieldset>
            )}
          </div>
        </div>

        {selectedSlot && (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <h2 className="text-base font-bold">Your details</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="name" className="mb-1.5 block text-sm font-semibold">
                  Name
                </label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                  autoComplete="name"
                  aria-invalid={showName ? true : undefined}
                  aria-describedby={showName ? "name-error" : undefined}
                  className={cn(inputClass, showName && "border-2 border-red-700")}
                />
                {showName && <FieldMessage id="name-error">{errors.name}</FieldMessage>}
              </div>
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-semibold">
                  UCSC email
                </label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  placeholder="you@ucsc.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                  autoComplete="email"
                  aria-invalid={showEmail ? true : undefined}
                  aria-describedby={showEmail ? "email-error" : undefined}
                  className={cn(inputClass, showEmail && "border-2 border-red-700")}
                />
                {showEmail && <FieldMessage id="email-error">{errors.email}</FieldMessage>}
              </div>
            </div>

            <div ref={turnstileContainerRef} className="mt-4 empty:hidden" />
            {showVerification && <FieldMessage id="verification-error">{errors.verification}</FieldMessage>}

            <Button type="submit" disabled={isPending} size="lg" className="mt-5 h-12 w-full rounded-2xl text-base font-bold">
              {isPending ? "Booking..." : bookLabel}
            </Button>
            <p className="mt-2.5 text-center text-sm text-muted-foreground">
              You&apos;ll get a confirmation email with a link to reschedule or cancel (up to 24 hours before).
            </p>
          </form>
        )}
      </div>
    </BookingShell>
  );
}
```

- [ ] **Step 4: Add-to-calendar and confirmation**

`interview-add-to-calendar.tsx`:

```tsx
import { Apple } from "lucide-react";
import { buildInterviewGoogleCalendarUrl, type InterviewInviteInput } from "@/lib/interview-invite";
import { Button } from "@/components/ui/button";
import { GoogleIcon } from "../coffee-chat/add-to-calendar";

/** Google Calendar link and an .ics download for a confirmed interview. */
export function InterviewAddToCalendarButtons({
  booking,
  variant = "default",
}: {
  booking: InterviewInviteInput;
  variant?: "default" | "confirmation";
}) {
  const googleUrl = buildInterviewGoogleCalendarUrl(booking);
  const icsUrl = `/api/interview/${booking.manageToken}/calendar.ics`;
  const compact = variant === "confirmation";

  return (
    <div className={compact ? "mx-auto mt-(--gap) grid max-w-[26rem] gap-2" : "mt-6"}>
      <p className={compact ? "text-xs font-bold tracking-widest text-deep/75 uppercase" : "text-sm font-semibold"}>
        Add to your calendar
      </p>
      <div className={compact ? "grid grid-cols-2 gap-2.5" : "mt-3 flex flex-wrap justify-center gap-3"}>
        <Button
          nativeButton={false}
          variant="outline"
          className={compact ? "h-11 gap-2 rounded-full bg-white text-sm font-semibold" : "gap-2 rounded-full"}
          render={<a href={googleUrl} target="_blank" rel="noopener noreferrer" />}
        >
          <GoogleIcon />
          {compact ? "Google" : "Google Calendar"}
        </Button>
        <Button
          nativeButton={false}
          variant="outline"
          className={compact ? "h-11 gap-2 rounded-full bg-white text-sm font-semibold" : "gap-2 rounded-full"}
          render={<a href={icsUrl} download="interview.ics" />}
        >
          <Apple className="size-4" />
          Apple / Outlook
        </Button>
      </div>
    </div>
  );
}
```

`interview-confirmation.tsx` (copy of `coffee-chat/booking-confirmation.tsx` with these exact differences: type renamed `ConfirmedInterview` without `location` field; heading text "Your interview is booked."; duration line `1 hour · In person`; the location row is always shown and fixed to `INTERVIEW_LOCATION`; calendar component is `InterviewAddToCalendarButtons`; manage link is `/apply/interview/manage/${booking.manageToken}`; imports `DateTile` from `../coffee-chat/date-tile`). Write it in full:

```tsx
"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import Link from "next/link";
import { Check, ChevronRight, Mail, MapPin } from "lucide-react";
import { formatTimeRange, mapsSearchUrl } from "@/lib/coffee-chat";
import { INTERVIEW_LOCATION } from "@/lib/interview";
import { formatDateParts } from "@/lib/date";
import { DateTile } from "../coffee-chat/date-tile";
import { InterviewAddToCalendarButtons } from "./interview-add-to-calendar";

export interface ConfirmedInterview {
  manageToken: string;
  date: string;
  startTime: string;
  endTime: string;
}

// Spacing scales with viewport height so the whole screen fits without scrolling on a laptop.
const fitToScreen = {
  "--gap": "clamp(0.625rem, 2.2svh, 1.5rem)",
  "--badge": "clamp(3.75rem, 9svh, 5.5rem)",
} as CSSProperties;

/** Post-booking screen: fills the viewport under the nav and owns its own page shell. */
export function InterviewConfirmation({ booking, applicantName }: { booking: ConfirmedInterview; applicantName: string }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { weekday, month, day } = formatDateParts(booking.date);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div style={fitToScreen} className="flex min-h-svh items-center justify-center px-4 pt-24 pb-6 sm:px-6">
      <section className="mint-panel w-full max-w-3xl rounded-[2rem] px-5 py-[calc(var(--gap)*1.6)] text-center sm:rounded-[2.5rem] sm:px-10">
        <div className="mx-auto grid size-(--badge) place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_0_0_0.5rem_rgb(88_138_44/0.15),0_0_0_1rem_rgb(88_138_44/0.07)]">
          <Check className="size-[55%]" strokeWidth={2.5} />
        </div>

        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-brand mt-[calc(var(--gap)*1.5)] text-[clamp(2.25rem,6svh,3rem)] leading-none font-extrabold tracking-[0.02em] text-deep uppercase outline-none"
        >
          You&apos;re all set!
        </h1>
        <p className="mt-2 text-[1.0625rem] text-foreground/70">Your interview is booked.</p>

        <div className="mx-auto mt-(--gap) max-w-[26rem] overflow-hidden rounded-3xl bg-white text-left shadow-[0_1px_2px_rgb(0_0_0/0.05),0_8px_24px_rgb(47_74_23/0.1)]">
          <div className="flex items-center gap-[1.125rem] px-6 py-4">
            <DateTile month={month} day={day} />
            <div>
              <p className="text-[0.8125rem] font-semibold tracking-[0.08em] text-primary uppercase">{weekday}</p>
              <p className="text-[1.625rem] leading-[1.15] font-bold tracking-tight tabular-nums">
                {formatTimeRange(booking.startTime, booking.endTime)}
              </p>
              <p className="text-sm text-muted-foreground">1 hour · In person</p>
            </div>
          </div>
          <a
            href={mapsSearchUrl(INTERVIEW_LOCATION)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 border-t border-dashed border-border px-6 py-3 font-semibold transition-colors hover:bg-mint/45"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-mint text-deep">
              <MapPin className="size-3.5" />
            </span>
            <span className="flex-1">{INTERVIEW_LOCATION}</span>
            <span className="inline-flex shrink-0 items-center gap-1 text-[0.8125rem] font-semibold text-primary">
              Open in Maps
              <span className="sr-only">(opens in a new tab)</span>
            </span>
          </a>
        </div>

        <InterviewAddToCalendarButtons
          variant="confirmation"
          booking={{
            applicantName,
            date: booking.date,
            startTime: booking.startTime,
            endTime: booking.endTime,
            manageToken: booking.manageToken,
          }}
        />

        <div className="mx-auto mt-(--gap) grid max-w-[26rem] justify-items-center gap-2 border-t border-deep/15 pt-[calc(var(--gap)*0.8)] text-sm text-foreground/60">
          <p className="flex items-center gap-2 text-left">
            <Mail className="size-4 shrink-0" />
            We&apos;ve emailed you a confirmation with these calendar links.
          </p>
          <Link
            href={`/apply/interview/manage/${booking.manageToken}`}
            className="inline-flex items-center gap-1 font-semibold text-deep underline underline-offset-[3px]"
          >
            Need to change plans? Reschedule or cancel
            <ChevronRight className="size-3.5" />
          </Link>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Manage page and view**

`manage/[token]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { getInterviewBookingByToken } from "@/lib/data/interview-public";
import { ManageView } from "./manage-view";

export const metadata: Metadata = { title: "Manage Your Interview" };

export const dynamic = "force-dynamic";

export default async function ManageInterviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const booking = await getInterviewBookingByToken(token);

  return (
    <div className="mx-auto max-w-xl px-4 pt-28 pb-24 sm:px-6">
      <h1 className="font-brand text-3xl font-bold tracking-tight text-balance sm:text-4xl">Manage your interview</h1>
      <div className="mint-panel mt-10 rounded-[2.5rem] p-8 sm:p-10">
        <ManageView token={token} booking={booking} />
      </div>
    </div>
  );
}
```

`manage/[token]/manage-view.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpRight } from "lucide-react";
import { cancelInterviewBookingByTokenAction } from "@/actions/interview-public";
import type { ManagedInterviewBooking } from "@/lib/data/interview-public";
import { formatTime12h } from "@/lib/coffee-chat";
import { INTERVIEW_LOCATION } from "@/lib/interview";
import { formatDateLong } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { InterviewAddToCalendarButtons } from "../../interview-add-to-calendar";

export function ManageView({ token, booking }: { token: string; booking: ManagedInterviewBooking | null }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (!booking) {
    return (
      <p className="text-center text-foreground/70">
        We can&apos;t find a booking for that link. If you think this is a mistake, reach out to us directly.
      </p>
    );
  }

  if (booking.status === "cancelled") {
    return (
      <div className="text-center">
        <p className="text-foreground/70">This booking has been cancelled.</p>
        <Button nativeButton={false} render={<a href="/apply/interview" />} className="mt-6 gap-1.5">
          Book a new time
          <ArrowUpRight className="size-4" />
        </Button>
      </div>
    );
  }

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelInterviewBookingByTokenAction(token);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Booking cancelled.");
      router.refresh();
    });
  }

  // Navigation waits for the cancel to resolve so the old slot is actually freed.
  function handleReschedule() {
    startTransition(async () => {
      const result = await cancelInterviewBookingByTokenAction(token);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.push("/apply/interview");
    });
  }

  return (
    <div className="text-center">
      <p className="text-lg font-semibold">{formatDateLong(booking.date)}</p>
      <p className="mt-1 text-foreground/70">
        {formatTime12h(booking.startTime)} to {formatTime12h(booking.endTime)}
      </p>
      <p className="mt-1 text-foreground/70">{INTERVIEW_LOCATION}</p>
      <InterviewAddToCalendarButtons
        booking={{
          applicantName: booking.applicantName,
          date: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
          manageToken: token,
        }}
      />
      {booking.canSelfCancel ? (
        <>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button variant="outline" onClick={handleCancel} disabled={isPending}>
              Cancel booking
            </Button>
            <Button onClick={handleReschedule} disabled={isPending}>
              Reschedule
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            &quot;Reschedule&quot; cancels this booking and takes you back to pick a new time. Changes close 24 hours before your interview.
          </p>
        </>
      ) : (
        <p className="mt-8 text-sm text-foreground/70">
          Your interview is less than 24 hours away, so it can no longer be changed online. Please contact us and we&apos;ll help.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Verify compiles and renders**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. Then `npm run dev` and open `http://localhost:3000/apply/interview`: with booking closed or no slots it shows the "isn't open yet" message inside the mint panel; `http://localhost:3000/apply/coffee-chat` still renders exactly as before (the shared exports must not change its look). Full flow is verified in Task 11.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(marketing)/apply"
git commit -m "Add interview booking pages"
```

---

### Task 8: Admin portal pages

**Files:**
- Modify: `src/app/portal/(app)/admin/coffee-chats/schedule-view.tsx` (export `CalendarHelp`, `Pill`; copy covers interviews), `src/components/layout/nav-links.ts`
- Create: `src/app/portal/(app)/admin/interviews/{page.tsx,booking-toggle.tsx,invitees-view.tsx,availability-view.tsx,schedule-view.tsx}`

**Interfaces:**
- Consumes: Task 4 data functions/types, Task 5 actions, `calendarFeedPath(execId)` (`@/lib/calendar-feed`), `getCurrentProfile`, `formatTime12h`, `formatDateLong`, `getOrgTodayDateString`, UI components used by the coffee chat views.
- Produces: `/portal/admin/interviews` with tabs `invitees`, `availability`, `schedule` (default `invitees`; `?tab=schedule` selects Schedule, `?tab=availability` selects Availability). Spec's separate "Slots" and "Bookings" tabs are merged into one Schedule tab (each slot row shows its applicant and admin cancel; cancelled bookings are in a collapsible), mirroring the coffee chat admin page.

- [ ] **Step 1: Shared exports and text in coffee chat schedule view**

In `coffee-chats/schedule-view.tsx`: change `function Pill(` to `export function Pill(` and `function CalendarHelp(` to `export function CalendarHelp(`; change the `DialogTitle` text to `Add your coffee chats and interviews to your calendar`. Nothing else.

- [ ] **Step 2: Nav link**

In `src/components/layout/nav-links.ts` add right after the Coffee Chats entry (and add `ClipboardCheck` to the existing `lucide-react` import list in that file):

```ts
  {
    href: "/portal/admin/interviews",
    label: "Interviews",
    icon: ClipboardCheck,
    execOnly: true,
    keywords: "recruitment applicants interview invitees booking availability",
    group: "admin-recruitment",
  },
```

- [ ] **Step 3: Page and booking toggle**

`interviews/page.tsx`:

```tsx
import type { Metadata } from "next";
import {
  getInterviewAdminSettings,
  getInterviewAvailability,
  getInterviewBookings,
  getInterviewSlots,
  getInvitees,
} from "@/lib/data/interview";
import { calendarFeedPath } from "@/lib/calendar-feed";
import { getCurrentProfile } from "@/lib/data/profile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookingToggle } from "./booking-toggle";
import { InviteesView } from "./invitees-view";
import { AvailabilityView } from "./availability-view";
import { ScheduleView } from "./schedule-view";

export const metadata: Metadata = { title: "Admin · Interviews" };

export default async function InterviewsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const [invitees, availability, slots, bookings, settings, profile] = await Promise.all([
    getInvitees(),
    getInterviewAvailability(),
    getInterviewSlots(),
    getInterviewBookings(),
    getInterviewAdminSettings(),
    getCurrentProfile(),
  ]);

  const openSlotCount = slots.filter((s) => s.published && s.bookingStatus === "open").length;
  const defaultTab = tab === "schedule" || tab === "availability" ? tab : "invitees";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Interviews</h1>
          <p className="text-sm text-muted-foreground">
            Invite applicants, set your availability, then manage the interview schedule: who&apos;s on each panel and who&apos;s booked.
          </p>
        </div>
        <BookingToggle open={settings.bookingOpen} />
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="invitees">Invitees</TabsTrigger>
          <TabsTrigger value="availability">Availability</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
        </TabsList>
        <TabsContent value="invitees">
          <InviteesView invitees={invitees} openSlotCount={openSlotCount} />
        </TabsContent>
        <TabsContent value="availability">
          <AvailabilityView availability={availability} currentExecId={profile.id} />
        </TabsContent>
        <TabsContent value="schedule">
          <ScheduleView
            slots={slots}
            bookings={bookings}
            currentExecId={profile.id}
            feedUrl={`${process.env.NEXT_PUBLIC_SITE_URL}${calendarFeedPath(profile.id)}`}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

`interviews/booking-toggle.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setInterviewBookingOpenAction } from "@/actions/interview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/** Opens or closes the public interview page without a deploy. */
export function BookingToggle({ open }: { open: boolean }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function toggle() {
    startTransition(async () => {
      const result = await setInterviewBookingOpenAction(!open);
      if (result.error) toast.error(result.error);
      else toast.success(open ? "Interview booking closed." : "Interview booking opened.");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Badge variant={open ? "default" : "secondary"}>{open ? "Booking open" : "Booking closed"}</Badge>
      <Button variant="outline" onClick={toggle} disabled={isPending}>
        {open ? "Close booking" : "Open booking"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Invitees view**

`interviews/invitees-view.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { addInviteesAction, removeInviteeAction } from "@/actions/interview";
import type { InviteeRow } from "@/lib/data/interview";
import { formatTime12h } from "@/lib/coffee-chat";
import { formatDateLong } from "@/lib/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function InviteesView({ invitees, openSlotCount }: { invitees: InviteeRow[]; openSlotCount: number }) {
  const [isPending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const router = useRouter();

  const bookedCount = invitees.filter((i) => i.booking).length;
  const waitingCount = invitees.length - bookedCount;

  function handleAdd() {
    startTransition(async () => {
      const result = await addInviteesAction(text);
      setProblems(result.errors ?? []);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Added ${result.addedCount ?? 0} invitee(s).`);
      if ((result.errors ?? []).length === 0) setText("");
      router.refresh();
    });
  }

  function handleRemove(invitee: InviteeRow) {
    startTransition(async () => {
      const result = await removeInviteeAction(invitee.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.hadActiveBooking) {
        toast.warning(`${invitee.email} was removed, but their existing booking was kept. Cancel it from the Schedule tab if needed.`);
      } else {
        toast.success("Removed.");
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-4 grid items-start gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add invitees</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            One per line: <span className="font-mono">email</span> or <span className="font-mono">email, name</span>. Only these
            UCSC emails can book an interview.
          </p>
          <textarea
            aria-label="Invitee list"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder={"jane.doe@ucsc.edu, Jane Doe\nsam@ucsc.edu"}
            className="mt-3 w-full rounded-lg border border-input bg-background p-3 font-mono text-sm"
          />
          {problems.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-red-700">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <Button className="mt-3" onClick={handleAdd} disabled={isPending || text.trim() === ""}>
            Add to invite list
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Invitees ({invitees.length}) · {bookedCount} booked · {waitingCount} not yet booked
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {openSlotCount} open published slot(s) for {waitingCount} unbooked invitee(s).
            {openSlotCount < waitingCount && " You may need more availability."}
          </p>
        </CardHeader>
        <CardContent>
          {invitees.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invitees yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitees.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.email}</TableCell>
                    <TableCell>{i.name ?? ""}</TableCell>
                    <TableCell>
                      {i.booking ? (
                        <Badge>
                          {formatDateLong(i.booking.date)} · {formatTime12h(i.booking.startTime)}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Not booked</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${i.email}`}
                        onClick={() => handleRemove(i)}
                        disabled={isPending}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Availability view**

Create `interviews/availability-view.tsx` by copying `coffee-chats/availability-view.tsx` and applying exactly these edits:
1. Imports: replace the actions import with `import { addInterviewAvailabilityAction, removeInterviewAvailabilityAction } from "@/actions/interview";` and the row type import with `import type { InterviewAvailabilityRow } from "@/lib/data/interview";`. Prop type `availability: InterviewAvailabilityRow[]`.
2. Replace `handleAdd`'s success toast block with:
```tsx
      toast.success(`Added ${result.addedCount ?? 0} availability block(s). Use "Generate slots" on the Schedule tab to create interview slots.`);
```
   and delete the `result.generateError` line; call `addInterviewAvailabilityAction` instead of `addAvailabilityEntryAction`.
3. `handleRemove` calls `removeInterviewAvailabilityAction`; its success toast becomes ``toast.success(`Removed. ${result.removedSlotCount ?? 0} unbooked slot(s) deleted.`)``.
4. Card title text `Add the times you're free` → `Add the times you're free for interviews`; add under step 2 a hint line: `<p className="mt-1 text-xs text-muted-foreground">Interviews are 1 hour and start on the hour or half hour, so give blocks of at least an hour.</p>` directly after the "2. Set your time blocks" paragraph.

- [ ] **Step 6: Schedule view**

Create `interviews/schedule-view.tsx` in full:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownUp, CalendarPlus, CircleHelp, Eye, EyeOff, MoreHorizontal, Plus, RefreshCw, Trash2, X, XCircle } from "lucide-react";
import {
  addExecToInterviewSlotAction,
  cancelInterviewBookingAsAdminAction,
  deleteInterviewSlotAction,
  generateInterviewSlotsAction,
  getInterviewExecOptionsAction,
  publishAllInterviewSlotsAction,
  publishInterviewSlotAction,
  removeExecFromInterviewSlotAction,
  swapInterviewExecAction,
} from "@/actions/interview";
import { formatTime12h } from "@/lib/coffee-chat";
import { canAddToPanel, canRemoveFromPanel } from "@/lib/interview";
import { formatDateLong, getOrgTodayDateString } from "@/lib/date";
import type { InterviewBookingRow, InterviewExecOptions, InterviewSlotRow } from "@/lib/data/interview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarHelp, Pill } from "../coffee-chats/schedule-view";

type Router = ReturnType<typeof useRouter>;

function ExecPicker({
  slot,
  placeholder,
  onPick,
  currentName,
  router,
}: {
  slot: InterviewSlotRow;
  placeholder: string;
  currentName?: string;
  onPick: (execId: string) => Promise<{ error?: string }>;
  router: Router;
}) {
  const [isPending, startTransition] = useTransition();
  const [options, setOptions] = useState<InterviewExecOptions | null>(null);

  async function loadOptions() {
    if (options) return;
    const result = await getInterviewExecOptionsAction(slot.date, slot.startTime, slot.endTime);
    if (result.error || !result.options) {
      toast.error(result.error ?? "Couldn't load execs.");
      return;
    }
    setOptions(result.options);
  }

  function handlePick(execId: string | null) {
    if (!execId) return;
    startTransition(async () => {
      const result = await onPick(execId);
      if (result.error) toast.error(result.error);
      else toast.success("Updated.");
      router.refresh();
    });
  }

  const onSlot = new Set(slot.execs.map((e) => e.id));
  const available = (options?.available ?? []).filter((o) => !onSlot.has(o.id));
  const others = (options?.others ?? []).filter((o) => !onSlot.has(o.id));

  return (
    <Select onOpenChange={(open) => open && loadOptions()} onValueChange={handlePick} disabled={isPending}>
      <SelectTrigger className="h-8 w-full min-w-32 text-xs">
        <SelectValue placeholder={placeholder}>{currentName ?? placeholder}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {available.length > 0 && (
          <SelectGroup>
            <SelectLabel>People who are available</SelectLabel>
            {available.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {others.length > 0 && (
          <SelectGroup>
            <SelectLabel>All execs</SelectLabel>
            {others.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}

/** The 2-3 execs on a slot: each can be swapped or removed (down to 2), and a third can be added. */
function PanelControl({ slot, router }: { slot: InterviewSlotRow; router: Router }) {
  const [isPending, startTransition] = useTransition();

  function remove(execId: string) {
    startTransition(async () => {
      const result = await removeExecFromInterviewSlotAction(slot.id, execId);
      if (result.error) toast.error(result.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-1.5">
      {slot.execs.map((exec) => (
        <div key={exec.id} className="flex items-center gap-1">
          <ExecPicker
            slot={slot}
            placeholder={exec.name}
            currentName={exec.name}
            onPick={(newId) => swapInterviewExecAction(slot.id, exec.id, newId)}
            router={router}
          />
          {canRemoveFromPanel(slot.execs.length) && (
            <Button variant="ghost" size="icon-sm" aria-label={`Remove ${exec.name} from panel`} disabled={isPending} onClick={() => remove(exec.id)}>
              <X className="size-4" />
            </Button>
          )}
        </div>
      ))}
      {canAddToPanel(slot.execs.length) && (
        <div className="flex items-center gap-1">
          <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <ExecPicker slot={slot} placeholder="Add a third exec" onPick={(id) => addExecToInterviewSlotAction(slot.id, id)} router={router} />
        </div>
      )}
    </div>
  );
}

type Filter = "all" | "booked" | "open" | "hidden";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "booked", label: "Booked" },
  { value: "open", label: "Open" },
  { value: "hidden", label: "Not published" },
];

function matches(slot: InterviewSlotRow, filter: Filter): boolean {
  if (filter === "booked") return slot.bookingStatus === "booked";
  if (filter === "open") return slot.bookingStatus === "open";
  if (filter === "hidden") return !slot.published;
  return true;
}

export function ScheduleView({
  slots,
  bookings,
  currentExecId,
  feedUrl,
}: {
  slots: InterviewSlotRow[];
  bookings: InterviewBookingRow[];
  currentExecId: string;
  feedUrl: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [mineOnly, setMineOnly] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [showPast, setShowPast] = useState(false);
  const [newestFirst, setNewestFirst] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const router = useRouter();

  const isMine = (execIds: string[]) => execIds.includes(currentExecId);

  function run(action: () => Promise<{ error?: string }>, successMessage?: string) {
    startTransition(async () => {
      const result = await action();
      if (result.error) toast.error(result.error);
      else if (successMessage) toast.success(successMessage);
      router.refresh();
    });
  }

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateInterviewSlotsAction();
      if (result.error) toast.error(result.error);
      else toast.success(`Generated ${result.createdCount ?? 0} new slot(s). They stay hidden until you publish them.`);
      router.refresh();
    });
  }

  function handlePublishAll() {
    startTransition(async () => {
      const result = await publishAllInterviewSlotsAction();
      if (result.error) toast.error(result.error);
      else toast.success(`Published ${result.publishedCount ?? 0} slot(s).`);
      router.refresh();
    });
  }

  function handleCancel(slot: InterviewSlotRow) {
    if (!slot.bookingId) return;
    if (!window.confirm(`Cancel ${slot.applicantName}'s interview? The applicant and the panel will be emailed.`)) return;
    run(() => cancelInterviewBookingAsAdminAction(slot.bookingId!), "Booking cancelled.");
  }

  async function handleCopyFeed() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      toast.success('Link copied. Click "How to add" to finish setting it up.');
    } catch {
      toast.error("Couldn't copy the link.");
    }
  }

  const today = getOrgTodayDateString();
  const stats = useMemo(
    () => ({
      total: slots.length,
      booked: slots.filter((s) => s.bookingStatus === "booked").length,
      hidden: slots.filter((s) => !s.published).length,
    }),
    [slots],
  );

  const days = useMemo(() => {
    const scoped = slots.filter(
      (s) => (showPast || s.date >= today) && (!mineOnly || isMine(s.execs.map((e) => e.id))) && matches(s, filter),
    );
    const byDate = new Map<string, InterviewSlotRow[]>();
    for (const slot of scoped) {
      if (!byDate.has(slot.date)) byDate.set(slot.date, []);
      byDate.get(slot.date)!.push(slot);
    }
    const entries = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
    return newestFirst ? entries.reverse().map(([d, list]) => [d, [...list].reverse()] as const) : entries;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, showPast, today, mineOnly, currentExecId, filter, newestFirst]);

  const cancelled = useMemo(
    () =>
      bookings
        .filter((b) => b.status === "cancelled" && (!mineOnly || isMine(b.execIds)))
        .sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings, mineOnly, currentExecId],
  );

  return (
    <div className="mt-4 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{stats.total}</span> slots ·{" "}
          <span className="font-medium text-foreground">{stats.booked}</span> booked ·{" "}
          <span className={cn("font-medium", stats.hidden > 0 ? "text-amber-600" : "text-foreground")}>{stats.hidden}</span> not published
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-1.5" onClick={handleCopyFeed}>
            <CalendarPlus className="size-4" />
            Copy my calendar link
          </Button>
          <Button variant="ghost" className="gap-1.5" onClick={() => setHelpOpen(true)}>
            <CircleHelp className="size-4" />
            How to add
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" disabled={isPending} />}>
              Actions
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={handleGenerate}>
                <RefreshCw className="size-4" />
                Generate slots
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePublishAll} disabled={stats.hidden === 0}>
                <Eye className="size-4" />
                Publish all hidden
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Pill key={f.value} active={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.label}
          </Pill>
        ))}
        <span className="mx-1 h-5 w-px bg-border" />
        <Pill active={mineOnly} onClick={() => setMineOnly((v) => !v)}>
          Mine
        </Pill>
        <Pill active={showPast} onClick={() => setShowPast((v) => !v)}>
          Past
        </Pill>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setNewestFirst((v) => !v)}>
          <ArrowDownUp className="size-4" />
          {newestFirst ? "Latest first" : "Earliest first"}
        </Button>
      </div>

      {days.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {slots.length === 0
            ? 'No slots yet. Add availability, then use Actions → "Generate slots".'
            : "No slots match these filters."}
        </p>
      ) : (
        <div className="space-y-6">
          {days.map(([date, daySlots]) => (
            <section key={date}>
              <div className="mb-2 flex items-baseline gap-2">
                <h3 className="font-semibold">{formatDateLong(date)}</h3>
                <span className="text-xs text-muted-foreground">
                  {daySlots.filter((s) => s.bookingStatus === "booked").length} of {daySlots.length} booked
                </span>
              </div>
              <ul className="divide-y overflow-hidden rounded-xl border">
                {daySlots.map((slot) => (
                  <li
                    key={slot.id}
                    className={cn(
                      "grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-2 p-3 sm:grid-cols-[7rem_minmax(0,16rem)_1fr_auto]",
                      !slot.published && "bg-amber-50/60 dark:bg-amber-950/20",
                    )}
                  >
                    <div>
                      <p className="font-medium tabular-nums">{formatTime12h(slot.startTime)}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">to {formatTime12h(slot.endTime)}</p>
                    </div>

                    <div className="col-span-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                      <PanelControl slot={slot} router={router} />
                    </div>

                    <div className="col-start-2 row-start-1 min-w-0 text-right sm:col-start-3 sm:text-left">
                      {slot.bookingStatus === "booked" ? (
                        <>
                          <p className="truncate text-sm font-medium">{slot.applicantName}</p>
                          <p className="truncate text-xs text-muted-foreground">{slot.applicantEmail}</p>
                        </>
                      ) : (
                        <Badge variant="secondary">Open</Badge>
                      )}
                      {!slot.published && (
                        <Badge variant="outline" className="mt-1 border-amber-500 text-amber-700 dark:text-amber-400">
                          Not published
                        </Badge>
                      )}
                    </div>

                    <div className="col-span-2 flex justify-end sm:col-span-1 sm:col-start-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Slot actions" disabled={isPending} />}>
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => run(() => publishInterviewSlotAction(slot.id, !slot.published))}>
                            {slot.published ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                            {slot.published ? "Hide from applicants" : "Publish to applicants"}
                          </DropdownMenuItem>
                          {slot.bookingStatus === "booked" ? (
                            <DropdownMenuItem variant="destructive" onClick={() => handleCancel(slot)}>
                              <XCircle className="size-4" />
                              Cancel booking
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem variant="destructive" onClick={() => run(() => deleteInterviewSlotAction(slot.id))}>
                              <Trash2 className="size-4" />
                              Delete slot
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {cancelled.length > 0 && (
        <details className="rounded-xl border p-3">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">Cancelled ({cancelled.length})</summary>
          <ul className="mt-3 divide-y text-sm">
            {cancelled.map((b) => (
              <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                <span className="font-medium">
                  {b.applicantName} <span className="font-normal text-muted-foreground">· {b.applicantEmail}</span>
                </span>
                <span className="text-muted-foreground">
                  {formatDateLong(b.date)} · {formatTime12h(b.startTime)} · {b.execNames.join(" & ")}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <CalendarHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. Then `npm run dev`, sign in as an exec, open `/portal/admin/interviews`: all three tabs render, "Interviews" appears in the admin sidebar under Recruitment, and `/portal/admin/coffee-chats` still renders (shared exports). If the page throws because the migration isn't applied, apply it first (Task 1 Step 4).

- [ ] **Step 8: Commit**

```bash
git add "src/app/portal/(app)/admin" src/components/layout/nav-links.ts
git commit -m "Add interviews admin page"
```

---

### Task 9: Reminder emails

**Files:**
- Create: `src/lib/interview-reminders.ts`, `src/lib/interview-reminders.test.ts`, `src/app/api/cron/interview-reminders/route.ts`
- Modify: `vercel.json`, `.env.local.example`

**Interfaces:**
- Consumes: `ORG_TIME_ZONE`, `formatOrgDate` (`@/lib/date`), `buildInterviewReminderEmail` (Task 3), `sendEmail`, `createAdminClient`, `normalizeTime`.
- Produces (exact):

```ts
export const INTERVIEW_REMINDER_HOUR = 8;
export function isInterviewReminderHour(now: Date): boolean;
export interface ReminderBooking { id: string; status: string; applicantName: string; applicantEmail: string; manageToken: string; date: string; startTime: string; endTime: string; reminderDayBeforeSentAt: string | null; reminderMorningSentAt: string | null }
export interface InterviewReminder { bookingId: string; kind: "day_before" | "morning"; to: string; applicantName: string; manageToken: string; date: string; startTime: string; endTime: string }
export function selectInterviewReminders(input: { today: string; tomorrow: string; bookings: ReminderBooking[] }): InterviewReminder[];
// GET /api/cron/interview-reminders  -> { sent, failed } | { skipped } | 401
```

- [ ] **Step 1: Write failing tests**

`src/lib/interview-reminders.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isInterviewReminderHour, selectInterviewReminders, type ReminderBooking } from "./interview-reminders";

const booking = (over: Partial<ReminderBooking>): ReminderBooking => ({
  id: "b1",
  status: "confirmed",
  applicantName: "Jane",
  applicantEmail: "jane@ucsc.edu",
  manageToken: "tok",
  date: "2026-10-07",
  startTime: "09:00",
  endTime: "10:00",
  reminderDayBeforeSentAt: null,
  reminderMorningSentAt: null,
  ...over,
});

const input = (bookings: ReminderBooking[]) => ({ today: "2026-10-06", tomorrow: "2026-10-07", bookings });

describe("isInterviewReminderHour", () => {
  it("is true at 8am Pacific in summer (PDT) and winter (PST)", () => {
    expect(isInterviewReminderHour(new Date("2026-07-15T15:00:00Z"))).toBe(true);
    expect(isInterviewReminderHour(new Date("2026-12-15T16:00:00Z"))).toBe(true);
  });

  it("is false an hour off in either season", () => {
    expect(isInterviewReminderHour(new Date("2026-07-15T16:00:00Z"))).toBe(false);
    expect(isInterviewReminderHour(new Date("2026-12-15T15:00:00Z"))).toBe(false);
  });
});

describe("selectInterviewReminders", () => {
  it("sends a day-before reminder for tomorrow's interview", () => {
    const [r, ...rest] = selectInterviewReminders(input([booking({})]));
    expect(rest).toEqual([]);
    expect(r).toMatchObject({ bookingId: "b1", kind: "day_before", to: "jane@ucsc.edu", manageToken: "tok" });
  });

  it("sends a morning reminder for today's interview", () => {
    const [r] = selectInterviewReminders(input([booking({ date: "2026-10-06" })]));
    expect(r.kind).toBe("morning");
  });

  it("skips cancelled bookings", () => {
    expect(selectInterviewReminders(input([booking({ status: "cancelled" })]))).toEqual([]);
  });

  it("skips reminders already sent", () => {
    expect(selectInterviewReminders(input([booking({ reminderDayBeforeSentAt: "2026-10-06T15:00:00Z" })]))).toEqual([]);
    expect(
      selectInterviewReminders(input([booking({ date: "2026-10-06", reminderMorningSentAt: "2026-10-06T15:00:00Z" })])),
    ).toEqual([]);
  });

  it("ignores interviews on other days", () => {
    expect(selectInterviewReminders(input([booking({ date: "2026-10-09" }), booking({ id: "b2", date: "2026-10-01" })]))).toEqual([]);
  });

  it("handles several bookings, one reminder each", () => {
    const result = selectInterviewReminders(
      input([booking({ id: "a" }), booking({ id: "b", date: "2026-10-06", applicantEmail: "sam@ucsc.edu" })]),
    );
    expect(result.map((r) => [r.bookingId, r.kind])).toEqual([
      ["a", "day_before"],
      ["b", "morning"],
    ]);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/lib/interview-reminders.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/interview-reminders.ts`**

```ts
import { ORG_TIME_ZONE } from "./date";

export const INTERVIEW_REMINDER_HOUR = 8;

/** True when `now` falls in the 8am hour in the org's time zone (DST-aware). */
export function isInterviewReminderHour(now: Date): boolean {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: ORG_TIME_ZONE,
    hourCycle: "h23",
    hour: "2-digit",
  }).format(now);
  return Number(hour) === INTERVIEW_REMINDER_HOUR;
}

export interface ReminderBooking {
  id: string;
  status: string;
  applicantName: string;
  applicantEmail: string;
  manageToken: string;
  date: string;
  startTime: string;
  endTime: string;
  reminderDayBeforeSentAt: string | null;
  reminderMorningSentAt: string | null;
}

export interface InterviewReminder {
  bookingId: string;
  kind: "day_before" | "morning";
  to: string;
  applicantName: string;
  manageToken: string;
  date: string;
  startTime: string;
  endTime: string;
}

/**
 * Who to remind: confirmed bookings for tomorrow that haven't had the
 * day-before reminder, and confirmed bookings for today that haven't had
 * the morning reminder. Cancelled bookings never get one.
 */
export function selectInterviewReminders(input: {
  today: string;
  tomorrow: string;
  bookings: ReminderBooking[];
}): InterviewReminder[] {
  const reminders: InterviewReminder[] = [];
  for (const b of input.bookings) {
    if (b.status !== "confirmed") continue;
    let kind: InterviewReminder["kind"] | null = null;
    if (b.date === input.tomorrow && !b.reminderDayBeforeSentAt) kind = "day_before";
    else if (b.date === input.today && !b.reminderMorningSentAt) kind = "morning";
    if (!kind) continue;
    reminders.push({
      bookingId: b.id,
      kind,
      to: b.applicantEmail,
      applicantName: b.applicantName,
      manageToken: b.manageToken,
      date: b.date,
      startTime: b.startTime,
      endTime: b.endTime,
    });
  }
  return reminders;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/interview-reminders.test.ts`
Expected: PASS.

- [ ] **Step 5: Cron route**

`src/app/api/cron/interview-reminders/route.ts`:

```ts
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

    // Claim the reminder first (only one concurrent run can win the null -> now update), so a retried
    // invocation can't send it twice. If the send then fails, release the claim so it can be retried.
    const { data: claimed, error: claimError } = await supabase
      .from("interview_bookings")
      .update({ [column]: new Date().toISOString() })
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
      await supabase.from("interview_bookings").update({ [column]: null }).eq("id", reminder.bookingId);
    }
  }

  return Response.json({ sent, failed });
}
```

- [ ] **Step 6: Cron schedule and env docs**

`vercel.json`: add to the `crons` array (keep the two existing entries):

```json
    { "path": "/api/cron/interview-reminders", "schedule": "0 15 * * *" },
    { "path": "/api/cron/interview-reminders", "schedule": "0 16 * * *" }
```

`.env.local.example`: change the comment `# Vercel Cron -- protects /api/cron/* routes (attendance reminder emails).` to `# Vercel Cron -- protects /api/cron/* routes (attendance and interview reminder emails).`

- [ ] **Step 7: Manual check of auth and guard**

With `npm run dev` and `CRON_SECRET=test` in `.env.local`:
- `curl -i localhost:3000/api/cron/interview-reminders` → 401.
- `curl -i -H "Authorization: Bearer test" localhost:3000/api/cron/interview-reminders` → 200 with `{"skipped":"not 8am Pacific"}` (unless it is actually 8am Pacific).
- Unset `CRON_SECRET`, restart, then `curl -H "Authorization: Bearer undefined" ...` → 401.

- [ ] **Step 8: Commit**

```bash
git add src/lib/interview-reminders.ts src/lib/interview-reminders.test.ts src/app/api/cron/interview-reminders vercel.json .env.local.example
git commit -m "Add interview reminder emails"
```

---

### Task 10: Exec calendar feed and notification bell

**Files:**
- Create: `src/lib/interview-feed.ts`
- Modify: `src/lib/calendar-feed.ts`, `src/lib/data/notifications.ts`

**Interfaces:**
- Consumes: `interviewEventLines` (Task 3), `buildIcsCalendar(bookings, extraEventLines)` (Task 3), Task 1 tables.
- Produces: `export async function buildInterviewFeedEvents(execId: string): Promise<string[]>` (VEVENT lines for every confirmed interview this exec is on); the existing `/api/coffee-chat/feed/[execId]/[sig]/calendar.ics` URL now returns both kinds of events; bell entries with ids `interview-booked-<bookingId>` / `interview-cancelled-<bookingId>`.

- [ ] **Step 1: Write `src/lib/interview-feed.ts`**

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTime } from "@/lib/coffee-chat";
import { interviewEventLines } from "@/lib/interview-invite";

/** VEVENT lines for every confirmed interview this exec is on, for the shared exec calendar feed. */
export async function buildInterviewFeedEvents(execId: string): Promise<string[]> {
  const supabase = createAdminClient();

  const { data: mine, error } = await supabase.from("interview_slot_execs").select("slot_id").eq("exec_id", execId);
  if (error) throw error;
  const slotIds = (mine ?? []).map((r) => r.slot_id);
  if (slotIds.length === 0) return [];

  const [{ data: slots, error: slotsError }, { data: panel, error: panelError }, { data: bookings, error: bookingsError }] =
    await Promise.all([
      supabase.from("interview_slots").select("id, date, start_time, end_time").in("id", slotIds),
      supabase.from("interview_slot_execs").select("slot_id, exec_id").in("slot_id", slotIds),
      supabase
        .from("interview_bookings")
        .select("id, slot_id, applicant_name, manage_token")
        .eq("status", "confirmed")
        .in("slot_id", slotIds),
    ]);
  if (slotsError) throw slotsError;
  if (panelError) throw panelError;
  if (bookingsError) throw bookingsError;

  const otherIds = [...new Set((panel ?? []).map((p) => p.exec_id).filter((id) => id !== execId))];
  const { data: profiles, error: profilesError } =
    otherIds.length > 0 ? await supabase.from("profiles").select("id, name").in("id", otherIds) : { data: [], error: null };
  if (profilesError) throw profilesError;
  const names = new Map((profiles ?? []).map((p) => [p.id, p.name]));
  const slotsById = new Map((slots ?? []).map((s) => [s.id, s]));

  return (bookings ?? []).flatMap((b) => {
    const slot = slotsById.get(b.slot_id);
    if (!slot) return [];
    const panelNames = (panel ?? [])
      .filter((p) => p.slot_id === b.slot_id && p.exec_id !== execId)
      .map((p) => names.get(p.exec_id) ?? "Unknown");
    return interviewEventLines({
      id: b.id,
      applicantName: b.applicant_name,
      date: slot.date,
      startTime: normalizeTime(slot.start_time),
      endTime: normalizeTime(slot.end_time),
      manageToken: b.manage_token,
      panelNames,
    });
  });
}
```

- [ ] **Step 2: Extend `buildExecFeed`**

In `src/lib/calendar-feed.ts`: add `import { buildInterviewFeedEvents } from "@/lib/interview-feed";`. Rename the existing `buildExecFeed` to a private `buildCoffeeChatEvents(execId): Promise<(CoffeeChatBookingForInvite & { id: string })[]>` that returns the array it currently passes to `buildIcsCalendar` (return `[]` where it currently returns `buildIcsCalendar([])` for "no slots"; import the type `CoffeeChatBookingForInvite` from `@/lib/calendar-invite`). Then add:

```ts
/** Every confirmed coffee chat and interview this exec is on, as one subscribable calendar. */
export async function buildExecFeed(execId: string): Promise<string> {
  const [coffeeChats, interviewLines] = await Promise.all([buildCoffeeChatEvents(execId), buildInterviewFeedEvents(execId)]);
  return buildIcsCalendar(coffeeChats, interviewLines);
}
```

Update the doc comment above `buildCoffeeChatEvents` accordingly. Keep `signExecId`, `isValidFeedSignature`, `calendarFeedPath` unchanged.

- [ ] **Step 3: Notification bell**

In `src/lib/data/notifications.ts`, inside the second `Promise.all` (after the `coffee_chat_bookings` entry), add a third element and destructure it as `{ data: interviewBookings }`... Because interview bookings must be filtered to slots the exec is on and PostgREST can't join through the join table with the current hand-written types, do it as a small async IIFE:

```ts
    isExecUser
      ? (async () => {
          const { data: mine } = await supabase.from("interview_slot_execs").select("slot_id").eq("exec_id", userId);
          const slotIds = (mine ?? []).map((r) => r.slot_id);
          if (slotIds.length === 0) return { data: [] };
          return supabase
            .from("interview_bookings")
            .select("id, applicant_name, status, created_at, cancelled_at")
            .in("slot_id", slotIds)
            .order("created_at", { ascending: false })
            .limit(15);
        })()
      : Promise.resolve({ data: null }),
```

Change the destructuring from `const [, { data: coffeeChatBookings }] = await Promise.all([` to `const [, { data: coffeeChatBookings }, { data: interviewBookings }] = await Promise.all([`. Then, after the coffee chat loop, add:

```ts
  for (const b of (interviewBookings ?? []) as { id: string; applicant_name: string; status: string; created_at: string; cancelled_at: string | null }[]) {
    if (b.status === "confirmed") {
      items.push({
        id: `interview-booked-${b.id}`,
        message: `${b.applicant_name} booked an interview with you.`,
        href: "/portal/admin/interviews?tab=schedule",
        occurredAt: b.created_at,
      });
    } else if (b.status === "cancelled" && b.cancelled_at) {
      items.push({
        id: `interview-cancelled-${b.id}`,
        message: `${b.applicant_name}'s interview with you was cancelled.`,
        href: "/portal/admin/interviews?tab=schedule",
        occurredAt: b.cancelled_at,
      });
    }
  }
```

Update the doc comment's table list to mention `interview_bookings`.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: clean and all PASS. The feed and bell are exercised end-to-end in Task 11.

- [ ] **Step 5: Commit**

```bash
git add src/lib/interview-feed.ts src/lib/calendar-feed.ts src/lib/data/notifications.ts
git commit -m "Include interviews in exec calendar feed and notifications"
```

---

### Task 11: Apply-page copy and end-to-end verification

**Files:**
- Modify: `src/app/(marketing)/apply/page.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Update the recruitment steps copy**

In `src/app/(marketing)/apply/page.tsx` change the "Interview with our team" step body to:

```tsx
    body: "By invitation. If we invite you, you'll get an email with a link to book a one-hour, conversational interview with a panel of our execs (sometimes including a short case exercise) at the SnE Library.",
```

(Wording may be adjusted by the user; keep it factual: invite-only, 1 hour, panel, SnE Library.)

- [ ] **Step 2: Full automated check**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass; the build succeeds with the new routes `/apply/interview`, `/apply/interview/manage/[token]`, `/api/interview/[token]/calendar.ics`, `/api/cron/interview-reminders`, `/portal/admin/interviews`.

- [ ] **Step 3: Manual end-to-end in a real browser**

Requires the migration applied (Task 1 Step 4), at least four exec accounts, and `.env.local` with Turnstile keys (Cloudflare's test keys `1x00000000000000000000AA` / `1x0000000000000000000000000000000AA` work for development) and an email provider. Use the `run` skill or `npm run dev` plus a browser. Check each:

1. Admin → Interviews → Invitees: paste `a@ucsc.edu, Alex`, ` B@UCSC.edu `, a blank line, `bad@gmail.com`, a duplicate of `a@ucsc.edu`. Expect 2 added, one error line for `bad@gmail.com`, no duplicate row.
2. Availability: as 4 execs (or 4 accounts in turn) add blocks 2–4pm on a date more than 12 hours ahead. Schedule → Actions → Generate slots: expect two panels of 2 at the first hour and two at the next, all marked "Not published". Publish all hidden. Remove an exec from a 3-person panel only down to 2 (the X disappears at 2); add a third exec via the picker.
3. Booking closed: `/apply/interview` shows "isn't open yet". Click "Open booking" in the admin header, reload.
4. `/apply/interview`: shaded dates, each start time appears once, SnE Library shown, no location picker. Book with an email **not** on the list: exact message `This booking page is for invited applicants. Contact us if you think this is a mistake.`
5. Book as `A@UCSC.edu` (mixed case) → confirmation screen, confirmation email (Google + .ics + manage link), panel emails naming applicant and the other panel members; bell shows "booked an interview with you".
6. Try to book again with the same email: error pointing to the confirmation email, no token shown. Try a slot starting inside 12 hours: it must not be listed.
7. Manage link: Cancel and Reschedule work when more than 24h away. For a slot inside 24h (adjust a test slot's date in the DB), the page shows the "contact us" text and no buttons, and the action itself also refuses.
8. Admin cancel (Schedule → ⋯ → Cancel booking): applicant receives the cancelled email, panel receives the cancelled email, then the same applicant can book again.
9. Swap an exec on a booked slot: nobody is emailed; the swapped-in exec's calendar feed shows the event.
10. Remove an invitee who has a booking: warning toast, booking still listed under Schedule.
11. Exec feed: open the copied "calendar link" in a browser: an `.ics` containing both coffee chat and interview events; a cancelled interview is gone.
12. Reminders: set `CRON_SECRET`, temporarily call the route logic with a booking dated tomorrow by changing `isInterviewReminderHour` locally to `() => true` (revert afterwards) and hit the route with the bearer header: one email, `reminder_day_before_sent_at` stamped; calling again sends nothing.
13. `/apply/coffee-chat` and `/portal/admin/coffee-chats` still look and behave exactly as before.

Report to the user any step that could not be verified (e.g. no real email credentials) rather than claiming it passed.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(marketing)/apply/page.tsx"
git commit -m "Update recruitment copy for invite-only interviews"
```

- [ ] **Step 5: Hand off**

Use the `superpowers:verification-before-completion` skill before claiming done, then `superpowers:finishing-a-development-branch`.

---

## Self-Review Notes

- **Spec coverage:** invite-only allowlist (Tasks 2, 5, 6, 8); 60-min slots on :00/:30 grid with 2–3 panels and non-overlap (Task 2); SnE Library constant, no picker (Tasks 2, 7); 12h lead and 24h cutoff (Tasks 2, 6, 7); data model and RLS (Task 1); applicant flow incl. manage/cancel/reschedule and `.ics` (Tasks 6, 7); admin flow (Tasks 5, 8; tabs merged, see Task 8 Interfaces); exec emails with applicant and panel names, bell, auto-updating calendar feed (Tasks 3, 5, 10); applicant cancel-by-admin email, no email on swap or self-cancel (Tasks 5, 6); reminder emails with cron (Task 9); apply-page copy (Task 11); security (Tasks 6, 11); tests (Tasks 2, 3, 9).
- **Deliberate deviations from the spec:** Slots and Bookings tabs merged into one "Schedule" tab; availability changes do not auto-generate slots (spec says explicit Generate + Publish); the pair-balancing is a greedy approximation of coffee chat's exhaustive matcher. The "email-first gate" described in chat became a booking-time gate (already noted to the user).
- **Type consistency:** `InterviewSlotAssignment.execIds`, `InterviewSlotRow.execs`, action signatures, and `ManagedInterviewBooking.canSelfCancel` are used consistently across Tasks 2–10.
