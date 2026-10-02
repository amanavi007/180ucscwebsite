# Coffee Chat Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let exec input coffee-chat availability, auto-generate and manually adjust 2-exec bookable slots, and let recruitment applicants — no login required — browse, book, and manage (cancel/reschedule) a coffee chat directly from the marketing site, with email confirmation and calendar-add links.

**Architecture:** Exec-side scheduling (availability, slot generation/swap, bookings admin) is built the same way every other admin feature in this app is: Server Actions using the authenticated Supabase client, gated by RLS on `is_exec()`. The applicant-facing flow has no session, so it uses the existing service-role client (`createAdminClient()`) inside its own Server Actions, with all validation (UCSC email, Turnstile, duplicate-booking, slot-still-open) done in application code before any write; the four new tables' RLS stays `authenticated` + `is_exec()` only — nothing is opened to `anon`. The slot-pairing algorithm and every other piece of real logic is written as pure, unit-tested functions, mirroring how `src/lib/attendance.ts` is tested today.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres + RLS), TypeScript, Vitest, react-hook-form + zod, Resend (new — transactional email), Cloudflare Turnstile (new — bot guard).

**Spec:** `docs/superpowers/specs/2026-09-28-coffee-chat-scheduling-design.md`

## Global Constraints

- Every mutation goes through a Server Action. There are no `anon`-role RLS policies anywhere in this feature — the public flow uses the service-role client (`src/lib/supabase/admin.ts`) from inside Server Actions, never a client-exposed key.
- RLS on all 4 new tables (`coffee_chat_availability`, `coffee_chat_slots`, `coffee_chat_bookings`) is `authenticated` + `public.is_exec()` for every operation — same blanket exec-wide access as `room_bookings`/`meeting_dates`/`org_events`. No per-row ownership restriction.
- UCSC email (`@ucsc.edu`) is validated server-side in the Server Action, not just in the client form — the client check is a UX nicety, not the enforcement.
- One confirmed booking per slot is enforced by a partial unique index (`unique (slot_id) where status = 'confirmed'`); one active booking per applicant email by a second partial unique index (`unique (applicant_email) where status = 'confirmed'`). These indexes are the actual correctness guarantee under a race — application code pre-checks for a nicer error message, but must also handle the DB rejecting the insert.
- Applicants never see which execs they're paired with before booking (shown only after, and only in the confirmation — not required to be shown at all, per spec; this plan doesn't surface exec names to applicants anywhere).
- Minimum booking lead time is a hardcoded constant (120 minutes) for this iteration — not admin-configurable yet.
- All dates/times are campus-local (`America/Los_Angeles`); there is no per-visitor timezone handling anywhere in this feature, matching how `getOrgTodayDateString()` already works for the rest of the app.
- Public pages (`/apply/coffee-chat/**`) must be built from the existing marketing design system (`mint-panel`, `font-brand`, `Button`, `Accordion`, `Card` — see `src/app/(marketing)/apply/page.tsx` for the reference look). Admin pages match the existing portal admin look (see `src/app/portal/(app)/admin/rooms`).
- New environment variables this feature requires (added to `.env.local.example` as they're introduced): `RESEND_API_KEY`, `COFFEE_CHAT_FROM_EMAIL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`.
- This repo has **no local Supabase stack** (no `supabase/config.toml`) — it's linked directly to a shared remote project (`supabase/.temp/project-ref`). Applying the Task 1 migration with `supabase db push` changes that live, shared database. Confirm with the user before running it, the same as any other action that touches shared infrastructure.
- Out of scope for this plan (see spec): interview scheduling, reminder emails / any cron job, no-show tracking, a generic "session type" abstraction.

## Review Focus

- A second applicant clicks the same slot within milliseconds of the first — the loser must get "that slot was just taken, pick another," not a crash or a silent double-booking. (Task 12)
- An applicant who already has a confirmed booking tries to book a different slot with the same email — they should see their existing booking, not a confusing DB error or a second booking. (Task 12)
- A non-UCSC (or malformed) email is submitted to the booking action directly, bypassing the client-side form check — the server must still reject it. (Task 2, enforced again in Task 12)
- Slot generation or a manual swap ends up assigning the same exec to two overlapping time slots — this must be structurally prevented, not just "unlikely." (Task 2)
- An applicant opens `/apply/coffee-chat/manage/[token]` with an invalid, mistyped, or already-cancelled token — the page must show a friendly "we can't find that booking" state, not throw. (Task 11, Task 15)

---

### Task 1: Database schema

**Files:**
- Create: `supabase/migrations/20260928000001_coffee_chat_scheduling.sql`
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces: tables `coffee_chat_availability`, `coffee_chat_slots`, `coffee_chat_bookings`; `org_settings` keys `coffee_chat_booking_open` (`'true'`/`'false'`) and `coffee_chat_default_location` (free text); matching `Database["public"]["Tables"]` types for all three tables, used by every later task.

- [ ] **Step 1: Write the migration**

```sql
-- Coffee chat scheduling: exec input their own availability, an admin
-- action turns overlapping availability into bookable 2-exec slots (with
-- manual swap), and applicants -- no login -- book a slot with just their
-- name and UCSC email. See docs/superpowers/specs/2026-09-28-coffee-chat-
-- scheduling-design.md for the full design.
--
-- All four writes into these tables come from Server Actions: the exec
-- side uses the normal authenticated client (RLS below), the applicant
-- side uses the service-role client and never touches RLS at all. RLS
-- here is exec-only on purpose -- there is no anon policy.

create table public.coffee_chat_availability (
  id uuid primary key default gen_random_uuid(),
  exec_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  constraint coffee_chat_availability_time_check check (end_time > start_time)
);

create index coffee_chat_availability_date_idx on public.coffee_chat_availability (date);
create index coffee_chat_availability_exec_id_idx on public.coffee_chat_availability (exec_id);

alter table public.coffee_chat_availability enable row level security;

create policy coffee_chat_availability_all on public.coffee_chat_availability
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create table public.coffee_chat_slots (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_time time not null,
  end_time time not null,
  location text not null default '',
  exec_id_1 uuid not null references public.profiles (id) on delete cascade,
  exec_id_2 uuid references public.profiles (id) on delete cascade,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coffee_chat_slots_time_check check (end_time > start_time)
);

create index coffee_chat_slots_date_idx on public.coffee_chat_slots (date);

alter table public.coffee_chat_slots enable row level security;

create policy coffee_chat_slots_all on public.coffee_chat_slots
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create trigger coffee_chat_slots_set_updated_at
  before update on public.coffee_chat_slots
  for each row execute procedure public.set_updated_at();

create table public.coffee_chat_bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.coffee_chat_slots (id) on delete cascade,
  applicant_name text not null,
  applicant_email text not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  manage_token text not null unique,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

-- The real enforcement: at most one confirmed booking per slot, and at
-- most one confirmed booking per applicant email, even under a race --
-- Postgres rejects the second concurrent insert instead of both succeeding.
create unique index coffee_chat_bookings_slot_active_idx
  on public.coffee_chat_bookings (slot_id) where status = 'confirmed';

create unique index coffee_chat_bookings_email_active_idx
  on public.coffee_chat_bookings (applicant_email) where status = 'confirmed';

alter table public.coffee_chat_bookings enable row level security;

create policy coffee_chat_bookings_all on public.coffee_chat_bookings
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

insert into public.org_settings (key, value) values
  ('coffee_chat_booking_open', 'false'),
  ('coffee_chat_default_location', '')
on conflict (key) do nothing;
```

- [ ] **Step 2: Confirm before applying, then push the migration**

This repo has no local Supabase stack, so this applies directly to the
shared linked project. Confirm with the user before running:

Run: `supabase db push`
Expected: the CLI lists `20260928000001_coffee_chat_scheduling.sql` as
the one pending migration and applies it without error.

- [ ] **Step 3: Verify the tables exist**

Run: `supabase db push --dry-run` (should show "up to date", nothing
pending) or query directly:

```bash
supabase db push --dry-run
```

Expected: no pending migrations. If you have `psql`/dashboard access,
confirm `select * from public.org_settings where key like 'coffee_chat%'`
returns the two seeded rows.

- [ ] **Step 4: Add the new tables to `database.types.ts`**

Add these three blocks inside `Database["public"]["Tables"]` in
`src/lib/supabase/database.types.ts`, following the existing style (see
the `room_bookings` block for the pattern):

```ts
      coffee_chat_availability: {
        Row: {
          id: string;
          exec_id: string;
          date: string;
          start_time: string;
          end_time: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          exec_id: string;
          date: string;
          start_time: string;
          end_time: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["coffee_chat_availability"]["Insert"]>;
        Relationships: [];
      };
      coffee_chat_slots: {
        Row: {
          id: string;
          date: string;
          start_time: string;
          end_time: string;
          location: string;
          exec_id_1: string;
          exec_id_2: string | null;
          published: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          start_time: string;
          end_time: string;
          location?: string;
          exec_id_1: string;
          exec_id_2?: string | null;
          published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["coffee_chat_slots"]["Insert"]>;
        Relationships: [];
      };
      coffee_chat_bookings: {
        Row: {
          id: string;
          slot_id: string;
          applicant_name: string;
          applicant_email: string;
          status: string;
          manage_token: string;
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
          created_at?: string;
          cancelled_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["coffee_chat_bookings"]["Insert"]>;
        Relationships: [];
      };
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260928000001_coffee_chat_scheduling.sql src/lib/supabase/database.types.ts
git commit -m "Add coffee chat scheduling schema"
```

---

### Task 2: Pure scheduling & validation logic

**Files:**
- Create: `src/lib/coffee-chat.ts`
- Create: `src/lib/coffee-chat.test.ts`
- Modify: `src/lib/date.ts`
- Create: `src/lib/date.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `ORG_TIME_ZONE`, `zonedDateTimeToUtc(dateStr, timeStr, timeZone?)` from `src/lib/date.ts`; `AvailabilityBlock`, `GeneratedSlot`, `generateSlots(availability, chunkMinutes)`, `ExistingSlotAssignment`, `isSwapEligible(targetSlot, candidateExecId, candidateAvailability, allSlots)`, `SlotBookabilityInput`, `isSlotBookable(slot, now, minLeadMinutes)`, `isValidUcscEmail(email)`, `DEFAULT_MIN_LEAD_MINUTES`, `DEFAULT_CHUNK_MINUTES` from `src/lib/coffee-chat.ts` — used by Tasks 4, 5, 11, 12.

- [ ] **Step 1: Write the failing test for the timezone helper**

```ts
// src/lib/date.test.ts
import { describe, expect, it } from "vitest";
import { zonedDateTimeToUtc } from "./date";

describe("zonedDateTimeToUtc", () => {
  it("converts a Pacific Standard Time wall-clock moment to UTC (winter, UTC-8)", () => {
    const result = zonedDateTimeToUtc("2026-01-15", "14:30");
    expect(result.toISOString()).toBe("2026-01-15T22:30:00.000Z");
  });

  it("converts a Pacific Daylight Time wall-clock moment to UTC (summer, UTC-7)", () => {
    const result = zonedDateTimeToUtc("2026-07-15", "14:30");
    expect(result.toISOString()).toBe("2026-07-15T21:30:00.000Z");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/date.test.ts`
Expected: FAIL with "zonedDateTimeToUtc is not exported" or similar.

- [ ] **Step 3: Implement the timezone helper**

Add to `src/lib/date.ts` (keep the existing `parseLocalDate`/`formatOrgDate`/`getOrgTodayDateString`, and switch `formatOrgDate`'s hardcoded string to the new constant):

```ts
export const ORG_TIME_ZONE = "America/Los_Angeles";
```

Update the existing `formatOrgDate` to use it: replace `timeZone: "America/Los_Angeles"` with `timeZone: ORG_TIME_ZONE`.

Then add:

```ts
/** Minutes to add to a UTC instant to get org-local wall-clock time, for the given instant (DST-aware). */
function getOrgOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ORG_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(instant)
    .reduce(
      (acc, p) => {
        acc[p.type] = p.value;
        return acc;
      },
      {} as Record<string, string>,
    );

  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asIfUtc - instant.getTime()) / 60_000;
}

/**
 * A "YYYY-MM-DD" date + "HH:MM" time, both meant as org-local (Santa Cruz)
 * wall-clock, converted to the actual UTC instant -- DST-aware. Needed
 * because coffee chat slots are stored as plain date/time with no
 * timezone column (same as every other date-only column in this app), but
 * comparing a slot's start time against "now" for the minimum-lead-time
 * check requires a real instant.
 */
export function zonedDateTimeToUtc(dateStr: string, timeStr: string, timeZone: string = ORG_TIME_ZONE): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  const offsetMinutes = getOrgOffsetMinutes(new Date(guessUtcMs));
  return new Date(guessUtcMs - offsetMinutes * 60_000);
}
```

(`timeZone` param is accepted for testability/clarity but always defaults to `ORG_TIME_ZONE` in real use -- this app has exactly one timezone, per Global Constraints.)

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/date.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing tests for slot generation, swap eligibility, bookability, and email validation**

```ts
// src/lib/coffee-chat.test.ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHUNK_MINUTES,
  generateSlots,
  isSlotBookable,
  isSwapEligible,
  isValidUcscEmail,
  type AvailabilityBlock,
  type ExistingSlotAssignment,
} from "./coffee-chat";

describe("generateSlots", () => {
  it("pairs two execs free at the same time into one slot", () => {
    const availability: AvailabilityBlock[] = [
      { execId: "a", date: "2026-10-06", startTime: "14:00", endTime: "14:20" },
      { execId: "b", date: "2026-10-06", startTime: "14:00", endTime: "14:20" },
    ];
    const slots = generateSlots(availability, 20);
    expect(slots).toEqual([
      { date: "2026-10-06", startTime: "14:00", endTime: "14:20", execId1: "a", execId2: "b" },
    ]);
  });

  it("creates two parallel slots when four execs are free at the same time", () => {
    const availability: AvailabilityBlock[] = ["a", "b", "c", "d"].map((execId) => ({
      execId,
      date: "2026-10-06",
      startTime: "14:00",
      endTime: "14:20",
    }));
    const slots = generateSlots(availability, 20);
    expect(slots).toHaveLength(2);
    const pairedExecs = slots.flatMap((s) => [s.execId1, s.execId2]).sort();
    expect(pairedExecs).toEqual(["a", "b", "c", "d"]);
  });

  it("leaves an odd exec out unpaired (execId2 null) instead of dropping them", () => {
    const availability: AvailabilityBlock[] = ["a", "b", "c"].map((execId) => ({
      execId,
      date: "2026-10-06",
      startTime: "14:00",
      endTime: "14:20",
    }));
    const slots = generateSlots(availability, 20);
    expect(slots).toHaveLength(2);
    expect(slots.some((s) => s.execId2 === null)).toBe(true);
  });

  it("splits a 40-minute block into two 20-minute chunks", () => {
    const availability: AvailabilityBlock[] = [
      { execId: "a", date: "2026-10-06", startTime: "14:00", endTime: "14:40" },
      { execId: "b", date: "2026-10-06", startTime: "14:00", endTime: "14:40" },
    ];
    const slots = generateSlots(availability, 20);
    expect(slots.map((s) => s.startTime).sort()).toEqual(["14:00", "14:20"]);
  });

  it("does not pair execs whose windows don't overlap", () => {
    const availability: AvailabilityBlock[] = [
      { execId: "a", date: "2026-10-06", startTime: "14:00", endTime: "14:20" },
      { execId: "b", date: "2026-10-06", startTime: "15:00", endTime: "15:20" },
    ];
    const slots = generateSlots(availability, 20);
    expect(slots).toHaveLength(2);
    expect(slots.every((s) => s.execId2 === null)).toBe(true);
  });
});

describe("isSwapEligible", () => {
  const target: ExistingSlotAssignment = {
    slotId: "slot-1",
    date: "2026-10-06",
    startTime: "14:00",
    endTime: "14:20",
    execId1: "a",
    execId2: "b",
  };

  it("allows a candidate who is free at that exact window and not booked elsewhere", () => {
    const candidateAvailability: AvailabilityBlock[] = [
      { execId: "c", date: "2026-10-06", startTime: "13:00", endTime: "15:00" },
    ];
    expect(isSwapEligible(target, "c", candidateAvailability, [target])).toBe(true);
  });

  it("rejects a candidate with no matching availability", () => {
    expect(isSwapEligible(target, "c", [], [target])).toBe(false);
  });

  it("rejects a candidate already assigned to a different slot at the same overlapping time", () => {
    const candidateAvailability: AvailabilityBlock[] = [
      { execId: "c", date: "2026-10-06", startTime: "13:00", endTime: "15:00" },
    ];
    const otherSlot: ExistingSlotAssignment = {
      slotId: "slot-2",
      date: "2026-10-06",
      startTime: "14:00",
      endTime: "14:20",
      execId1: "c",
      execId2: null,
    };
    expect(isSwapEligible(target, "c", candidateAvailability, [target, otherSlot])).toBe(false);
  });
});

describe("isSlotBookable", () => {
  const now = new Date("2026-10-06T18:00:00.000Z"); // 11:00 PDT

  it("is bookable when published, unbooked, and past the minimum lead time", () => {
    expect(
      isSlotBookable(
        { date: "2026-10-06", startTime: "14:00", published: true, hasConfirmedBooking: false },
        now,
        120,
      ),
    ).toBe(true);
  });

  it("is not bookable when unpublished", () => {
    expect(
      isSlotBookable(
        { date: "2026-10-06", startTime: "14:00", published: false, hasConfirmedBooking: false },
        now,
        120,
      ),
    ).toBe(false);
  });

  it("is not bookable once it has a confirmed booking", () => {
    expect(
      isSlotBookable(
        { date: "2026-10-06", startTime: "14:00", published: true, hasConfirmedBooking: true },
        now,
        120,
      ),
    ).toBe(false);
  });

  it("is not bookable within the minimum lead time", () => {
    expect(
      isSlotBookable(
        { date: "2026-10-06", startTime: "11:30", published: true, hasConfirmedBooking: false },
        now,
        120,
      ),
    ).toBe(false);
  });
});

describe("isValidUcscEmail", () => {
  it("accepts a ucsc.edu address", () => {
    expect(isValidUcscEmail("student@ucsc.edu")).toBe(true);
  });

  it("rejects a non-ucsc address", () => {
    expect(isValidUcscEmail("student@gmail.com")).toBe(false);
  });

  it("rejects a malformed address", () => {
    expect(isValidUcscEmail("not-an-email")).toBe(false);
  });
});

describe("DEFAULT_CHUNK_MINUTES", () => {
  it("defaults to 20", () => {
    expect(DEFAULT_CHUNK_MINUTES).toBe(20);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/lib/coffee-chat.test.ts`
Expected: FAIL with "Cannot find module './coffee-chat'" or similar.

- [ ] **Step 7: Implement `src/lib/coffee-chat.ts`**

```ts
import { zonedDateTimeToUtc } from "./date";

export const DEFAULT_CHUNK_MINUTES = 20;
export const DEFAULT_MIN_LEAD_MINUTES = 120;

export interface AvailabilityBlock {
  execId: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM", 24h
  endTime: string; // "HH:MM", 24h
}

export interface GeneratedSlot {
  date: string;
  startTime: string;
  endTime: string;
  execId1: string;
  execId2: string | null;
}

export interface ExistingSlotAssignment {
  slotId: string;
  date: string;
  startTime: string;
  endTime: string;
  execId1: string;
  execId2: string | null;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (totalMinutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/** Every fixed-length chunk that fits entirely inside [startTime, endTime). */
function chunkStartsFor(block: AvailabilityBlock, chunkMinutes: number): string[] {
  const start = timeToMinutes(block.startTime);
  const end = timeToMinutes(block.endTime);
  const starts: string[] = [];
  for (let t = start; t + chunkMinutes <= end; t += chunkMinutes) {
    starts.push(minutesToTime(t));
  }
  return starts;
}

/**
 * Chunks every exec's availability into fixed-length windows, then greedily
 * pairs whoever's free in each window two at a time -- 4 execs free at the
 * same time produces 2 parallel slots, an odd exec out gets a slot with
 * `execId2: null` for the admin to fill by hand. Deterministic: execs
 * within a window are sorted by id before pairing, so re-running with the
 * same input produces the same pairing.
 */
export function generateSlots(availability: AvailabilityBlock[], chunkMinutes: number): GeneratedSlot[] {
  const byWindow = new Map<string, Set<string>>();

  for (const block of availability) {
    for (const chunkStart of chunkStartsFor(block, chunkMinutes)) {
      const key = `${block.date}|${chunkStart}`;
      if (!byWindow.has(key)) byWindow.set(key, new Set());
      byWindow.get(key)!.add(block.execId);
    }
  }

  const slots: GeneratedSlot[] = [];
  for (const [key, execIds] of byWindow) {
    const [date, startTime] = key.split("|");
    const endTime = minutesToTime(timeToMinutes(startTime) + chunkMinutes);
    const sorted = [...execIds].sort();
    for (let i = 0; i < sorted.length; i += 2) {
      slots.push({
        date,
        startTime,
        endTime,
        execId1: sorted[i],
        execId2: sorted[i + 1] ?? null,
      });
    }
  }

  return slots;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(bStart) < timeToMinutes(aEnd);
}

function assignedExecIds(slot: ExistingSlotAssignment): string[] {
  return [slot.execId1, slot.execId2].filter((id): id is string => id !== null);
}

/**
 * True if `candidateExecId` can be swapped onto `targetSlot`: they marked
 * themselves available for that exact window, and they aren't already
 * assigned to a *different* slot whose time overlaps it (an exec can't be
 * in two coffee chats at once).
 */
export function isSwapEligible(
  targetSlot: ExistingSlotAssignment,
  candidateExecId: string,
  candidateAvailability: AvailabilityBlock[],
  allSlots: ExistingSlotAssignment[],
): boolean {
  const isFreeThen = candidateAvailability.some(
    (block) =>
      block.execId === candidateExecId &&
      block.date === targetSlot.date &&
      timeToMinutes(block.startTime) <= timeToMinutes(targetSlot.startTime) &&
      timeToMinutes(block.endTime) >= timeToMinutes(targetSlot.endTime),
  );
  if (!isFreeThen) return false;

  const isDoubleBooked = allSlots.some(
    (slot) =>
      slot.slotId !== targetSlot.slotId &&
      slot.date === targetSlot.date &&
      overlaps(slot.startTime, slot.endTime, targetSlot.startTime, targetSlot.endTime) &&
      assignedExecIds(slot).includes(candidateExecId),
  );
  return !isDoubleBooked;
}

export interface SlotBookabilityInput {
  date: string;
  startTime: string;
  published: boolean;
  hasConfirmedBooking: boolean;
}

/** Whether a slot should appear on the public booking page right now. */
export function isSlotBookable(slot: SlotBookabilityInput, now: Date, minLeadMinutes: number): boolean {
  if (!slot.published || slot.hasConfirmedBooking) return false;
  const slotStart = zonedDateTimeToUtc(slot.date, slot.startTime);
  return slotStart.getTime() - now.getTime() >= minLeadMinutes * 60_000;
}

const UCSC_EMAIL_PATTERN = /^[^\s@]+@ucsc\.edu$/i;

export function isValidUcscEmail(email: string): boolean {
  return UCSC_EMAIL_PATTERN.test(email.trim());
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run src/lib/coffee-chat.test.ts src/lib/date.test.ts`
Expected: PASS (all tests)

- [ ] **Step 9: Commit**

```bash
git add src/lib/coffee-chat.ts src/lib/coffee-chat.test.ts src/lib/date.ts src/lib/date.test.ts
git commit -m "Add pure coffee chat scheduling logic (pairing, swap eligibility, bookability, email validation)"
```

---

### Task 3: Pure calendar invite logic

**Files:**
- Create: `src/lib/calendar-invite.ts`
- Create: `src/lib/calendar-invite.test.ts`

**Interfaces:**
- Consumes: `zonedDateTimeToUtc` from `src/lib/date.ts` (Task 2).
- Produces: `CoffeeChatBookingForInvite`, `buildGoogleCalendarUrl(booking)`, `buildIcsContent(booking)` — used by Task 10 (email content) and Task 13 (ICS route).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/calendar-invite.test.ts
import { describe, expect, it } from "vitest";
import { buildGoogleCalendarUrl, buildIcsContent, type CoffeeChatBookingForInvite } from "./calendar-invite";

const booking: CoffeeChatBookingForInvite = {
  applicantName: "Jamie Rivera",
  date: "2026-10-06",
  startTime: "14:00",
  endTime: "14:20",
  location: "Baskin Engineering courtyard",
  manageToken: "tok_abc123",
};

describe("buildGoogleCalendarUrl", () => {
  it("encodes the UTC start/end as a Google Calendar template link", () => {
    const url = buildGoogleCalendarUrl(booking);
    expect(url).toContain("https://calendar.google.com/calendar/render?action=TEMPLATE");
    expect(url).toContain("dates=20261006T210000Z%2F20261006T212000Z");
    expect(url).toContain("text=180DC+UCSC+Coffee+Chat");
    expect(url).toContain("location=Baskin+Engineering+courtyard");
  });
});

describe("buildIcsContent", () => {
  it("produces a VCALENDAR block with the right UID, times, and CRLF line endings", () => {
    const ics = buildIcsContent(booking);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("UID:tok_abc123@180dcucsc.org");
    expect(ics).toContain("DTSTART:20261006T210000Z");
    expect(ics).toContain("DTEND:20261006T212000Z");
    expect(ics).toContain("SUMMARY:180DC UCSC Coffee Chat");
    expect(ics).toContain("LOCATION:Baskin Engineering courtyard");
    expect(ics.split("\n")[0].endsWith("\r")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/calendar-invite.test.ts`
Expected: FAIL with "Cannot find module './calendar-invite'"

- [ ] **Step 3: Implement `src/lib/calendar-invite.ts`**

```ts
import { zonedDateTimeToUtc } from "./date";

export interface CoffeeChatBookingForInvite {
  applicantName: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  location: string;
  manageToken: string;
}

function toUtcStamp(date: string, time: string): string {
  const utc = zonedDateTimeToUtc(date, time);
  return utc.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

export function buildGoogleCalendarUrl(booking: CoffeeChatBookingForInvite): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: "180DC UCSC Coffee Chat",
    dates: `${toUtcStamp(booking.date, booking.startTime)}/${toUtcStamp(booking.date, booking.endTime)}`,
    details: `Coffee chat with 180DC UCSC exec as part of recruitment.`,
    location: booking.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** RFC 5545 requires CRLF line endings. */
function icsLines(lines: string[]): string {
  return lines.join("\r\n");
}

export function buildIcsContent(booking: CoffeeChatBookingForInvite): string {
  const dtstamp = toUtcStamp(booking.date, booking.startTime);
  return icsLines([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//180DC UCSC//Coffee Chat//EN",
    "BEGIN:VEVENT",
    `UID:${booking.manageToken}@180dcucsc.org`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${toUtcStamp(booking.date, booking.startTime)}`,
    `DTEND:${toUtcStamp(booking.date, booking.endTime)}`,
    "SUMMARY:180DC UCSC Coffee Chat",
    `LOCATION:${booking.location}`,
    "DESCRIPTION:Coffee chat with 180DC UCSC exec as part of recruitment.",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/calendar-invite.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/calendar-invite.ts src/lib/calendar-invite.test.ts
git commit -m "Add pure Google Calendar / ICS invite builders"
```

---

### Task 4: Exec-side data layer

**Files:**
- Create: `src/lib/data/coffee-chat.ts`

**Interfaces:**
- Consumes: `createClient` from `src/lib/supabase/server.ts`.
- Produces: `AvailabilityRow`, `getAllAvailability()`, `SlotRow`, `getAllSlots()`, `BookingRow`, `getAllBookings()`, `ExecOption`, `getExecOptionsForSlot(date, startTime, endTime, excludeExecIds)` — used by Task 6, 7, 8.

- [ ] **Step 1: Implement `src/lib/data/coffee-chat.ts`**

No automated test for this file — like every other file in `src/lib/data`, it's a thin Supabase read wrapper with no branching logic of its own (the logic it depends on is already tested in Task 2). Verified manually in Tasks 6-8 once the admin UI calls it.

```ts
import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface AvailabilityRow {
  id: string;
  execId: string;
  execName: string;
  date: string;
  startTime: string;
  endTime: string;
}

export async function getAllAvailability(): Promise<AvailabilityRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coffee_chat_availability")
    .select("id, exec_id, date, start_time, end_time, exec:profiles(name)")
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw error;

  return ((data ?? []) as unknown as {
    id: string;
    exec_id: string;
    date: string;
    start_time: string;
    end_time: string;
    exec: { name: string } | null;
  }[]).map((row) => ({
    id: row.id,
    execId: row.exec_id,
    execName: row.exec?.name ?? "Unknown",
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
  }));
}

interface ProfileNameLookup {
  id: string;
  name: string;
}

async function lookupProfileNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from("profiles").select("id, name").in("id", ids);
  if (error) throw error;
  return new Map(((data ?? []) as ProfileNameLookup[]).map((p) => [p.id, p.name]));
}

export interface SlotRow {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  published: boolean;
  execId1: string;
  exec1Name: string;
  execId2: string | null;
  exec2Name: string | null;
  bookingStatus: "open" | "booked";
  applicantName: string | null;
}

export async function getAllSlots(): Promise<SlotRow[]> {
  const supabase = await createClient();
  const { data: slots, error } = await supabase
    .from("coffee_chat_slots")
    .select("id, date, start_time, end_time, location, published, exec_id_1, exec_id_2")
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw error;
  const slotRows = slots ?? [];
  if (slotRows.length === 0) return [];

  const execIds = [...new Set(slotRows.flatMap((s) => [s.exec_id_1, s.exec_id_2]).filter((id): id is string => !!id))];
  const namesByExecId = await lookupProfileNames(supabase, execIds);

  const { data: bookings, error: bookingsError } = await supabase
    .from("coffee_chat_bookings")
    .select("slot_id, applicant_name")
    .eq("status", "confirmed")
    .in(
      "slot_id",
      slotRows.map((s) => s.id),
    );
  if (bookingsError) throw bookingsError;
  const applicantBySlotId = new Map((bookings ?? []).map((b) => [b.slot_id, b.applicant_name]));

  return slotRows.map((s) => ({
    id: s.id,
    date: s.date,
    startTime: s.start_time,
    endTime: s.end_time,
    location: s.location,
    published: s.published,
    execId1: s.exec_id_1,
    exec1Name: namesByExecId.get(s.exec_id_1) ?? "Unknown",
    execId2: s.exec_id_2,
    exec2Name: s.exec_id_2 ? (namesByExecId.get(s.exec_id_2) ?? "Unknown") : null,
    bookingStatus: applicantBySlotId.has(s.id) ? "booked" : "open",
    applicantName: applicantBySlotId.get(s.id) ?? null,
  }));
}

export interface BookingRow {
  id: string;
  slotId: string;
  applicantName: string;
  applicantEmail: string;
  status: "confirmed" | "cancelled";
  date: string;
  startTime: string;
  location: string;
  exec1Name: string;
  exec2Name: string | null;
  createdAt: string;
  cancelledAt: string | null;
}

export async function getAllBookings(): Promise<BookingRow[]> {
  const supabase = await createClient();
  const { data: bookings, error } = await supabase
    .from("coffee_chat_bookings")
    .select("id, slot_id, applicant_name, applicant_email, status, created_at, cancelled_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const bookingRows = bookings ?? [];
  if (bookingRows.length === 0) return [];

  const slotIds = [...new Set(bookingRows.map((b) => b.slot_id))];
  const { data: slots, error: slotsError } = await supabase
    .from("coffee_chat_slots")
    .select("id, date, start_time, location, exec_id_1, exec_id_2")
    .in("id", slotIds);
  if (slotsError) throw slotsError;
  const slotsById = new Map((slots ?? []).map((s) => [s.id, s]));

  const execIds = [...new Set((slots ?? []).flatMap((s) => [s.exec_id_1, s.exec_id_2]).filter((id): id is string => !!id))];
  const namesByExecId = await lookupProfileNames(supabase, execIds);

  return bookingRows.map((b) => {
    const slot = slotsById.get(b.slot_id);
    return {
      id: b.id,
      slotId: b.slot_id,
      applicantName: b.applicant_name,
      applicantEmail: b.applicant_email,
      status: b.status as "confirmed" | "cancelled",
      date: slot?.date ?? "",
      startTime: slot?.start_time ?? "",
      location: slot?.location ?? "",
      exec1Name: slot ? (namesByExecId.get(slot.exec_id_1) ?? "Unknown") : "Unknown",
      exec2Name: slot?.exec_id_2 ? (namesByExecId.get(slot.exec_id_2) ?? "Unknown") : null,
      createdAt: b.created_at,
      cancelledAt: b.cancelled_at,
    };
  });
}

export interface ExecOption {
  id: string;
  name: string;
}

/** Execs eligible to be swapped onto a slot at this date/time: free then, per their own availability rows. */
export async function getExecOptionsForSlot(date: string, startTime: string, endTime: string): Promise<ExecOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coffee_chat_availability")
    .select("exec_id, exec:profiles(id, name)")
    .eq("date", date)
    .lte("start_time", startTime)
    .gte("end_time", endTime);
  if (error) throw error;

  const seen = new Map<string, string>();
  for (const row of (data ?? []) as unknown as { exec_id: string; exec: { id: string; name: string } | null }[]) {
    if (row.exec) seen.set(row.exec.id, row.exec.name);
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name }));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/data/coffee-chat.ts
git commit -m "Add exec-side coffee chat data layer"
```

---

### Task 5: Exec-side actions

**Files:**
- Create: `src/actions/coffee-chat.ts`

**Interfaces:**
- Consumes: `generateSlots`, `isSwapEligible`, `DEFAULT_CHUNK_MINUTES`, `ExistingSlotAssignment`, `AvailabilityBlock` (Task 2); `getAllAvailability`, `getAllSlots`, `getExecOptionsForSlot` (Task 4); `getCurrentProfile`, `isExec`, `logAudit` (existing).
- Produces: `ActionResult`, `addAvailabilityBlockAction(date, startTime, endTime)`, `removeAvailabilityBlockAction(id)`, `generateSlotsAction()`, `swapSlotExecAction(slotId, position, newExecId)`, `publishSlotAction(slotId, published)`, `deleteSlotAction(slotId)`, `cancelBookingAsAdminAction(bookingId)` — used by Tasks 6, 7, 8.

- [ ] **Step 1: Implement `src/actions/coffee-chat.ts`**

Not unit tested — same reasoning as Task 4 (thin Supabase writes; the actual decision logic they call is already tested). Verified manually via the admin UI in Tasks 6-8.

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import { getAllAvailability, getAllSlots, getExecOptionsForSlot } from "@/lib/data/coffee-chat";
import {
  DEFAULT_CHUNK_MINUTES,
  generateSlots,
  isSwapEligible,
  type AvailabilityBlock,
  type ExistingSlotAssignment,
} from "@/lib/coffee-chat";

export interface ActionResult {
  error?: string;
}

async function requireExec() {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) return { profile: null, error: "Only exec can do that." };
  return { profile, error: undefined };
}

function revalidateAdmin() {
  revalidatePath("/portal/admin/coffee-chats");
}

export async function addAvailabilityBlockAction(date: string, startTime: string, endTime: string): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  if (startTime >= endTime) return { error: "End time must be after start time." };

  const supabase = await createClient();
  const { error: insertError } = await supabase
    .from("coffee_chat_availability")
    .insert({ exec_id: profile.id, date, start_time: startTime, end_time: endTime });
  if (insertError) return { error: insertError.message };

  revalidateAdmin();
  return {};
}

export async function removeAvailabilityBlockAction(id: string): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  const { error: deleteError } = await supabase.from("coffee_chat_availability").delete().eq("id", id);
  if (deleteError) return { error: deleteError.message };

  revalidateAdmin();
  return {};
}

export async function generateSlotsAction(): Promise<ActionResult & { createdCount?: number }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const supabase = await createClient();
  const [availabilityRows, existingSlots] = await Promise.all([getAllAvailability(), getAllSlots()]);

  const availability: AvailabilityBlock[] = availabilityRows.map((a) => ({
    execId: a.execId,
    date: a.date,
    startTime: a.startTime,
    endTime: a.endTime,
  }));

  const generated = generateSlots(availability, DEFAULT_CHUNK_MINUTES);

  // Never touch a slot that's already booked -- only fill in windows that
  // don't already have an unbooked or booked slot recorded.
  const existingKeys = new Set(existingSlots.map((s) => `${s.date}|${s.startTime}|${s.execId1}|${s.execId2 ?? ""}`));
  const toInsert = generated
    .filter((g) => !existingKeys.has(`${g.date}|${g.startTime}|${g.execId1}|${g.execId2 ?? ""}`))
    .map((g) => ({
      date: g.date,
      start_time: g.startTime,
      end_time: g.endTime,
      exec_id_1: g.execId1,
      exec_id_2: g.execId2,
      published: false,
    }));

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase.from("coffee_chat_slots").insert(toInsert);
    if (insertError) return { error: insertError.message };
  }

  await logAudit(profile.id, "coffee_chat.slots_generated", undefined, `${toInsert.length} slot(s) created`);
  revalidateAdmin();
  return { createdCount: toInsert.length };
}

export async function swapSlotExecAction(
  slotId: string,
  position: "exec_id_1" | "exec_id_2",
  newExecId: string,
): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  const [{ data: slot, error: slotError }, availabilityRows, allSlots] = await Promise.all([
    supabase.from("coffee_chat_slots").select("id, date, start_time, end_time, exec_id_1, exec_id_2").eq("id", slotId).single(),
    getAllAvailability(),
    getAllSlots(),
  ]);
  if (slotError || !slot) return { error: "Slot not found." };

  const target: ExistingSlotAssignment = {
    slotId: slot.id,
    date: slot.date,
    startTime: slot.start_time,
    endTime: slot.end_time,
    execId1: slot.exec_id_1,
    execId2: slot.exec_id_2,
  };
  const allAssignments: ExistingSlotAssignment[] = allSlots.map((s) => ({
    slotId: s.id,
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    execId1: s.execId1,
    execId2: s.execId2,
  }));
  const availability: AvailabilityBlock[] = availabilityRows.map((a) => ({
    execId: a.execId,
    date: a.date,
    startTime: a.startTime,
    endTime: a.endTime,
  }));

  if (!isSwapEligible(target, newExecId, availability, allAssignments)) {
    return { error: "That exec isn't free at this time, or is already assigned to an overlapping slot." };
  }

  const { error: updateError } = await supabase
    .from("coffee_chat_slots")
    .update({ [position]: newExecId })
    .eq("id", slotId);
  if (updateError) return { error: updateError.message };

  revalidateAdmin();
  return {};
}

export async function publishSlotAction(slotId: string, published: boolean): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  const { error: updateError } = await supabase.from("coffee_chat_slots").update({ published }).eq("id", slotId);
  if (updateError) return { error: updateError.message };

  revalidateAdmin();
  revalidatePath("/apply/coffee-chat");
  return {};
}

export async function deleteSlotAction(slotId: string): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  const { error: deleteError } = await supabase.from("coffee_chat_slots").delete().eq("id", slotId);
  if (deleteError) return { error: deleteError.message };

  revalidateAdmin();
  revalidatePath("/apply/coffee-chat");
  return {};
}

export async function cancelBookingAsAdminAction(bookingId: string): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("coffee_chat_bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", bookingId);
  if (updateError) return { error: updateError.message };

  await logAudit(profile.id, "coffee_chat.booking_cancelled_by_admin", undefined, bookingId);
  revalidateAdmin();
  revalidatePath("/apply/coffee-chat");
  return {};
}

/** Exec-only lookup of swap candidates for a given slot window, called from the client. */
export async function getExecOptionsForSlotAction(date: string, startTime: string, endTime: string) {
  const { error } = await requireExec();
  if (error) return { error, options: [] as { id: string; name: string }[] };
  const options = await getExecOptionsForSlot(date, startTime, endTime);
  return { error: undefined, options };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/actions/coffee-chat.ts
git commit -m "Add exec-side coffee chat scheduling actions"
```

---

### Task 6: Admin UI — nav entry, page scaffold, Availability tab

**Files:**
- Modify: `src/components/layout/nav-links.ts`
- Modify: `src/app/portal/(app)/admin/admin-nav.tsx`
- Create: `src/app/portal/(app)/admin/coffee-chats/page.tsx`
- Create: `src/app/portal/(app)/admin/coffee-chats/availability-view.tsx`

**Interfaces:**
- Consumes: `getAllAvailability` (Task 4); `addAvailabilityBlockAction`, `removeAvailabilityBlockAction` (Task 5); `getCurrentProfile` (existing).
- Produces: `/portal/admin/coffee-chats` route with an "Availability" tab; the page shell that Tasks 7-8 add tabs to.

- [ ] **Step 1: Register the nav link**

In `src/components/layout/nav-links.ts`, add `"admin-recruitment"` to the `group` union type:

```ts
  group?: "work" | "people" | "reference" | "admin-people" | "admin-quarter-setup" | "admin-system" | "admin-recruitment";
```

Add `CalendarHeart` to the `lucide-react` import list, then add a new entry to `ADMIN_NAV_LINKS` (after the `rooms` entry, before `settings`):

```ts
  {
    href: "/portal/admin/coffee-chats",
    label: "Coffee Chats",
    icon: CalendarHeart,
    execOnly: true,
    keywords: "recruitment applicants scheduling booking availability",
    group: "admin-recruitment",
  },
```

- [ ] **Step 2: Add the nav group label**

In `src/app/portal/(app)/admin/admin-nav.tsx`, add to `GROUP_LABEL`:

```ts
  "admin-recruitment": "Recruitment",
```

- [ ] **Step 3: Create the page scaffold**

```tsx
// src/app/portal/(app)/admin/coffee-chats/page.tsx
import type { Metadata } from "next";
import { getAllAvailability } from "@/lib/data/coffee-chat";
import { getCurrentProfile } from "@/lib/data/profile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AvailabilityView } from "./availability-view";

export const metadata: Metadata = { title: "Admin · Coffee Chats" };

export default async function CoffeeChatsPage() {
  const [availability, profile] = await Promise.all([getAllAvailability(), getCurrentProfile()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Coffee Chats</h1>
        <p className="text-sm text-muted-foreground">
          Set your availability, generate bookable slots, and see who's booked what.
        </p>
      </div>

      <Tabs defaultValue="availability">
        <TabsList>
          <TabsTrigger value="availability">Availability</TabsTrigger>
          <TabsTrigger value="slots">Slots</TabsTrigger>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
        </TabsList>
        <TabsContent value="availability">
          <AvailabilityView availability={availability} currentExecId={profile.id} />
        </TabsContent>
        <TabsContent value="slots">{/* added in Task 7 */}</TabsContent>
        <TabsContent value="bookings">{/* added in Task 8 */}</TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 4: Build the Availability tab**

```tsx
// src/app/portal/(app)/admin/coffee-chats/availability-view.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { addAvailabilityBlockAction, removeAvailabilityBlockAction } from "@/actions/coffee-chat";
import type { AvailabilityRow } from "@/lib/data/coffee-chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function AvailabilityView({
  availability,
  currentExecId,
}: {
  availability: AvailabilityRow[];
  currentExecId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const router = useRouter();

  function handleAdd() {
    if (!date || !startTime || !endTime) {
      toast.error("Fill in a date and both times.");
      return;
    }
    startTransition(async () => {
      const result = await addAvailabilityBlockAction(date, startTime, endTime);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Availability added.");
      setDate("");
      setStartTime("");
      setEndTime("");
      router.refresh();
    });
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      const result = await removeAvailabilityBlockAction(id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  const mine = availability.filter((a) => a.execId === currentExecId);

  return (
    <div className="mt-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a block of time you're free</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="flex flex-wrap items-end gap-3">
            <Field className="w-40">
              <FieldLabel htmlFor="cc-date">Date</FieldLabel>
              <Input id="cc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field className="w-32">
              <FieldLabel htmlFor="cc-start">Start</FieldLabel>
              <Input id="cc-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </Field>
            <Field className="w-32">
              <FieldLabel htmlFor="cc-end">End</FieldLabel>
              <Input id="cc-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </Field>
            <Button onClick={handleAdd} disabled={isPending}>
              Add
            </Button>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your availability</CardTitle>
        </CardHeader>
        <CardContent>
          {mine.length === 0 ? (
            <p className="text-sm text-muted-foreground">You haven't added any availability yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {mine.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.date}</TableCell>
                    <TableCell>
                      {a.startTime}–{a.endTime}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon-sm" onClick={() => handleRemove(a.id)} disabled={isPending}>
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

- [ ] **Step 5: Manually verify in the browser**

Run: `npm run dev`
Visit `/portal/admin/coffee-chats` while logged in as an exec. Confirm:
- "Coffee Chats" appears in the Admin tab bar under a "Recruitment" group.
- Adding a date + start + end time appears in "Your availability" after submit.
- Removing a row works.
- Visiting the page as a non-exec redirects/denies (same as any other `/portal/admin/*` page).

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/nav-links.ts src/app/portal/(app)/admin/admin-nav.tsx "src/app/portal/(app)/admin/coffee-chats/page.tsx" "src/app/portal/(app)/admin/coffee-chats/availability-view.tsx"
git commit -m "Add Coffee Chats admin page with Availability tab"
```

---

### Task 7: Admin UI — Slots tab

**Files:**
- Modify: `src/app/portal/(app)/admin/coffee-chats/page.tsx`
- Create: `src/app/portal/(app)/admin/coffee-chats/slots-view.tsx`

**Interfaces:**
- Consumes: `getAllSlots` (Task 4); `generateSlotsAction`, `swapSlotExecAction`, `publishSlotAction`, `deleteSlotAction`, `getExecOptionsForSlotAction` (Task 5).
- Produces: the "Slots" tab, including the "My slots" filter (the one optional addition approved during brainstorming).

- [ ] **Step 1: Wire the Slots tab into the page**

In `src/app/portal/(app)/admin/coffee-chats/page.tsx`, add the import and fetch:

```tsx
import { getAllAvailability, getAllSlots } from "@/lib/data/coffee-chat";
import { SlotsView } from "./slots-view";
```

```tsx
  const [availability, slots, profile] = await Promise.all([
    getAllAvailability(),
    getAllSlots(),
    getCurrentProfile(),
  ]);
```

Replace the `slots` tab placeholder:

```tsx
        <TabsContent value="slots">
          <SlotsView slots={slots} currentExecId={profile.id} />
        </TabsContent>
```

- [ ] **Step 2: Build the Slots tab**

```tsx
// src/app/portal/(app)/admin/coffee-chats/slots-view.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw, Trash2 } from "lucide-react";
import {
  deleteSlotAction,
  generateSlotsAction,
  getExecOptionsForSlotAction,
  publishSlotAction,
  swapSlotExecAction,
} from "@/actions/coffee-chat";
import type { SlotRow } from "@/lib/data/coffee-chat";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function SwapControl({ slot, position, router }: { slot: SlotRow; position: "exec_id_1" | "exec_id_2"; router: ReturnType<typeof useRouter> }) {
  const [isPending, startTransition] = useTransition();
  const [options, setOptions] = useState<{ id: string; name: string }[] | null>(null);

  async function loadOptions() {
    if (options) return;
    const result = await getExecOptionsForSlotAction(slot.date, slot.startTime, slot.endTime);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setOptions(result.options);
  }

  function handleSwap(newExecId: string) {
    startTransition(async () => {
      const result = await swapSlotExecAction(slot.id, position, newExecId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Swapped.");
      router.refresh();
    });
  }

  const currentName = position === "exec_id_1" ? slot.exec1Name : slot.exec2Name;

  return (
    <Select onOpenChange={(open) => open && loadOptions()} onValueChange={handleSwap} disabled={isPending}>
      <SelectTrigger className="h-7 w-36 text-xs">
        <SelectValue placeholder={currentName ?? "Unassigned"}>{currentName ?? "Unassigned"}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(options ?? []).map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SlotsView({ slots, currentExecId }: { slots: SlotRow[]; currentExecId: string }) {
  const [isPending, startTransition] = useTransition();
  const [mineOnly, setMineOnly] = useState(false);
  const router = useRouter();

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateSlotsAction();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Generated ${result.createdCount ?? 0} new slot(s).`);
      router.refresh();
    });
  }

  function handlePublishToggle(slotId: string, published: boolean) {
    startTransition(async () => {
      const result = await publishSlotAction(slotId, published);
      if (result.error) toast.error(result.error);
      router.refresh();
    });
  }

  function handleDelete(slotId: string) {
    startTransition(async () => {
      const result = await deleteSlotAction(slotId);
      if (result.error) toast.error(result.error);
      router.refresh();
    });
  }

  const visible = mineOnly ? slots.filter((s) => s.execId1 === currentExecId || s.execId2 === currentExecId) : slots;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Checkbox id="mine-only" checked={mineOnly} onCheckedChange={(c) => setMineOnly(c === true)} />
          <label htmlFor="mine-only" className="text-sm text-muted-foreground">
            My slots only
          </label>
        </div>
        <Button onClick={handleGenerate} disabled={isPending} className="gap-1.5">
          <RefreshCw className="size-4" />
          Generate slots
        </Button>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">No slots yet -- add availability, then generate.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Exec 1</TableHead>
              <TableHead>Exec 2</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Published</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((slot) => (
              <TableRow key={slot.id}>
                <TableCell>{slot.date}</TableCell>
                <TableCell>
                  {slot.startTime}–{slot.endTime}
                </TableCell>
                <TableCell>
                  <SwapControl slot={slot} position="exec_id_1" router={router} />
                </TableCell>
                <TableCell>
                  <SwapControl slot={slot} position="exec_id_2" router={router} />
                </TableCell>
                <TableCell>
                  <Badge variant={slot.bookingStatus === "booked" ? "default" : "secondary"}>
                    {slot.bookingStatus === "booked" ? `Booked (${slot.applicantName})` : "Open"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Checkbox
                    checked={slot.published}
                    onCheckedChange={(c) => handlePublishToggle(slot.id, c === true)}
                    disabled={isPending}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDelete(slot.id)}
                    disabled={isPending || slot.bookingStatus === "booked"}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Manually verify in the browser**

With at least two exec accounts having overlapping availability entered in Task 6's tab: click "Generate slots," confirm the resulting rows show the right pairing, toggle "Published" and confirm it persists after refresh, try the swap dropdown on an unbooked slot, and confirm "My slots only" filters correctly for the logged-in exec.

- [ ] **Step 4: Commit**

```bash
git add "src/app/portal/(app)/admin/coffee-chats/page.tsx" "src/app/portal/(app)/admin/coffee-chats/slots-view.tsx"
git commit -m "Add Slots tab to Coffee Chats admin page"
```

---

### Task 8: Admin UI — Bookings tab

**Files:**
- Modify: `src/app/portal/(app)/admin/coffee-chats/page.tsx`
- Create: `src/app/portal/(app)/admin/coffee-chats/bookings-view.tsx`

**Interfaces:**
- Consumes: `getAllBookings` (Task 4); `cancelBookingAsAdminAction` (Task 5).
- Produces: the "Bookings" tab.

- [ ] **Step 1: Wire the Bookings tab into the page**

Add to `src/app/portal/(app)/admin/coffee-chats/page.tsx`:

```tsx
import { getAllAvailability, getAllBookings, getAllSlots } from "@/lib/data/coffee-chat";
import { BookingsView } from "./bookings-view";
```

```tsx
  const [availability, slots, bookings, profile] = await Promise.all([
    getAllAvailability(),
    getAllSlots(),
    getAllBookings(),
    getCurrentProfile(),
  ]);
```

```tsx
        <TabsContent value="bookings">
          <BookingsView bookings={bookings} />
        </TabsContent>
```

- [ ] **Step 2: Build the Bookings tab**

```tsx
// src/app/portal/(app)/admin/coffee-chats/bookings-view.tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cancelBookingAsAdminAction } from "@/actions/coffee-chat";
import type { BookingRow } from "@/lib/data/coffee-chat";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function BookingsView({ bookings }: { bookings: BookingRow[] }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleCancel(bookingId: string) {
    startTransition(async () => {
      const result = await cancelBookingAsAdminAction(bookingId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Booking cancelled.");
      router.refresh();
    });
  }

  if (bookings.length === 0) {
    return <p className="mt-4 text-sm text-muted-foreground">No bookings yet.</p>;
  }

  return (
    <Table className="mt-4">
      <TableHeader>
        <TableRow>
          <TableHead>Applicant</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Time</TableHead>
          <TableHead>With</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-24" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {bookings.map((b) => (
          <TableRow key={b.id}>
            <TableCell>{b.applicantName}</TableCell>
            <TableCell>{b.applicantEmail}</TableCell>
            <TableCell>{b.date}</TableCell>
            <TableCell>{b.startTime}</TableCell>
            <TableCell>
              {b.exec1Name}
              {b.exec2Name ? ` & ${b.exec2Name}` : ""}
            </TableCell>
            <TableCell>
              <Badge variant={b.status === "confirmed" ? "default" : "secondary"}>{b.status}</Badge>
            </TableCell>
            <TableCell>
              {b.status === "confirmed" && (
                <Button variant="outline" size="sm" onClick={() => handleCancel(b.id)} disabled={isPending}>
                  Cancel
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 3: Manually verify in the browser**

Confirm bookings appear once Task 12's booking flow can create them (this tab will show "No bookings yet" until then — fine, come back and re-check after Task 12/14 land). For now, confirm the tab renders without error and the empty state looks right.

- [ ] **Step 4: Commit**

```bash
git add "src/app/portal/(app)/admin/coffee-chats/page.tsx" "src/app/portal/(app)/admin/coffee-chats/bookings-view.tsx"
git commit -m "Add Bookings tab to Coffee Chats admin page"
```

---

### Task 9: Turnstile bot guard

**Files:**
- Create: `src/lib/turnstile.ts`
- Create: `src/lib/turnstile.test.ts`
- Modify: `.env.local.example`

**Interfaces:**
- Produces: `isTurnstileResponseValid(json)`, `verifyTurnstileToken(token, remoteIp?)` — used by Task 12.

- [ ] **Step 1: Add the env vars**

Append to `.env.local.example`:

```
# Cloudflare Turnstile -- bot guard on the public coffee chat booking form.
# Sign up at https://dash.cloudflare.com/?to=/:account/turnstile
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
```

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/turnstile.test.ts
import { describe, expect, it } from "vitest";
import { isTurnstileResponseValid } from "./turnstile";

describe("isTurnstileResponseValid", () => {
  it("is true when Cloudflare reports success", () => {
    expect(isTurnstileResponseValid({ success: true })).toBe(true);
  });

  it("is false when Cloudflare reports failure", () => {
    expect(isTurnstileResponseValid({ success: false, "error-codes": ["invalid-input-response"] })).toBe(false);
  });

  it("is false for malformed input", () => {
    expect(isTurnstileResponseValid(null)).toBe(false);
    expect(isTurnstileResponseValid({})).toBe(false);
    expect(isTurnstileResponseValid("success")).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/turnstile.test.ts`
Expected: FAIL with "Cannot find module './turnstile'"

- [ ] **Step 4: Implement `src/lib/turnstile.ts`**

```ts
import "server-only";

export function isTurnstileResponseValid(json: unknown): boolean {
  if (typeof json !== "object" || json === null) return false;
  return (json as { success?: unknown }).success === true;
}

/** Verifies a Turnstile client token server-side. Never trust the client-side widget alone. */
export async function verifyTurnstileToken(token: string, remoteIp?: string): Promise<boolean> {
  if (!token) return false;

  const body = new URLSearchParams({
    secret: process.env.TURNSTILE_SECRET_KEY!,
    response: token,
  });
  if (remoteIp) body.set("remoteip", remoteIp);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });
  const json = await response.json();
  return isTurnstileResponseValid(json);
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/lib/turnstile.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/turnstile.ts src/lib/turnstile.test.ts .env.local.example
git commit -m "Add Cloudflare Turnstile verification helper"
```

---

### Task 10: Email — Resend wrapper + confirmation content

**Files:**
- Create: `src/lib/email/resend.ts`
- Create: `src/lib/email/coffee-chat-confirmation.ts`
- Create: `src/lib/email/coffee-chat-confirmation.test.ts`
- Modify: `.env.local.example`
- Modify: `package.json` (new dependency)

**Interfaces:**
- Consumes: `buildGoogleCalendarUrl` (Task 3).
- Produces: `sendEmail(params)` from `resend.ts`; `BookingConfirmationEmailInput`, `EmailContent`, `buildBookingConfirmationEmail(input)` from `coffee-chat-confirmation.ts`; `sendCoffeeChatConfirmationEmail(input)` — used by Task 12.

- [ ] **Step 1: Install the dependency**

Run: `npm install resend`
Expected: `resend` appears in `package.json` dependencies.

- [ ] **Step 2: Add the env vars**

Append to `.env.local.example`:

```
# Resend -- transactional email for coffee chat booking confirmations.
# https://resend.com/api-keys, and verify a sending domain before real launch.
RESEND_API_KEY=
COFFEE_CHAT_FROM_EMAIL=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

- [ ] **Step 3: Write the failing test for the content builder**

```ts
// src/lib/email/coffee-chat-confirmation.test.ts
import { describe, expect, it } from "vitest";
import { buildBookingConfirmationEmail, type BookingConfirmationEmailInput } from "./coffee-chat-confirmation";

const input: BookingConfirmationEmailInput = {
  applicantName: "Jamie Rivera",
  date: "2026-10-06",
  startTime: "14:00",
  endTime: "14:20",
  location: "Baskin Engineering courtyard",
  manageToken: "tok_abc123",
  siteUrl: "https://180dcucsc.org",
};

describe("buildBookingConfirmationEmail", () => {
  it("includes the date, time, location, manage link, calendar link, and ICS link", () => {
    const email = buildBookingConfirmationEmail(input);
    expect(email.subject).toContain("Coffee Chat");
    expect(email.html).toContain("2026-10-06");
    expect(email.html).toContain("14:00");
    expect(email.html).toContain("Baskin Engineering courtyard");
    expect(email.html).toContain("https://180dcucsc.org/apply/coffee-chat/manage/tok_abc123");
    expect(email.html).toContain("https://180dcucsc.org/api/coffee-chat/tok_abc123/calendar.ics");
    expect(email.html).toContain("calendar.google.com/calendar/render");
    expect(email.text).toContain("https://180dcucsc.org/apply/coffee-chat/manage/tok_abc123");
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run src/lib/email/coffee-chat-confirmation.test.ts`
Expected: FAIL with "Cannot find module './coffee-chat-confirmation'"

- [ ] **Step 5: Implement the content builder**

```ts
// src/lib/email/coffee-chat-confirmation.ts
import { buildGoogleCalendarUrl } from "@/lib/calendar-invite";

export interface BookingConfirmationEmailInput {
  applicantName: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  manageToken: string;
  siteUrl: string;
}

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export function buildBookingConfirmationEmail(input: BookingConfirmationEmailInput): EmailContent {
  const manageUrl = `${input.siteUrl}/apply/coffee-chat/manage/${input.manageToken}`;
  const icsUrl = `${input.siteUrl}/api/coffee-chat/${input.manageToken}/calendar.ics`;
  const googleUrl = buildGoogleCalendarUrl({
    applicantName: input.applicantName,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    location: input.location,
    manageToken: input.manageToken,
  });

  const subject = "You're booked -- 180DC UCSC Coffee Chat";

  const html = `
    <p>Hi ${input.applicantName},</p>
    <p>Your coffee chat with 180DC UCSC is confirmed:</p>
    <ul>
      <li><strong>Date:</strong> ${input.date}</li>
      <li><strong>Time:</strong> ${input.startTime}–${input.endTime}</li>
      <li><strong>Location:</strong> ${input.location}</li>
    </ul>
    <p>
      Add it to your calendar:
      <a href="${googleUrl}">Google Calendar</a> ·
      <a href="${icsUrl}">Apple / Outlook (.ics)</a>
    </p>
    <p>Need to cancel or pick a different time? <a href="${manageUrl}">Manage your booking</a>.</p>
    <p>See you soon!</p>
  `.trim();

  const text = [
    `Hi ${input.applicantName},`,
    `Your coffee chat with 180DC UCSC is confirmed:`,
    `Date: ${input.date}`,
    `Time: ${input.startTime}-${input.endTime}`,
    `Location: ${input.location}`,
    `Add to Google Calendar: ${googleUrl}`,
    `Add to Apple/Outlook: ${icsUrl}`,
    `Manage your booking (cancel or reschedule): ${manageUrl}`,
  ].join("\n");

  return { subject, html, text };
}
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npx vitest run src/lib/email/coffee-chat-confirmation.test.ts`
Expected: PASS (1 test)

- [ ] **Step 7: Implement the thin Resend wrapper (not unit tested -- a network call)**

```ts
// src/lib/email/resend.ts
import "server-only";
import { Resend } from "resend";

let client: Resend | null = null;

function getClient(): Resend {
  if (!client) client = new Resend(process.env.RESEND_API_KEY!);
  return client;
}

export async function sendEmail(params: { to: string; subject: string; html: string; text: string }): Promise<void> {
  const { error } = await getClient().emails.send({
    from: process.env.COFFEE_CHAT_FROM_EMAIL!,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });
  if (error) throw new Error(`Failed to send email: ${error.message}`);
}
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/email/resend.ts src/lib/email/coffee-chat-confirmation.ts src/lib/email/coffee-chat-confirmation.test.ts .env.local.example package.json package-lock.json
git commit -m "Add Resend email wrapper and coffee chat confirmation content"
```

---

### Task 11: Public data layer

**Files:**
- Create: `src/lib/data/coffee-chat-public.ts`

**Interfaces:**
- Consumes: `createAdminClient` (existing); `isSlotBookable`, `DEFAULT_MIN_LEAD_MINUTES` (Task 2).
- Produces: `PublicSlot`, `getOpenSlots()`, `ManagedBooking`, `getBookingByToken(token)` — used by Task 12, 13, 14, 15.

- [ ] **Step 1: Implement `src/lib/data/coffee-chat-public.ts`**

No automated test — thin Supabase reads over already-tested `isSlotBookable`. Verified manually in Task 14/15.

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_MIN_LEAD_MINUTES, isSlotBookable } from "@/lib/coffee-chat";

export interface PublicSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
}

/** Every slot an applicant is currently allowed to book: published, unbooked, and past the minimum lead time. */
export async function getOpenSlots(): Promise<PublicSlot[]> {
  const supabase = createAdminClient();
  const { data: slots, error } = await supabase
    .from("coffee_chat_slots")
    .select("id, date, start_time, end_time, location, published")
    .eq("published", true)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw error;
  const slotRows = slots ?? [];
  if (slotRows.length === 0) return [];

  const { data: bookings, error: bookingsError } = await supabase
    .from("coffee_chat_bookings")
    .select("slot_id")
    .eq("status", "confirmed")
    .in(
      "slot_id",
      slotRows.map((s) => s.id),
    );
  if (bookingsError) throw bookingsError;
  const bookedSlotIds = new Set((bookings ?? []).map((b) => b.slot_id));

  const now = new Date();
  return slotRows
    .filter((s) =>
      isSlotBookable(
        { date: s.date, startTime: s.start_time, published: s.published, hasConfirmedBooking: bookedSlotIds.has(s.id) },
        now,
        DEFAULT_MIN_LEAD_MINUTES,
      ),
    )
    .map((s) => ({ id: s.id, date: s.date, startTime: s.start_time, endTime: s.end_time, location: s.location }));
}

export interface ManagedBooking {
  status: "confirmed" | "cancelled";
  applicantName: string;
  applicantEmail: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
}

export async function getBookingByToken(token: string): Promise<ManagedBooking | null> {
  const supabase = createAdminClient();
  const { data: booking, error } = await supabase
    .from("coffee_chat_bookings")
    .select("status, applicant_name, applicant_email, slot_id")
    .eq("manage_token", token)
    .maybeSingle();
  if (error) throw error;
  if (!booking) return null;

  const { data: slot, error: slotError } = await supabase
    .from("coffee_chat_slots")
    .select("date, start_time, end_time, location")
    .eq("id", booking.slot_id)
    .single();
  if (slotError || !slot) return null;

  return {
    status: booking.status as "confirmed" | "cancelled",
    applicantName: booking.applicant_name,
    applicantEmail: booking.applicant_email,
    date: slot.date,
    startTime: slot.start_time,
    endTime: slot.end_time,
    location: slot.location,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/data/coffee-chat-public.ts
git commit -m "Add public coffee chat data layer"
```

---

### Task 12: Public actions — create booking, cancel by token

**Files:**
- Create: `src/actions/coffee-chat-public.ts`

**Interfaces:**
- Consumes: `createAdminClient` (existing); `isValidUcscEmail`, `isSlotBookable`, `DEFAULT_MIN_LEAD_MINUTES` (Task 2); `verifyTurnstileToken` (Task 9); `buildBookingConfirmationEmail`, `sendEmail` (Task 10); `getBookingByToken` (Task 11).
- Produces: `CreateBookingInput`, `CreateBookingResult`, `createBookingAction(input)`, `ActionResult`, `cancelBookingByTokenAction(token)` — used by Tasks 14, 15.

- [ ] **Step 1: Implement `src/actions/coffee-chat-public.ts`**

Not unit tested directly (it's the thin orchestration layer over already-tested pieces: `isValidUcscEmail`, `isSlotBookable`, `isTurnstileResponseValid`, `buildBookingConfirmationEmail`). The two Review Focus race/dedupe cases are covered by the partial unique indexes from Task 1 plus the explicit Postgres error code check below (`23505`) and verified manually per Step 2.

```ts
"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_MIN_LEAD_MINUTES, isSlotBookable, isValidUcscEmail } from "@/lib/coffee-chat";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { buildBookingConfirmationEmail } from "@/lib/email/coffee-chat-confirmation";
import { sendEmail } from "@/lib/email/resend";
import { getBookingByToken } from "@/lib/data/coffee-chat-public";

const UNIQUE_VIOLATION = "23505";

export interface CreateBookingInput {
  slotId: string;
  name: string;
  email: string;
  turnstileToken: string;
}

export interface CreateBookingResult {
  error?: string;
  booking?: { manageToken: string; date: string; startTime: string; endTime: string; location: string };
}

export async function createBookingAction(input: CreateBookingInput): Promise<CreateBookingResult> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();

  if (!name) return { error: "Enter your name." };
  if (!isValidUcscEmail(email)) return { error: "Enter a valid @ucsc.edu email address." };

  const turnstileOk = await verifyTurnstileToken(input.turnstileToken);
  if (!turnstileOk) return { error: "We couldn't verify you're not a robot. Please try again." };

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("coffee_chat_bookings")
    .select("manage_token")
    .eq("applicant_email", email)
    .eq("status", "confirmed")
    .maybeSingle();
  if (existing) {
    const existingBooking = await getBookingByToken(existing.manage_token);
    if (existingBooking) {
      return {
        error: "You already have a coffee chat booked with that email.",
        booking: {
          manageToken: existing.manage_token,
          date: existingBooking.date,
          startTime: existingBooking.startTime,
          endTime: existingBooking.endTime,
          location: existingBooking.location,
        },
      };
    }
  }

  const { data: slot, error: slotError } = await supabase
    .from("coffee_chat_slots")
    .select("id, date, start_time, end_time, location, published")
    .eq("id", input.slotId)
    .single();
  if (slotError || !slot) return { error: "That slot no longer exists. Please pick another." };

  const { data: activeBookingsForSlot } = await supabase
    .from("coffee_chat_bookings")
    .select("id")
    .eq("slot_id", slot.id)
    .eq("status", "confirmed");

  const bookable = isSlotBookable(
    {
      date: slot.date,
      startTime: slot.start_time,
      published: slot.published,
      hasConfirmedBooking: (activeBookingsForSlot ?? []).length > 0,
    },
    new Date(),
    DEFAULT_MIN_LEAD_MINUTES,
  );
  if (!bookable) return { error: "That slot was just taken. Please pick another." };

  const manageToken = randomUUID();
  const { error: insertError } = await supabase.from("coffee_chat_bookings").insert({
    slot_id: slot.id,
    applicant_name: name,
    applicant_email: email,
    manage_token: manageToken,
  });

  if (insertError) {
    if ((insertError as { code?: string }).code === UNIQUE_VIOLATION) {
      return { error: "That slot was just taken, or you already have a booking. Please refresh and try again." };
    }
    return { error: insertError.message };
  }

  const emailContent = buildBookingConfirmationEmail({
    applicantName: name,
    date: slot.date,
    startTime: slot.start_time,
    endTime: slot.end_time,
    location: slot.location,
    manageToken,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL!,
  });

  try {
    await sendEmail({ to: email, subject: emailContent.subject, html: emailContent.html, text: emailContent.text });
  } catch (emailError) {
    // The booking already succeeded and is shown on-screen -- a failed
    // confirmation email shouldn't make the applicant think booking failed.
    console.error("coffee chat confirmation email failed:", emailError);
  }

  revalidatePath("/apply/coffee-chat");
  revalidatePath("/portal/admin/coffee-chats");

  return {
    booking: { manageToken, date: slot.date, startTime: slot.start_time, endTime: slot.end_time, location: slot.location },
  };
}

export interface ActionResult {
  error?: string;
}

export async function cancelBookingByTokenAction(token: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { data: booking, error } = await supabase
    .from("coffee_chat_bookings")
    .select("id, status")
    .eq("manage_token", token)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!booking) return { error: "We couldn't find that booking." };
  if (booking.status === "cancelled") return {};

  const { error: updateError } = await supabase
    .from("coffee_chat_bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", booking.id);
  if (updateError) return { error: updateError.message };

  revalidatePath("/apply/coffee-chat");
  revalidatePath("/portal/admin/coffee-chats");
  return {};
}
```

- [ ] **Step 2: Manually verify the race and dedupe cases**

Run: `npm run dev`, then with the Task 14 booking page not yet built, exercise this via two terminal windows calling the action indirectly once Task 14 lands (defer full verification to Task 14's manual test, which explicitly re-checks: booking the same slot twice in two tabs shows the friendly "just taken" message in the second tab, and booking twice with the same email shows the existing-booking message).

- [ ] **Step 3: Commit**

```bash
git add src/actions/coffee-chat-public.ts
git commit -m "Add public coffee chat booking and cancellation actions"
```

---

### Task 13: ICS download route

**Files:**
- Create: `src/app/api/coffee-chat/[token]/calendar.ics/route.ts`

**Interfaces:**
- Consumes: `getBookingByToken` (Task 11); `buildIcsContent` (Task 3).
- Produces: `GET /api/coffee-chat/[token]/calendar.ics`.

- [ ] **Step 1: Implement the route handler**

```ts
// src/app/api/coffee-chat/[token]/calendar.ics/route.ts
import { getBookingByToken } from "@/lib/data/coffee-chat-public";
import { buildIcsContent } from "@/lib/calendar-invite";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const booking = await getBookingByToken(token);

  if (!booking || booking.status !== "confirmed") {
    return new Response("Booking not found.", { status: 404 });
  }

  const ics = buildIcsContent({
    applicantName: booking.applicantName,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    location: booking.location,
    manageToken: token,
  });

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"coffee-chat.ics\"",
    },
  });
}
```

- [ ] **Step 2: Manually verify**

Once Task 12/14 can produce a real confirmed booking with a known token, visit `/api/coffee-chat/<token>/calendar.ics` directly in the browser and confirm it downloads a `.ics` file that opens correctly in Calendar/Outlook. Visiting with a bogus token should return a 404, not a crash.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/coffee-chat/[token]/calendar.ics/route.ts"
git commit -m "Add ICS download route for coffee chat bookings"
```

---

### Task 14: Public booking page

**Files:**
- Create: `src/app/(marketing)/apply/coffee-chat/page.tsx`
- Create: `src/app/(marketing)/apply/coffee-chat/booking-form.tsx`
- Modify: `src/app/(marketing)/apply/page.tsx`

**Interfaces:**
- Consumes: `getOpenSlots` (Task 11); `createBookingAction` (Task 12); `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Task 9).
- Produces: `/apply/coffee-chat`, the public booking flow's entry point; a link to it from the main Apply page.

- [ ] **Step 1: Build the page**

```tsx
// src/app/(marketing)/apply/coffee-chat/page.tsx
import type { Metadata } from "next";
import { getOpenSlots } from "@/lib/data/coffee-chat-public";
import { BookingForm } from "./booking-form";

export const metadata: Metadata = { title: "Book a Coffee Chat" };

export default async function CoffeeChatPage() {
  const slots = await getOpenSlots();

  return (
    <div className="mx-auto max-w-3xl px-4 pt-14 pb-24 sm:px-6">
      <p className="text-sm font-bold tracking-wide text-primary uppercase">Recruitment</p>
      <h1 className="font-brand mt-3 text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-5xl">
        Book a coffee chat
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-foreground/70 text-pretty">
        A casual, in-person conversation with two of our exec members -- no prep needed, just show up and
        chat. Pick a time below.
      </p>

      <div className="mint-panel mt-10 rounded-[2.5rem] p-8 sm:p-10">
        <BookingForm slots={slots} turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build the booking form**

```tsx
// src/app/(marketing)/apply/coffee-chat/booking-form.tsx
"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Script from "next/script";
import { toast } from "sonner";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { createBookingAction } from "@/actions/coffee-chat-public";
import type { PublicSlot } from "@/lib/data/coffee-chat-public";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: { sitekey: string; callback: (token: string) => void }) => string;
    };
  }
}

function groupByDate(slots: PublicSlot[]): Map<string, PublicSlot[]> {
  const map = new Map<string, PublicSlot[]>();
  for (const slot of slots) {
    if (!map.has(slot.date)) map.set(slot.date, []);
    map.get(slot.date)!.push(slot);
  }
  return map;
}

export function BookingForm({ slots, turnstileSiteKey }: { slots: PublicSlot[]; turnstileSiteKey: string }) {
  const [isPending, startTransition] = useTransition();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileScriptReady, setTurnstileScriptReady] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ date: string; startTime: string; endTime: string; location: string; manageToken: string } | null>(null);
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);

  const byDate = useMemo(() => groupByDate(slots), [slots]);
  const dates = useMemo(() => [...byDate.keys()].sort(), [byDate]);
  const timesForSelectedDate = selectedDate ? (byDate.get(selectedDate) ?? []) : [];

  // Renders the widget once both the Turnstile script has loaded AND its
  // container div exists (the div only mounts once step 3 appears) --
  // whichever of those two happens second is what triggers the render.
  useEffect(() => {
    if (!turnstileScriptReady || !turnstileContainerRef.current || !window.turnstile) return;
    if (turnstileContainerRef.current.childElementCount > 0) return;
    window.turnstile.render(turnstileContainerRef.current, { sitekey: turnstileSiteKey, callback: setTurnstileToken });
  }, [turnstileScriptReady, selectedSlotId, turnstileSiteKey]);

  function handleSubmit() {
    setFieldError(null);
    if (!selectedSlotId) {
      setFieldError("Pick a time first.");
      return;
    }
    if (!turnstileToken) {
      setFieldError("Please complete the verification check.");
      return;
    }

    startTransition(async () => {
      const result = await createBookingAction({ slotId: selectedSlotId, name, email, turnstileToken });
      if (result.error && !result.booking) {
        toast.error(result.error);
        return;
      }
      if (result.error && result.booking) {
        // Already had an active booking -- show them that one instead of erroring blindly.
        toast.info(result.error);
      }
      if (result.booking) setConfirmed(result.booking);
    });
  }

  if (confirmed) {
    return (
      <div className="text-center">
        <CheckCircle2 className="mx-auto size-12 text-primary" />
        <h2 className="font-brand mt-4 text-2xl font-bold tracking-wide uppercase">You're all set!</h2>
        <p className="mt-2 text-foreground/70">
          {confirmed.date} at {confirmed.startTime}–{confirmed.endTime}, {confirmed.location}
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          We've also emailed you a confirmation with calendar-add links and a way to cancel or reschedule.
        </p>
        <Button
          nativeButton={false}
          render={<a href={`/apply/coffee-chat/manage/${confirmed.manageToken}`} />}
          variant="outline"
          className="mt-6 gap-1.5"
        >
          Manage this booking
          <ArrowUpRight className="size-4" />
        </Button>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <p className="text-center text-foreground/70">
        No coffee chat slots are open right now -- check back soon, or follow our socials for updates.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="lazyOnload"
        onReady={() => setTurnstileScriptReady(true)}
      />

      <div>
        <h2 className="font-semibold">1. Pick a date</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {dates.map((date) => (
            <button
              key={date}
              type="button"
              onClick={() => {
                setSelectedDate(date);
                setSelectedSlotId(null);
              }}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                selectedDate === date ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"
              }`}
            >
              {date}
            </button>
          ))}
        </div>
      </div>

      {selectedDate && (
        <div>
          <h2 className="font-semibold">2. Pick a time</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {timesForSelectedDate.map((slot) => (
              <button
                key={slot.id}
                type="button"
                onClick={() => setSelectedSlotId(slot.id)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  selectedSlotId === slot.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"
                }`}
              >
                {slot.startTime}–{slot.endTime} · {slot.location}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedSlotId && (
        <div>
          <h2 className="font-semibold">3. Your details</h2>
          <FieldGroup className="mt-3 space-y-4">
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">UCSC email</FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder="you@ucsc.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </Field>
            <div ref={turnstileContainerRef} />
            <FieldError errors={fieldError ? [{ message: fieldError }] : []} />
            <Button onClick={handleSubmit} disabled={isPending} size="lg" className="w-full">
              {isPending ? "Booking..." : "Book this time"}
            </Button>
          </FieldGroup>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Link to it, and mention coffee chats, from the main Apply page**

In `src/app/(marketing)/apply/page.tsx`, update the `STEPS` array to mention coffee chats between application and interview:

```tsx
const STEPS = [
  {
    icon: FileText,
    title: "Submit your application",
    body: "A short application covering your background and why you're interested in social-impact consulting. Open to every major, every year.",
  },
  {
    icon: MessageCircle,
    title: "Grab a coffee chat",
    body: "A casual, in-person conversation with two of our exec members -- no prep needed, just show up and chat.",
  },
  {
    icon: MessageCircle,
    title: "Interview with our team",
    body: "A conversational interview (sometimes including a short case exercise) to get to know you and how you think through problems.",
  },
  {
    icon: PartyPopper,
    title: "Join the chapter",
    body: "New members go through onboarding and training before being placed on a client project team for the quarter.",
  },
];
```

Add a `CalendarHeart` import alongside the existing `lucide-react` imports and use it for the coffee chat step instead of reusing `MessageCircle` twice:

```tsx
import { ArrowUpRight, CalendarHeart, ChevronDown, FileText, MessageCircle, PartyPopper } from "lucide-react";
```

```tsx
  {
    icon: CalendarHeart,
    title: "Grab a coffee chat",
    ...
  },
```

Then add a link button right after the hero's "Start Your Application" button:

```tsx
            <div className="mt-8 flex flex-wrap gap-3">
              <Button nativeButton={false}
                size="lg"
                render={<a href={APPLY_FORM_URL} target="_blank" rel="noopener noreferrer" />}
                className="gap-1.5 rounded-full"
              >
                Start Your Application
                <ArrowUpRight className="size-4" />
              </Button>
              <Button nativeButton={false} size="lg" variant="outline" render={<a href="/apply/coffee-chat" />} className="gap-1.5 rounded-full">
                Book a Coffee Chat
                <ArrowUpRight className="size-4" />
              </Button>
            </div>
```

(replacing the existing single `<div className="mt-8">...</div>` wrapper around that button.)

- [ ] **Step 4: Manually verify the full applicant flow in the browser**

Requires a published, unbooked slot from Task 7 plus real `RESEND_API_KEY`/`COFFEE_CHAT_FROM_EMAIL`/Turnstile test keys in `.env.local` (Cloudflare provides always-pass test keys for local dev).

Run: `npm run dev`. Visit `/apply` and confirm the new step and button appear. Click through to `/apply/coffee-chat`, pick a date then a time, fill in a `@ucsc.edu` email, complete Turnstile, submit. Confirm:
- The on-screen confirmation shows immediately with correct date/time/location.
- A confirmation email arrives with working Google Calendar and `.ics` links and a working manage link.
- Submitting a non-`@ucsc.edu` email is rejected with a friendly message.
- Opening the same page in a second tab and booking the same slot shows "That slot was just taken" in the second tab.
- Booking a second time with the same email shows the "you already have a coffee chat booked" message instead of a raw error.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(marketing)/apply/coffee-chat/page.tsx" "src/app/(marketing)/apply/coffee-chat/booking-form.tsx" "src/app/(marketing)/apply/page.tsx"
git commit -m "Add public coffee chat booking page and link it from Apply"
```

---

### Task 15: Manage / cancel / reschedule page

**Files:**
- Create: `src/app/(marketing)/apply/coffee-chat/manage/[token]/page.tsx`
- Create: `src/app/(marketing)/apply/coffee-chat/manage/[token]/manage-view.tsx`

**Interfaces:**
- Consumes: `getBookingByToken` (Task 11); `cancelBookingByTokenAction` (Task 12).
- Produces: `/apply/coffee-chat/manage/[token]`.

- [ ] **Step 1: Build the page**

```tsx
// src/app/(marketing)/apply/coffee-chat/manage/[token]/page.tsx
import type { Metadata } from "next";
import { getBookingByToken } from "@/lib/data/coffee-chat-public";
import { ManageView } from "./manage-view";

export const metadata: Metadata = { title: "Manage Your Coffee Chat" };

export default async function ManageBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const booking = await getBookingByToken(token);

  return (
    <div className="mx-auto max-w-xl px-4 pt-14 pb-24 sm:px-6">
      <h1 className="font-brand text-3xl font-bold tracking-tight text-balance sm:text-4xl">
        Manage your coffee chat
      </h1>
      <div className="mint-panel mt-10 rounded-[2.5rem] p-8 sm:p-10">
        <ManageView token={token} booking={booking} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build the manage view**

```tsx
// src/app/(marketing)/apply/coffee-chat/manage/[token]/manage-view.tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpRight } from "lucide-react";
import { cancelBookingByTokenAction } from "@/actions/coffee-chat-public";
import type { ManagedBooking } from "@/lib/data/coffee-chat-public";
import { Button } from "@/components/ui/button";

export function ManageView({ token, booking }: { token: string; booking: ManagedBooking | null }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (!booking) {
    return (
      <p className="text-center text-foreground/70">
        We can't find a booking for that link. If you think this is a mistake, reach out to us directly.
      </p>
    );
  }

  if (booking.status === "cancelled") {
    return (
      <div className="text-center">
        <p className="text-foreground/70">This booking has been cancelled.</p>
        <Button nativeButton={false} render={<a href="/apply/coffee-chat" />} className="mt-6 gap-1.5">
          Book a new time
          <ArrowUpRight className="size-4" />
        </Button>
      </div>
    );
  }

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelBookingByTokenAction(token);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Booking cancelled.");
      router.refresh();
    });
  }

  // Deliberately not a plain `render={<a href=.../>}` Button: navigating
  // away has to wait until the cancel request actually resolves, or the
  // old slot can end up not freed if the page unloads mid-request.
  function handleReschedule() {
    startTransition(async () => {
      const result = await cancelBookingByTokenAction(token);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.push("/apply/coffee-chat");
    });
  }

  return (
    <div className="text-center">
      <p className="text-lg font-semibold">
        {booking.date} at {booking.startTime}–{booking.endTime}
      </p>
      <p className="mt-1 text-foreground/70">{booking.location}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button variant="outline" onClick={handleCancel} disabled={isPending}>
          Cancel booking
        </Button>
        <Button onClick={handleReschedule} disabled={isPending}>
          Reschedule
        </Button>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        "Reschedule" cancels this booking and takes you back to pick a new time.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Manually verify**

Using a real confirmed booking's manage link from Task 14's verification: open it, confirm the details match, click "Cancel booking," confirm the slot reopens on `/apply/coffee-chat` and the admin Bookings tab (Task 8) shows it as `cancelled`. Visit a manage URL with a made-up token and confirm the friendly not-found message appears instead of a crash.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(marketing)/apply/coffee-chat/manage/[token]/page.tsx" "src/app/(marketing)/apply/coffee-chat/manage/[token]/manage-view.tsx"
git commit -m "Add coffee chat booking manage/cancel/reschedule page"
```

---

### Task 16: Exec notifications for coffee chat bookings

**Files:**
- Modify: `src/lib/data/notifications.ts`

**Interfaces:**
- Consumes: existing `getMyNotifications(userId, isExecUser)` structure.
- Produces: two new notification item kinds (`coffee-chat-booked-*`, `coffee-chat-cancelled-*`) merged into the existing feed.

- [ ] **Step 1: Add the coffee-chat queries to the existing `Promise.all` fan-out**

In `src/lib/data/notifications.ts`, extend the exec-only second wave of queries (the one currently just fetching `room_bookings`) to also fetch bookings where the current user is one of the two assigned execs:

```ts
    isExecUser
      ? supabase
          .from("coffee_chat_bookings")
          .select("id, applicant_name, status, created_at, cancelled_at, slot:coffee_chat_slots(id, exec_id_1, exec_id_2)")
          .order("created_at", { ascending: false })
          .limit(15)
      : Promise.resolve({ data: null }),
```

Add this as one more entry in the existing `Promise.all([...])` array that already fetches `room_bookings`, and destructure its result alongside `bookings` (e.g. `{ data: coffeeChatBookings }`).

- [ ] **Step 2: Filter to slots this user is assigned to, and add feed items**

After the existing `room_bookings` loop, add:

```ts
  interface CoffeeChatBookingNotificationRow {
    id: string;
    applicant_name: string;
    status: string;
    created_at: string;
    cancelled_at: string | null;
    slot: { id: string; exec_id_1: string; exec_id_2: string | null } | null;
  }

  const myCoffeeChatBookings = ((coffeeChatBookings ?? []) as unknown as CoffeeChatBookingNotificationRow[]).filter(
    (b) => b.slot && (b.slot.exec_id_1 === userId || b.slot.exec_id_2 === userId),
  );

  for (const b of myCoffeeChatBookings) {
    if (b.status === "confirmed") {
      items.push({
        id: `coffee-chat-booked-${b.id}`,
        message: `${b.applicant_name} booked a coffee chat with you.`,
        href: "/portal/admin/coffee-chats",
        occurredAt: b.created_at,
      });
    } else if (b.status === "cancelled" && b.cancelled_at) {
      items.push({
        id: `coffee-chat-cancelled-${b.id}`,
        message: `${b.applicant_name} cancelled their coffee chat with you.`,
        href: "/portal/admin/coffee-chats",
        occurredAt: b.cancelled_at,
      });
    }
  }
```

Add this block before the existing `items.sort(...)` line so these entries get included in the sort/trim/unread-count logic that already exists.

- [ ] **Step 3: Manually verify**

As an exec assigned to a slot (from Task 7), have a booking created against it (Task 14) and confirm the notification bell shows "booked a coffee chat with you" linking to `/portal/admin/coffee-chats`. Cancel it (Task 15) and confirm the cancellation notification appears too.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/notifications.ts
git commit -m "Surface coffee chat bookings/cancellations in exec notifications"
```

---

## Self-Review Notes

**Spec coverage:** schema (Task 1), slot generation/swap/bookability/email-validation logic (Task 2), calendar invites (Task 3), exec data/actions (Tasks 4-5), admin UI for all three sub-flows including the "my slots" filter (Tasks 6-8), Turnstile (Task 9), Resend email (Task 10), public data/actions (Tasks 11-12), ICS route (Task 13), public booking page + Apply page copy update (Task 14), manage/cancel/reschedule (Task 15), exec notifications (Task 16). All in-scope spec sections have an owning task; all explicitly-out-of-scope items (interview scheduling, reminders/cron, no-show tracking, generic session-type abstraction) have no task, intentionally.

**Type consistency:** `SlotRow`/`AvailabilityRow`/`BookingRow` (Task 4) are consumed as named in Tasks 6-8; `PublicSlot`/`ManagedBooking` (Task 11) are consumed as named in Tasks 12-15; `CreateBookingInput`/`CreateBookingResult` (Task 12) match the shape `booking-form.tsx` (Task 14) destructures; `CoffeeChatBookingForInvite` (Task 3) matches what both `coffee-chat-confirmation.ts` (Task 10) and the ICS route (Task 13) pass in.

**Review Focus:** all five items map to an owning task's verification step (booking race and dedupe in Task 12/14; email validation in Task 2 + Task 14; exec double-booking in Task 2; invalid manage token in Task 11/15).
