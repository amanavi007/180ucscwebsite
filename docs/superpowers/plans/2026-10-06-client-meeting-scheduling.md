# Client Meeting Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let businesses book 30-minute intro video calls with a fixed admin-picked panel of 3 execs, modeled on the existing interview scheduling.

**Architecture:** New parallel `client_meeting_*` tables and code (no shared abstraction with coffee chat or interviews). A slot exists only where all 3 panel execs are free. Public booking uses the service-role client with all validation in the server action; exec/admin actions use the authenticated client under `is_exec()` RLS. Meeting links are added manually by an exec after booking.

**Tech Stack:** Next.js (breaking-changes fork: read `node_modules/next/dist/docs/` before writing route/page code), Supabase (Postgres + RLS), Vitest, Tailwind/shadcn-style UI in `src/components/ui`, Cloudflare Turnstile, existing `sendEmail`.

**Spec:** `docs/superpowers/specs/2026-10-06-client-meeting-scheduling-design.md`

## Global Constraints

- Panel is exactly 3 execs, stored in `org_settings.client_meeting_panel` as a JSON array of profile ids. All 3 attend every meeting.
- Slots are 30 minutes (`client_meeting_slot_minutes` default `'30'`), start on the :00/:30 grid.
- Booking requires at least 24h lead (`CLIENT_MEETING_MIN_LEAD_MINUTES = 1440`); client self-cancel/reschedule until 12h before (`CLIENT_MEETING_CANCEL_CUTOFF_MINUTES = 720`).
- One `confirmed` booking per email and per slot (partial unique indexes). Past confirmed bookings are retired to `completed` before the check (same as interviews) so a returning client is not blocked.
- Open to any business, Turnstile on every booking attempt, no allowlist, no anon RLS policy.
- Generated slots are created **unpublished**; an admin publishes them.
- Booking row snapshots `panel_exec_ids` (uuid[]) at booking time.
- `meeting_url` is nullable, `https://` only, max 500 chars; setting/changing it emails the client. A reschedule copies it to the new booking.
- Public page `/services/book`, manage page `/services/book/manage/[token]`, ICS `/api/client-meeting/[token]/calendar.ics`, cron `/api/cron/client-meeting-reminders`, admin page `/portal/admin/client-meetings`.
- Panel execs are not blocked from coffee chats or interviews at the same time.
- Do not add Claude/Co-Authored-By attribution to commits or PRs (user rule).
- Dates/times: use `src/lib/date.ts` (`ORG_TIME_ZONE`, `zonedDateTimeToUtc`, `formatOrgDate`) and `src/lib/coffee-chat.ts` helpers (`normalizeTime`, `timeToMinutes`, `minutesToTime`, `overlaps`, `formatTime12h`).

## Review Focus

- Panel setting missing, malformed, or with fewer/more than 3 ids: booking and generation must refuse cleanly, not crash. (Task 1, 6)
- Same client emails twice / double-clicks the same slot / two clients race one slot: unique-violation maps to a friendly message, never a 500. (Task 7)
- A client whose previous meeting already happened must be able to book again. (Task 7)
- Needs/business text containing `<`, commas, semicolons, newlines: escaped in HTML emails and RFC 5545 ICS text. (Task 3, 4)
- Meeting URL that is `http:`, `javascript:`, empty, or overlong: rejected or cleared, never emailed. (Task 1, 6)
- Admin changes the panel after bookings exist: old bookings, reminders and calendar feed keep using the snapshot. (Task 3, 6, 9)
- Slot deleted/unpublished while it has a confirmed booking: delete is blocked; unpublish does not cancel. (Task 6)

## File Structure

- Create `supabase/migrations/20261006000003_client_meeting_scheduling.sql` — tables, RLS, indexes, settings.
- Modify `src/lib/supabase/database.types.ts` — hand-add the 4 tables (file is hand-maintained; match `interview_bookings` block style).
- Create `src/lib/client-meeting.ts` (+ `.test.ts`) — constants, pure rules, generation, validation.
- Create `src/lib/client-meeting-invite.ts` (+ test) — Google/ICS builders and feed event lines. Modify `src/lib/interview-invite.ts` only to `export escapeIcsText`.
- Create `src/lib/client-meeting-feed.ts`; modify `src/lib/calendar-feed.ts` — feed integration.
- Create `src/lib/client-meeting-reminders.ts` (+ test) — reminder selection.
- Create `src/lib/email/client-meeting-emails.ts` (+ test), `src/lib/email/notify-client-meeting.ts`.
- Create `src/lib/data/client-meeting.ts` (admin reads), `src/lib/data/client-meeting-public.ts` (public reads).
- Create `src/actions/client-meeting.ts` (admin), `src/actions/client-meeting-public.ts` (public).
- Create `src/app/api/cron/client-meeting-reminders/route.ts`, `src/app/api/client-meeting/[token]/calendar.ics/route.ts`; modify `vercel.json`.
- Create `src/app/(marketing)/services/book/{page.tsx,booking-form.tsx,confirmation.tsx,add-to-calendar.tsx,manage/[token]/page.tsx,manage/[token]/manage-view.tsx}`.
- Create `src/app/portal/(app)/admin/client-meetings/{page.tsx,booking-toggle.tsx,panel-view.tsx,availability-view.tsx,slots-view.tsx,bookings-view.tsx}`; add a nav entry wherever the interviews admin link lives (grep `admin/interviews` in `src/components` / layout).
- Modify `src/lib/data/notifications.ts` — bell entries.
- Modify `src/app/(marketing)/services/page.tsx` — "Book an intro call" link.

---

### Task 1: Pure rules, generation and validation

**Files:**
- Create: `src/lib/client-meeting.ts`
- Test: `src/lib/client-meeting.test.ts`

**Interfaces:**
- Produces (all exported from `src/lib/client-meeting.ts`):
  - constants `CLIENT_MEETING_SLOT_MINUTES = 30`, `CLIENT_MEETING_GRID_MINUTES = 30`, `CLIENT_MEETING_MIN_LEAD_MINUTES = 1440`, `CLIENT_MEETING_CANCEL_CUTOFF_MINUTES = 720`, `PANEL_SIZE = 3`
  - `parsePanelSetting(value: string | undefined | null): string[]` — valid ⇒ 3 distinct non-empty strings, else `[]`
  - `parseClientMeetingSettings(rows: {key:string;value:string}[]): { bookingOpen: boolean; slotMinutes: number; panelExecIds: string[] }`
  - `interface ClientMeetingAvailabilityBlock { execId; date; startTime; endTime }`
  - `interface ClientMeetingSlotTime { date; startTime; endTime }`
  - `generateClientMeetingSlots(panelExecIds: string[], availability: ClientMeetingAvailabilityBlock[], existing: ClientMeetingSlotTime[], slotMinutes?: number): ClientMeetingSlotTime[]`
  - `isClientMeetingBookable(slot: {date;startTime;published;hasConfirmedBooking}, panelValid: boolean, now: Date, minLeadMinutes?: number): boolean`
  - `canClientCancel(date, startTime, now): boolean`
  - `isClientMeetingPast(date, endTime, now): boolean`
  - `validateMeetingUrl(raw: string): { url: string | null } | { error: string }`
  - `isValidEmail(email: string): boolean`
  - `validateClientMeetingInput(input: {contactName;businessName;email;phone;needs}): { error: string } | { value: {contactName;businessName;email;phone: string|null;needs} }`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/client-meeting.test.ts
import { describe, expect, it } from "vitest";
import {
  canClientCancel,
  generateClientMeetingSlots,
  isClientMeetingBookable,
  isClientMeetingPast,
  parseClientMeetingSettings,
  parsePanelSetting,
  validateClientMeetingInput,
  validateMeetingUrl,
} from "./client-meeting";

const panel = ["a", "b", "c"];
const block = (execId: string, startTime: string, endTime: string, date = "2026-10-20") => ({ execId, date, startTime, endTime });

describe("parsePanelSetting", () => {
  it("accepts exactly 3 distinct ids", () => {
    expect(parsePanelSetting('["a","b","c"]')).toEqual(["a", "b", "c"]);
  });
  it.each([undefined, null, "", "not json", "[]", '["a","b"]', '["a","b","c","d"]', '["a","a","b"]', '["a","","b"]', '{"a":1}', "[1,2,3]"])(
    "rejects %s",
    (v) => expect(parsePanelSetting(v as string | undefined)).toEqual([]),
  );
});

describe("parseClientMeetingSettings", () => {
  it("defaults to closed / 30 min / no panel", () => {
    expect(parseClientMeetingSettings([])).toEqual({ bookingOpen: false, slotMinutes: 30, panelExecIds: [] });
  });
  it("reads values and rejects out-of-range minutes", () => {
    const s = parseClientMeetingSettings([
      { key: "client_meeting_booking_open", value: "true" },
      { key: "client_meeting_slot_minutes", value: "999" },
      { key: "client_meeting_panel", value: '["a","b","c"]' },
    ]);
    expect(s).toEqual({ bookingOpen: true, slotMinutes: 30, panelExecIds: panel });
  });
});

describe("generateClientMeetingSlots", () => {
  it("only creates slots where all 3 are free, on the :00/:30 grid", () => {
    const slots = generateClientMeetingSlots(panel, [
      block("a", "09:00", "11:00"),
      block("b", "09:15", "11:00"),
      block("c", "09:00", "10:30"),
    ]);
    expect(slots.map((s) => s.startTime)).toEqual(["09:30", "10:00"]);
    expect(slots[0]).toEqual({ date: "2026-10-20", startTime: "09:30", endTime: "10:00" });
  });
  it("creates nothing when one exec has no availability", () => {
    expect(generateClientMeetingSlots(panel, [block("a", "09:00", "11:00"), block("b", "09:00", "11:00")])).toEqual([]);
  });
  it("ignores availability from non-panel execs", () => {
    expect(
      generateClientMeetingSlots(panel, [block("a", "09:00", "10:00"), block("b", "09:00", "10:00"), block("x", "09:00", "10:00")]),
    ).toEqual([]);
  });
  it("returns nothing for an invalid panel", () => {
    expect(generateClientMeetingSlots(["a", "b"], [block("a", "09:00", "10:00"), block("b", "09:00", "10:00")])).toEqual([]);
  });
  it("skips times overlapping existing slots and never overlaps itself with longer slots", () => {
    const avail = [block("a", "09:00", "11:00"), block("b", "09:00", "11:00"), block("c", "09:00", "11:00")];
    const withExisting = generateClientMeetingSlots(panel, avail, [{ date: "2026-10-20", startTime: "09:30", endTime: "10:00" }]);
    expect(withExisting.map((s) => s.startTime)).toEqual(["09:00", "10:00", "10:30"]);
    const long = generateClientMeetingSlots(panel, avail, [], 60);
    expect(long.map((s) => s.startTime)).toEqual(["09:00", "10:00"]);
  });
  it("is deterministic and handles HH:MM:SS input", () => {
    const avail = [block("c", "09:00:00", "10:00:00"), block("a", "09:00:00", "10:00:00"), block("b", "09:00:00", "10:00:00")];
    expect(generateClientMeetingSlots(panel, avail)).toEqual(generateClientMeetingSlots(panel, [...avail].reverse()));
  });
});

describe("bookability and cancel", () => {
  const slot = { date: "2026-10-20", startTime: "10:00", published: true, hasConfirmedBooking: false };
  it("needs published, unbooked, valid panel and >= 24h lead", () => {
    const farNow = new Date("2026-10-18T09:00:00-07:00"); // 49h before
    expect(isClientMeetingBookable(slot, true, farNow)).toBe(true);
    expect(isClientMeetingBookable({ ...slot, published: false }, true, farNow)).toBe(false);
    expect(isClientMeetingBookable({ ...slot, hasConfirmedBooking: true }, true, farNow)).toBe(false);
    expect(isClientMeetingBookable(slot, false, farNow)).toBe(false);
    expect(isClientMeetingBookable(slot, true, new Date("2026-10-19T10:01:00-07:00"))).toBe(false); // 23h59m
    expect(isClientMeetingBookable(slot, true, new Date("2026-10-19T10:00:00-07:00"))).toBe(true); // exactly 24h
  });
  it("lets clients cancel until exactly 12h before", () => {
    expect(canClientCancel("2026-10-20", "10:00", new Date("2026-10-19T22:00:00-07:00"))).toBe(true);
    expect(canClientCancel("2026-10-20", "10:00", new Date("2026-10-19T22:00:01-07:00"))).toBe(false);
  });
  it("detects past meetings", () => {
    expect(isClientMeetingPast("2026-10-20", "10:30", new Date("2026-10-20T10:30:00-07:00"))).toBe(true);
    expect(isClientMeetingPast("2026-10-20", "10:30", new Date("2026-10-20T10:29:00-07:00"))).toBe(false);
  });
});

describe("validateMeetingUrl", () => {
  it("accepts https and trims", () => expect(validateMeetingUrl("  https://zoom.us/j/1  ")).toEqual({ url: "https://zoom.us/j/1" }));
  it("treats empty as clearing the link", () => expect(validateMeetingUrl("   ")).toEqual({ url: null }));
  it.each(["http://zoom.us/j/1", "javascript:alert(1)", "zoom.us/j/1", "https://" + "a".repeat(600) + ".com"])("rejects %s", (v) =>
    expect(validateMeetingUrl(v)).toHaveProperty("error"),
  );
});

describe("validateClientMeetingInput", () => {
  const ok = { contactName: " Jo ", businessName: "Acme", email: " Jo@Acme.COM ", phone: "", needs: "Marketing help" };
  it("normalizes", () => {
    expect(validateClientMeetingInput(ok)).toEqual({
      value: { contactName: "Jo", businessName: "Acme", email: "jo@acme.com", phone: null, needs: "Marketing help" },
    });
  });
  it.each([
    { contactName: "" },
    { businessName: " " },
    { email: "nope" },
    { needs: "" },
    { needs: "x".repeat(1001) },
    { contactName: "x".repeat(101) },
  ])("rejects %j", (patch) => expect(validateClientMeetingInput({ ...ok, ...patch })).toHaveProperty("error"));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/client-meeting.test.ts`
Expected: FAIL (module `./client-meeting` not found).

- [ ] **Step 3: Implement**

```ts
// src/lib/client-meeting.ts
import { minutesToTime, normalizeTime, overlaps, timeToMinutes } from "./coffee-chat";
import { zonedDateTimeToUtc } from "./date";

export const CLIENT_MEETING_SLOT_MINUTES = 30;
export const CLIENT_MEETING_GRID_MINUTES = 30;
export const CLIENT_MEETING_MIN_LEAD_MINUTES = 24 * 60;
export const CLIENT_MEETING_CANCEL_CUTOFF_MINUTES = 12 * 60;
export const PANEL_SIZE = 3;

export const MAX_CONTACT_NAME = 100;
export const MAX_BUSINESS_NAME = 150;
export const MAX_EMAIL = 254;
export const MAX_PHONE = 30;
export const MAX_NEEDS = 1000;
export const MAX_MEETING_URL = 500;

/** The panel setting is valid only as a JSON array of exactly 3 distinct non-empty strings. */
export function parsePanelSetting(value: string | undefined | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length !== PANEL_SIZE) return [];
    if (!parsed.every((id) => typeof id === "string" && id.trim() !== "")) return [];
    const ids = parsed as string[];
    return new Set(ids).size === PANEL_SIZE ? ids : [];
  } catch {
    return [];
  }
}

export function parseClientMeetingSettings(rows: { key: string; value: string }[]): {
  bookingOpen: boolean;
  slotMinutes: number;
  panelExecIds: string[];
} {
  const get = (key: string) => rows.find((r) => r.key === key)?.value;
  const minutes = Number(get("client_meeting_slot_minutes"));
  const valid = Number.isInteger(minutes) && minutes >= 15 && minutes <= 120;
  return {
    bookingOpen: get("client_meeting_booking_open") === "true",
    slotMinutes: valid ? minutes : CLIENT_MEETING_SLOT_MINUTES,
    panelExecIds: parsePanelSetting(get("client_meeting_panel")),
  };
}

export interface ClientMeetingAvailabilityBlock {
  execId: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM" or "HH:MM:SS"
  endTime: string;
}

export interface ClientMeetingSlotTime {
  date: string;
  startTime: string;
  endTime: string;
}

/**
 * Slots exist only where all 3 panel execs are free. Candidate starts are every :00/:30 for which
 * each exec's block covers the whole slot. Existing slots (and slots created earlier in this run)
 * are never overlapped. Output is chronological, so the same input always gives the same result.
 */
export function generateClientMeetingSlots(
  panelExecIds: string[],
  availability: ClientMeetingAvailabilityBlock[],
  existing: ClientMeetingSlotTime[] = [],
  slotMinutes: number = CLIENT_MEETING_SLOT_MINUTES,
): ClientMeetingSlotTime[] {
  if (panelExecIds.length !== PANEL_SIZE) return [];
  const panel = new Set(panelExecIds);

  const free = new Map<string, Set<string>>();
  for (const raw of availability) {
    if (!panel.has(raw.execId)) continue;
    const start = timeToMinutes(normalizeTime(raw.startTime));
    const end = timeToMinutes(normalizeTime(raw.endTime));
    for (
      let t = Math.ceil(start / CLIENT_MEETING_GRID_MINUTES) * CLIENT_MEETING_GRID_MINUTES;
      t + slotMinutes <= end;
      t += CLIENT_MEETING_GRID_MINUTES
    ) {
      const key = `${raw.date}|${minutesToTime(t)}`;
      if (!free.has(key)) free.set(key, new Set());
      free.get(key)!.add(raw.execId);
    }
  }

  const taken = existing.map((s) => ({ date: s.date, startTime: normalizeTime(s.startTime), endTime: normalizeTime(s.endTime) }));
  const generated: ClientMeetingSlotTime[] = [];
  for (const [key, execIds] of [...free].sort(([a], [b]) => a.localeCompare(b))) {
    if (execIds.size !== PANEL_SIZE) continue;
    const [date, startTime] = key.split("|");
    const endTime = minutesToTime(timeToMinutes(startTime) + slotMinutes);
    if (taken.some((s) => s.date === date && overlaps(s.startTime, s.endTime, startTime, endTime))) continue;
    const slot = { date, startTime, endTime };
    generated.push(slot);
    taken.push(slot);
  }
  return generated;
}

export function isClientMeetingBookable(
  slot: { date: string; startTime: string; published: boolean; hasConfirmedBooking: boolean },
  panelValid: boolean,
  now: Date,
  minLeadMinutes: number = CLIENT_MEETING_MIN_LEAD_MINUTES,
): boolean {
  if (!panelValid || !slot.published || slot.hasConfirmedBooking) return false;
  const start = zonedDateTimeToUtc(slot.date, normalizeTime(slot.startTime));
  return start.getTime() - now.getTime() >= minLeadMinutes * 60_000;
}

/** Clients can cancel or reschedule themselves until 12 hours before the meeting. */
export function canClientCancel(date: string, startTime: string, now: Date): boolean {
  const start = zonedDateTimeToUtc(date, normalizeTime(startTime));
  return start.getTime() - now.getTime() >= CLIENT_MEETING_CANCEL_CUTOFF_MINUTES * 60_000;
}

/** True once the meeting's end time has passed (used to retire old confirmed bookings). */
export function isClientMeetingPast(date: string, endTime: string, now: Date): boolean {
  return zonedDateTimeToUtc(date, normalizeTime(endTime)).getTime() <= now.getTime();
}

/** Empty clears the link; otherwise it must be an https URL of reasonable length. */
export function validateMeetingUrl(raw: string): { url: string | null } | { error: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { url: null };
  if (trimmed.length > MAX_MEETING_URL) return { error: "That link is too long." };
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return { error: "The meeting link must start with https://." };
    return { url: trimmed };
  } catch {
    return { error: "Enter a full link, like https://meet.google.com/abc-defg-hij." };
  }
}

export function isValidEmail(email: string): boolean {
  return email.length <= MAX_EMAIL && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateClientMeetingInput(input: {
  contactName: string;
  businessName: string;
  email: string;
  phone: string;
  needs: string;
}):
  | { error: string }
  | { value: { contactName: string; businessName: string; email: string; phone: string | null; needs: string } } {
  const contactName = input.contactName.trim();
  const businessName = input.businessName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  const needs = input.needs.trim();

  if (!contactName) return { error: "Enter your name." };
  if (contactName.length > MAX_CONTACT_NAME) return { error: "Your name is too long." };
  if (!businessName) return { error: "Enter your business or organization name." };
  if (businessName.length > MAX_BUSINESS_NAME) return { error: "The business name is too long." };
  if (!isValidEmail(email)) return { error: "Enter a valid email address." };
  if (phone.length > MAX_PHONE) return { error: "That phone number is too long." };
  if (!needs) return { error: "Tell us a little about what you need help with." };
  if (needs.length > MAX_NEEDS) return { error: `Keep it under ${MAX_NEEDS} characters.` };

  return { value: { contactName, businessName, email, phone: phone === "" ? null : phone, needs } };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/client-meeting.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lib/client-meeting.ts src/lib/client-meeting.test.ts
git commit -m "Add client meeting rules, slot generation and validation"
```

---

### Task 2: Migration and database types

**Files:**
- Create: `supabase/migrations/20261006000003_client_meeting_scheduling.sql`
- Modify: `src/lib/supabase/database.types.ts` (add 4 table blocks beside `interview_bookings`)

**Interfaces:**
- Produces tables: `client_meeting_availability`, `client_meeting_slots`, `client_meetings`; `org_settings` rows `client_meeting_booking_open`, `client_meeting_slot_minutes`, `client_meeting_panel`.

- [ ] **Step 1: Write the migration**

```sql
-- Client meeting scheduling: businesses book 30-minute video intro calls with a
-- fixed panel of 3 execs (org_settings.client_meeting_panel). See docs/superpowers/
-- specs/2026-10-06-client-meeting-scheduling-design.md.
--
-- Exec/admin writes use the authenticated client (RLS below). Client writes come
-- from Server Actions using the service-role client; there is deliberately no anon policy.

create table public.client_meeting_availability (
  id uuid primary key default gen_random_uuid(),
  exec_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  constraint client_meeting_availability_time_check check (end_time > start_time)
);

create index client_meeting_availability_date_idx on public.client_meeting_availability (date);
create index client_meeting_availability_exec_id_idx on public.client_meeting_availability (exec_id);

alter table public.client_meeting_availability enable row level security;
create policy client_meeting_availability_all on public.client_meeting_availability
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create table public.client_meeting_slots (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_time time not null,
  end_time time not null,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_meeting_slots_time_check check (end_time > start_time)
);

create index client_meeting_slots_date_idx on public.client_meeting_slots (date);

alter table public.client_meeting_slots enable row level security;
create policy client_meeting_slots_all on public.client_meeting_slots
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create trigger client_meeting_slots_set_updated_at
  before update on public.client_meeting_slots
  for each row execute procedure public.set_updated_at();

create table public.client_meetings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.client_meeting_slots (id) on delete cascade,
  contact_name text not null,
  business_name text not null,
  email text not null,
  phone text,
  needs text not null,
  -- The 3 panel execs when this was booked, so later panel changes do not rewrite history.
  panel_exec_ids uuid[] not null,
  meeting_url text,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'completed')),
  manage_token text not null unique,
  reminder_day_before_sent_at timestamptz,
  reminder_morning_sent_at timestamptz,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint client_meetings_email_normalized check (email = lower(btrim(email))),
  constraint client_meetings_panel_size check (cardinality(panel_exec_ids) = 3)
);

-- Race-proof: one confirmed meeting per slot and per client email. Cancelling or
-- completing frees both.
create unique index client_meetings_slot_active_idx
  on public.client_meetings (slot_id) where status = 'confirmed';
create unique index client_meetings_email_active_idx
  on public.client_meetings (email) where status = 'confirmed';
create index client_meetings_panel_idx on public.client_meetings using gin (panel_exec_ids);

alter table public.client_meetings enable row level security;
create policy client_meetings_all on public.client_meetings
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

insert into public.org_settings (key, value) values
  ('client_meeting_booking_open', 'false'),
  ('client_meeting_slot_minutes', '30'),
  ('client_meeting_panel', '[]')
on conflict (key) do nothing;
```

- [ ] **Step 2: Add types**

Open `src/lib/supabase/database.types.ts`, find the `interview_bookings` block (~line 732) and the `interview_slots` / `interview_availability` blocks. Add `client_meeting_availability`, `client_meeting_slots` (copy the interview equivalents, same columns) and `client_meetings` with `Row`: `id, slot_id, contact_name, business_name, email, phone: string | null, needs, panel_exec_ids: string[], meeting_url: string | null, status: string, manage_token, reminder_day_before_sent_at: string | null, reminder_morning_sent_at: string | null, created_at, cancelled_at: string | null`; `Insert` with the same keys, optional where DB-defaulted (`id, phone, meeting_url, status, reminder_*, created_at, cancelled_at`); `Update: Partial<...Insert>`; `Relationships: []`. Match the exact formatting of the neighboring interview blocks.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Apply the migration to the dev database**

Run the same way previous migrations were applied in this repo (check `git show --stat HEAD~20 -- supabase/migrations` and the README; typically `npx supabase db push` or the Supabase SQL editor). Expected: tables exist; `select key,value from org_settings where key like 'client_meeting%'` returns 3 rows.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261006000003_client_meeting_scheduling.sql src/lib/supabase/database.types.ts
git commit -m "Add client meeting scheduling tables and settings"
```

---

### Task 3: Calendar invite builders and exec feed

**Files:**
- Modify: `src/lib/interview-invite.ts` (add `export` to `escapeIcsText`)
- Create: `src/lib/client-meeting-invite.ts`, `src/lib/client-meeting-invite.test.ts`
- Create: `src/lib/client-meeting-feed.ts`
- Modify: `src/lib/calendar-feed.ts`

**Interfaces:**
- Consumes: `icsLines`, `toUtcStamp` from `./calendar-invite`; `escapeIcsText` from `./interview-invite`.
- Produces:
  - `interface ClientMeetingInviteInput { businessName: string; contactName: string; needs?: string; date: string; startTime: string; endTime: string; manageToken: string; meetingUrl: string | null; audience?: "client" | "exec"; panelNames?: string[] }`
  - `buildClientMeetingGoogleCalendarUrl(input): string`
  - `buildClientMeetingIcs(input): string`
  - `clientMeetingEventLines(input & { id: string }): string[]` (UID `${id}-client-meeting-exec@180dcucsc.org`)
  - `buildClientMeetingFeedEvents(execId: string): Promise<string[]>`

- [ ] **Step 1: Export `escapeIcsText`** — in `src/lib/interview-invite.ts` change `function escapeIcsText` to `export function escapeIcsText`.

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/client-meeting-invite.test.ts
import { describe, expect, it } from "vitest";
import { buildClientMeetingGoogleCalendarUrl, buildClientMeetingIcs, clientMeetingEventLines } from "./client-meeting-invite";

const base = {
  businessName: "Acme, Inc; Co",
  contactName: "Jo Park",
  needs: "Line one\nLine two, with; punctuation",
  date: "2026-10-20",
  startTime: "10:00",
  endTime: "10:30",
  manageToken: "tok123",
  meetingUrl: "https://meet.google.com/abc-defg-hij",
};

describe("client meeting invites", () => {
  it("builds a Google link in UTC with the meeting link as location", () => {
    const url = buildClientMeetingGoogleCalendarUrl(base);
    expect(url).toContain("dates=20261020T170000Z%2F20261020T173000Z");
    expect(url).toContain("location=https%3A%2F%2Fmeet.google.com");
  });
  it("says the link is coming when there is none", () => {
    expect(buildClientMeetingIcs({ ...base, meetingUrl: null })).toContain("Link to follow");
  });
  it("keeps the client copy generic and names business, needs and panel on the exec copy, escaped", () => {
    expect(buildClientMeetingIcs(base)).not.toContain("Line one");
    const exec = buildClientMeetingIcs({ ...base, audience: "exec", panelNames: ["Ava", "Ben"] });
    expect(exec).toContain("SUMMARY:Client meeting: Acme\\, Inc\\; Co");
    expect(exec).toContain("Line one\\nLine two\\, with\\; punctuation");
    expect(exec).toContain("Ava\\, Ben");
    expect(exec).not.toMatch(/Line one\r?\nLine two/);
  });
  it("uses CRLF and stable per-booking UIDs for the feed", () => {
    expect(buildClientMeetingIcs(base)).toContain("\r\n");
    const lines = clientMeetingEventLines({ ...base, id: "b1", audience: "exec" });
    expect(lines).toContain("UID:b1-client-meeting-exec@180dcucsc.org");
    expect(lines[0]).toBe("BEGIN:VEVENT");
    expect(lines.at(-1)).toBe("END:VEVENT");
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/lib/client-meeting-invite.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 4: Implement `client-meeting-invite.ts`**

```ts
import { icsLines, toUtcStamp } from "./calendar-invite";
import { escapeIcsText } from "./interview-invite";

export interface ClientMeetingInviteInput {
  businessName: string;
  contactName: string;
  needs?: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM"
  endTime: string;
  manageToken: string;
  meetingUrl: string | null;
  /** Exec copies name the business, contact, needs and panel; the client's own copy stays generic. */
  audience?: "client" | "exec";
  /** The other panel members, shown on exec copies. */
  panelNames?: string[];
}

const LINK_PENDING = "Link to follow";

function eventText(input: ClientMeetingInviteInput): { title: string; description: string; location: string } {
  const location = input.meetingUrl ?? LINK_PENDING;
  if (input.audience === "exec") {
    const panel = input.panelNames && input.panelNames.length > 0 ? `\nPanel: ${input.panelNames.join(", ")}.` : "";
    return {
      title: `Client meeting: ${input.businessName}`,
      description:
        `180DC UCSC intro call with ${input.contactName} (${input.businessName}). Video link: ${location}.` +
        (input.needs ? `\nNeeds: ${input.needs}` : "") +
        panel,
      location,
    };
  }
  return {
    title: "180DC UCSC Intro Call",
    description: `Intro call with 180DC UCSC. Video link: ${location}.`,
    location,
  };
}

export function buildClientMeetingGoogleCalendarUrl(input: ClientMeetingInviteInput): string {
  const { title, description, location } = eventText(input);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${toUtcStamp(input.date, input.startTime)}/${toUtcStamp(input.date, input.endTime)}`,
    details: description,
    location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function eventLines(input: ClientMeetingInviteInput, uid: string): string[] {
  const { title, description, location } = eventText(input);
  return [
    "BEGIN:VEVENT",
    `UID:${uid}@180dcucsc.org`,
    `DTSTAMP:${toUtcStamp(input.date, input.startTime)}`,
    `DTSTART:${toUtcStamp(input.date, input.startTime)}`,
    `DTEND:${toUtcStamp(input.date, input.endTime)}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    "END:VEVENT",
  ];
}

/** One-booking calendar file, for the client's "Apple / Outlook" download. */
export function buildClientMeetingIcs(input: ClientMeetingInviteInput): string {
  const suffix = input.audience === "exec" ? "-exec" : "";
  return icsLines([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//180DC UCSC//Client Meeting//EN",
    ...eventLines(input, `${input.manageToken}-client-meeting${suffix}`),
    "END:VCALENDAR",
    "",
  ]);
}

/** VEVENT lines for the exec feed; the UID is stable per booking so apps update or drop the event. */
export function clientMeetingEventLines(input: ClientMeetingInviteInput & { id: string }): string[] {
  return eventLines({ ...input, audience: "exec" }, `${input.id}-client-meeting-exec`);
}
```

- [ ] **Step 5: Run to verify pass** — `npx vitest run src/lib/client-meeting-invite.test.ts` → PASS.

- [ ] **Step 6: Implement the feed and wire it in**

```ts
// src/lib/client-meeting-feed.ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTime } from "@/lib/coffee-chat";
import { clientMeetingEventLines } from "@/lib/client-meeting-invite";

/** VEVENT lines for every confirmed client meeting this exec is on (per the booking's panel snapshot). */
export async function buildClientMeetingFeedEvents(execId: string): Promise<string[]> {
  const supabase = createAdminClient();
  const { data: meetings, error } = await supabase
    .from("client_meetings")
    .select("id, slot_id, contact_name, business_name, needs, panel_exec_ids, meeting_url, manage_token")
    .eq("status", "confirmed")
    .contains("panel_exec_ids", [execId]);
  if (error) throw error;
  if (!meetings || meetings.length === 0) return [];

  const { data: slots, error: slotsError } = await supabase
    .from("client_meeting_slots")
    .select("id, date, start_time, end_time")
    .in("id", meetings.map((m) => m.slot_id));
  if (slotsError) throw slotsError;
  const slotsById = new Map((slots ?? []).map((s) => [s.id, s]));

  const otherIds = [...new Set(meetings.flatMap((m) => m.panel_exec_ids).filter((id) => id !== execId))];
  const { data: profiles, error: profilesError } =
    otherIds.length > 0 ? await supabase.from("profiles").select("id, name").in("id", otherIds) : { data: [], error: null };
  if (profilesError) throw profilesError;
  const names = new Map((profiles ?? []).map((p) => [p.id, p.name]));

  return meetings.flatMap((m) => {
    const slot = slotsById.get(m.slot_id);
    if (!slot) return [];
    return clientMeetingEventLines({
      id: m.id,
      businessName: m.business_name,
      contactName: m.contact_name,
      needs: m.needs,
      date: slot.date,
      startTime: normalizeTime(slot.start_time),
      endTime: normalizeTime(slot.end_time),
      manageToken: m.manage_token,
      meetingUrl: m.meeting_url,
      panelNames: m.panel_exec_ids.filter((id) => id !== execId).map((id) => names.get(id) ?? "Unknown"),
    });
  });
}
```

In `src/lib/calendar-feed.ts`: add `import { buildClientMeetingFeedEvents } from "@/lib/client-meeting-feed";` and change `buildExecFeed` to:

```ts
export async function buildExecFeed(execId: string): Promise<string> {
  const [coffeeChats, interviewLines, clientMeetingLines] = await Promise.all([
    buildCoffeeChatEvents(execId),
    buildInterviewFeedEvents(execId),
    buildClientMeetingFeedEvents(execId),
  ]);
  return buildIcsCalendar(coffeeChats, [...interviewLines, ...clientMeetingLines]);
}
```

- [ ] **Step 7: Verify and commit**

Run: `npx tsc --noEmit && npx vitest run src/lib` — Expected: no type errors, all pass.

```bash
git add src/lib/interview-invite.ts src/lib/client-meeting-invite.ts src/lib/client-meeting-invite.test.ts src/lib/client-meeting-feed.ts src/lib/calendar-feed.ts
git commit -m "Add client meeting calendar invites and exec feed events"
```

---

### Task 4: Emails

**Files:**
- Create: `src/lib/email/client-meeting-emails.ts`, `src/lib/email/client-meeting-emails.test.ts`

**Interfaces:**
- Consumes: `escapeHtml`, `EmailContent` from `./coffee-chat-confirmation`; `formatTime12h` from `../coffee-chat`; `formatDateLong` from `../date`; invite builders from Task 3.
- Produces (each returns `EmailContent`):
  - `buildClientMeetingConfirmationEmail(i: When & { contactName; businessName; manageToken; meetingUrl: string | null; siteUrl })`
  - `buildClientMeetingLinkEmail(i: When & { contactName; meetingUrl: string; manageToken; siteUrl })`
  - `buildClientMeetingReminderEmail(i: When & { kind: "day_before" | "morning"; contactName; manageToken; meetingUrl: string | null; siteUrl })`
  - `buildClientMeetingCancelledEmail(i: When & { contactName; siteUrl; cancelledBy?: "admin" | "client" })`
  - `buildClientMeetingExecBookedEmail(i: ExecInput & { manageToken: string })`, `buildClientMeetingExecCancelledEmail(i: ExecInput)` where `ExecInput = When & { execName; contactName; businessName; email; phone: string | null; needs; meetingUrl: string | null; otherPanelNames: string[]; siteUrl }`
  - `type When = { date: string; startTime: string; endTime: string }`

- [ ] **Step 1: Write failing tests** covering: confirmation includes manage link `/services/book/manage/<token>` and ics link `/api/client-meeting/<token>/calendar.ics`; link-pending wording ("send you the video link") when `meetingUrl` null vs the URL present; reminder subject says "tomorrow"/"today"; cancelled-by-client vs admin subject differ; exec booked email contains business, contact, email, needs, "Video link: not added yet" when null, and the portal link `/portal/admin/client-meetings?tab=bookings`; HTML-escaping: a `needs` of `<script>x</script>` and a business `A&B` must appear escaped in `html` and raw in `text`.

```ts
import { describe, expect, it } from "vitest";
import {
  buildClientMeetingCancelledEmail,
  buildClientMeetingConfirmationEmail,
  buildClientMeetingExecBookedEmail,
  buildClientMeetingLinkEmail,
  buildClientMeetingReminderEmail,
} from "./client-meeting-emails";

const when = { date: "2026-10-20", startTime: "10:00", endTime: "10:30" };
const site = "https://example.org";

describe("client meeting emails", () => {
  it("confirmation links to manage and ics, and says the link is coming when absent", () => {
    const e = buildClientMeetingConfirmationEmail({ ...when, contactName: "Jo", businessName: "Acme", manageToken: "tok", meetingUrl: null, siteUrl: site });
    expect(e.html).toContain(`${site}/services/book/manage/tok`);
    expect(e.html).toContain(`${site}/api/client-meeting/tok/calendar.ics`);
    expect(e.text).toContain("send you the video link");
  });
  it("shows the link when present", () => {
    const e = buildClientMeetingConfirmationEmail({ ...when, contactName: "Jo", businessName: "Acme", manageToken: "tok", meetingUrl: "https://zoom.us/j/1", siteUrl: site });
    expect(e.text).toContain("https://zoom.us/j/1");
  });
  it("link email and reminders", () => {
    expect(buildClientMeetingLinkEmail({ ...when, contactName: "Jo", meetingUrl: "https://zoom.us/j/1", manageToken: "tok", siteUrl: site }).text).toContain("https://zoom.us/j/1");
    expect(buildClientMeetingReminderEmail({ ...when, kind: "day_before", contactName: "Jo", manageToken: "tok", meetingUrl: null, siteUrl: site }).subject).toContain("tomorrow");
    expect(buildClientMeetingReminderEmail({ ...when, kind: "morning", contactName: "Jo", manageToken: "tok", meetingUrl: null, siteUrl: site }).subject).toContain("today");
  });
  it("cancel subject differs by who cancelled", () => {
    const byClient = buildClientMeetingCancelledEmail({ ...when, contactName: "Jo", siteUrl: site, cancelledBy: "client" });
    const byAdmin = buildClientMeetingCancelledEmail({ ...when, contactName: "Jo", siteUrl: site });
    expect(byClient.subject).not.toBe(byAdmin.subject);
  });
  it("exec email escapes HTML but keeps text raw", () => {
    const e = buildClientMeetingExecBookedEmail({
      ...when, execName: "Ava", contactName: "Jo", businessName: "A&B", email: "jo@x.com", phone: null,
      needs: "<script>x</script>", meetingUrl: null, otherPanelNames: ["Ben", "Cy"], siteUrl: site, manageToken: "tok",
    });
    expect(e.html).toContain("A&amp;B");
    expect(e.html).not.toContain("<script>x</script>");
    expect(e.text).toContain("<script>x</script>");
    expect(e.text).toContain("Video link: not added yet");
    expect(e.html).toContain("/portal/admin/client-meetings?tab=bookings");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/email/client-meeting-emails.test.ts` → FAIL.

- [ ] **Step 3: Implement** `client-meeting-emails.ts` following `src/lib/email/interview-emails.ts` structure exactly (`detailsList(w, meetingUrl)` / `detailsText`, `manageUrl = ${siteUrl}/services/book/manage/${token}`, `icsUrl = ${siteUrl}/api/client-meeting/${token}/calendar.ics`, logo block on the confirmation). Differences from the interview emails:
  - Details list shows Date, Time, and `Video link:` (the URL as an `<a>` when set, otherwise "We'll email you the link before the meeting." in html / "not added yet" for exec text as asserted above). The client text for the null case must contain the phrase "send you the video link".
  - Subjects: confirmation "You're booked for an intro call with 180DC UCSC"; link "Your 180DC UCSC video link"; reminder `Reminder: your 180DC UCSC intro call is ${when}`; cancelled-by-client "You cancelled your 180DC UCSC intro call", by admin "Your 180DC UCSC intro call was cancelled"; exec booked `${businessName} booked an intro call`; exec cancelled `${businessName}'s intro call was cancelled`.
  - Manage copy: "changes close 12 hours before the meeting".
  - Cancelled email rebook URL: `${siteUrl}/services/book`.
  - Exec emails list Business, Contact (name, email, phone if present), Needs, Video link status, "Rest of the panel", and a Google Calendar link via `buildClientMeetingGoogleCalendarUrl({... audience: "exec", panelNames: otherPanelNames})`; portal link `${siteUrl}/portal/admin/client-meetings?tab=bookings`. When `meetingUrl` is null, add a line "Please add the video link in the portal." Every interpolated user value goes through `escapeHtml` in the html body.

- [ ] **Step 4: Run to verify pass** — same command → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/client-meeting-emails.ts src/lib/email/client-meeting-emails.test.ts
git commit -m "Add client meeting email builders"
```

---

### Task 5: Reminders (selection, cron route, schedule)

**Files:**
- Create: `src/lib/client-meeting-reminders.ts`, `src/lib/client-meeting-reminders.test.ts`
- Create: `src/app/api/cron/client-meeting-reminders/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `isInterviewReminderHour` from `@/lib/interview-reminders` (generic 8am-Pacific guard, reused as is); `buildClientMeetingReminderEmail` (Task 4).
- Produces: `ClientMeetingReminderBooking`, `ClientMeetingReminder`, `selectClientMeetingReminders(input: { today: string; tomorrow: string; bookings: ClientMeetingReminderBooking[] }): ClientMeetingReminder[]`.

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from "vitest";
import { selectClientMeetingReminders, type ClientMeetingReminderBooking } from "./client-meeting-reminders";

const b = (over: Partial<ClientMeetingReminderBooking>): ClientMeetingReminderBooking => ({
  id: "b1", status: "confirmed", contactName: "Jo", email: "jo@x.com", manageToken: "t", meetingUrl: null,
  date: "2026-10-21", startTime: "10:00", endTime: "10:30", reminderDayBeforeSentAt: null, reminderMorningSentAt: null, ...over,
});
const input = (bookings: ClientMeetingReminderBooking[]) => ({ today: "2026-10-20", tomorrow: "2026-10-21", bookings });

describe("selectClientMeetingReminders", () => {
  it("day-before for tomorrow, morning for today", () => {
    expect(selectClientMeetingReminders(input([b({})]))[0].kind).toBe("day_before");
    expect(selectClientMeetingReminders(input([b({ date: "2026-10-20" })]))[0].kind).toBe("morning");
  });
  it("skips already-sent, cancelled/completed, and other dates", () => {
    expect(selectClientMeetingReminders(input([b({ reminderDayBeforeSentAt: "x" })]))).toEqual([]);
    expect(selectClientMeetingReminders(input([b({ date: "2026-10-20", reminderMorningSentAt: "x" })]))).toEqual([]);
    expect(selectClientMeetingReminders(input([b({ status: "cancelled" }), b({ id: "c", status: "completed" })]))).toEqual([]);
    expect(selectClientMeetingReminders(input([b({ date: "2026-10-25" })]))).toEqual([]);
  });
  it("carries the meeting link", () => {
    expect(selectClientMeetingReminders(input([b({ meetingUrl: "https://zoom.us/j/1" })]))[0].meetingUrl).toBe("https://zoom.us/j/1");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/client-meeting-reminders.test.ts` → FAIL.

- [ ] **Step 3: Implement `client-meeting-reminders.ts`**

```ts
export interface ClientMeetingReminderBooking {
  id: string;
  status: string;
  contactName: string;
  email: string;
  manageToken: string;
  meetingUrl: string | null;
  date: string;
  startTime: string;
  endTime: string;
  reminderDayBeforeSentAt: string | null;
  reminderMorningSentAt: string | null;
}

export interface ClientMeetingReminder {
  bookingId: string;
  kind: "day_before" | "morning";
  to: string;
  contactName: string;
  manageToken: string;
  meetingUrl: string | null;
  date: string;
  startTime: string;
  endTime: string;
}

/** Confirmed meetings tomorrow without a day-before reminder, and today without a morning one. */
export function selectClientMeetingReminders(input: {
  today: string;
  tomorrow: string;
  bookings: ClientMeetingReminderBooking[];
}): ClientMeetingReminder[] {
  const reminders: ClientMeetingReminder[] = [];
  for (const b of input.bookings) {
    if (b.status !== "confirmed") continue;
    let kind: ClientMeetingReminder["kind"] | null = null;
    if (b.date === input.tomorrow && !b.reminderDayBeforeSentAt) kind = "day_before";
    else if (b.date === input.today && !b.reminderMorningSentAt) kind = "morning";
    if (!kind) continue;
    reminders.push({
      bookingId: b.id,
      kind,
      to: b.email,
      contactName: b.contactName,
      manageToken: b.manageToken,
      meetingUrl: b.meetingUrl,
      date: b.date,
      startTime: b.startTime,
      endTime: b.endTime,
    });
  }
  return reminders;
}
```

- [ ] **Step 4: Run to verify pass** → PASS.

- [ ] **Step 5: Cron route** — create `src/app/api/cron/client-meeting-reminders/route.ts` as a copy of `src/app/api/cron/interview-reminders/route.ts` with these substitutions: import `selectClientMeetingReminders`/`ClientMeetingReminderBooking` from `@/lib/client-meeting-reminders`, `isInterviewReminderHour` from `@/lib/interview-reminders`, `buildClientMeetingReminderEmail` from `@/lib/email/client-meeting-emails`; tables `client_meeting_slots` and `client_meetings`; the booking select becomes `"id, slot_id, status, contact_name, email, manage_token, meeting_url, reminder_day_before_sent_at, reminder_morning_sent_at"`; mapped fields `contactName: b.contact_name, email: b.email, meetingUrl: b.meeting_url`; the claim/release logic (`update(stamp(now)).eq("id").is(column, null)`, release on failed send) is unchanged; the email call is `buildClientMeetingReminderEmail({ kind, contactName: reminder.contactName, date, startTime, endTime, manageToken, meetingUrl: reminder.meetingUrl, siteUrl })`; log text says "client meeting reminder". Keep the `CRON_SECRET` 401 guard, `force-dynamic`, and the 8am-Pacific skip exactly.

- [ ] **Step 6: `vercel.json`** — append two entries to `crons`:

```json
    {
      "path": "/api/cron/client-meeting-reminders",
      "schedule": "0 15 * * *"
    },
    {
      "path": "/api/cron/client-meeting-reminders",
      "schedule": "0 16 * * *"
    }
```
(remember the comma after the preceding entry.)

- [ ] **Step 7: Verify and commit**

Run: `npx tsc --noEmit && npx vitest run src/lib && node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"` — Expected: all pass, no output from node.

```bash
git add src/lib/client-meeting-reminders.ts src/lib/client-meeting-reminders.test.ts src/app/api/cron/client-meeting-reminders vercel.json
git commit -m "Add client meeting reminder emails and cron"
```

---

### Task 6: Exec notifications, admin data and admin actions

**Files:**
- Create: `src/lib/email/notify-client-meeting.ts`, `src/lib/data/client-meeting.ts`, `src/actions/client-meeting.ts`

**Interfaces:**
- Consumes: Task 1 helpers, Task 4 emails.
- Produces:
  - `notifyClientMeetingExecs(bookingId: string, kind: "booked" | "cancelled"): Promise<{ sentTo: string[]; errors: string[] }>` — emails every exec in the booking's `panel_exec_ids`.
  - `emailClientMeetingCancelled(bookingId: string, cancelledBy: "admin" | "client"): Promise<void>`
  - `emailClientMeetingLink(bookingId: string): Promise<void>`
  - Data: `getClientMeetingSettings(): Promise<{ bookingOpen: boolean; slotMinutes: number; panelExecIds: string[] }>`, `getClientMeetingExecOptions(): Promise<{ id: string; name: string }[]>` (all exec-role profiles, via `EXEC_ROLES` as in `getInterviewExecOptions` — read that function in `src/lib/data/interview.ts` and mirror it), `getClientMeetingAvailability(): Promise<ClientMeetingAvailabilityRow[]>` (`{ id, execId, execName, date, startTime, endTime }`), `getClientMeetingSlots(): Promise<ClientMeetingSlotRow[]>` (`{ id, date, startTime, endTime, published, bookingStatus: "open" | "booked", bookingId: string | null, businessName: string | null }`), `getClientMeetingBookings(): Promise<ClientMeetingBookingRow[]>` (`{ id, slotId, contactName, businessName, email, phone, needs, meetingUrl, status: "confirmed" | "cancelled" | "completed", date, startTime, endTime, panelNames: string[], panelExecIds: string[], createdAt }`, newest first).
  - Actions (all `Promise<ActionResult>` where `ActionResult = { error?: string }`, all call `requireExec()`): `setClientMeetingPanelAction(execIds: string[])`, `setClientMeetingBookingOpenAction(open: boolean)`, `addClientMeetingAvailabilityAction(dates: string[], blocks: TimeBlockInput[])`, `removeClientMeetingAvailabilityAction(id: string)`, `generateClientMeetingSlotsAction()` → `{ createdCount?: number }`, `publishClientMeetingSlotAction(slotId, published)`, `publishAllClientMeetingSlotsAction()` → `{ publishedCount? }`, `deleteClientMeetingSlotAction(slotId)`, `setClientMeetingUrlAction(bookingId, raw: string)`, `cancelClientMeetingAsAdminAction(bookingId)`.

- [ ] **Step 1: `notify-client-meeting.ts`** — mirror `src/lib/email/notify-interview.ts`: a private `loadBookingContext(bookingId)` that reads the `client_meetings` row (`contact_name, business_name, email, phone, needs, panel_exec_ids, meeting_url, manage_token, slot_id`), the slot (date/start/end via `normalizeTime`), and `profiles` `(id, name, email)` for `panel_exec_ids`, using `createAdminClient()`. `notifyClientMeetingExecs` builds per-exec `ExecInput` with `otherPanelNames` and sends via `sendEmail`, best-effort (log and collect errors, never throw), `booked` → `buildClientMeetingExecBookedEmail({...base, manageToken})`, `cancelled` → `buildClientMeetingExecCancelledEmail(base)`. `emailClientMeetingCancelled` sends `buildClientMeetingCancelledEmail`; `emailClientMeetingLink` sends `buildClientMeetingLinkEmail` only if `meeting_url` is non-null. Both best effort with `console.error`.

- [ ] **Step 2: `data/client-meeting.ts`** — mirror `src/lib/data/interview.ts` (`createClient()` server client, `fetchAllPages` for whole-table reads, `lookupProfileNames`). Settings come from `org_settings` keys `client_meeting_booking_open`, `client_meeting_slot_minutes`, `client_meeting_panel` through `parseClientMeetingSettings`. Slots read `client_meeting_slots` plus confirmed `client_meetings` (`id, slot_id, business_name`) to derive `bookingStatus`. Bookings join slot date/time and resolve `panelNames` from `panel_exec_ids` via `lookupProfileNames`.

- [ ] **Step 3: `actions/client-meeting.ts`** — mirror `src/actions/interview.ts` (`"use server"`, `requireExec()`, `revalidateAdmin()` revalidating `/portal/admin/client-meetings` and `/services/book`, `logAudit` for panel/toggle/generate/admin-cancel). Specifics:

```ts
export async function setClientMeetingPanelAction(execIds: string[]): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  const ids = [...new Set(execIds)];
  if (ids.length !== PANEL_SIZE) return { error: "Pick exactly 3 execs." };
  const options = await getClientMeetingExecOptions();
  if (!ids.every((id) => options.some((o) => o.id === id))) return { error: "Panel members must be execs." };
  const supabase = await createClient();
  const { error: upsertError } = await supabase
    .from("org_settings")
    .upsert({ key: "client_meeting_panel", value: JSON.stringify(ids) }, { onConflict: "key" });
  if (upsertError) return { error: upsertError.message };
  await logAudit(profile.id, "client_meeting.panel_set", undefined, ids.join(","));
  revalidateAdmin();
  return {};
}
```

  - `addClientMeetingAvailabilityAction`: reject unless `profile.id` is in the current panel (`"Only panel members can add availability."`); otherwise identical to `addInterviewAvailabilityAction` using `expandAvailabilityEntry` and table `client_meeting_availability`.
  - `removeClientMeetingAvailabilityAction`: allowed if the block's `exec_id` is the caller's or the caller is exec (any exec may clear); deletes the block, then deletes any **open, unbooked** slot overlapping that block's date/time (same shape as `removeInterviewAvailabilityAction`, using `getClientMeetingSlots` and `overlaps`); booked slots are kept.
  - `generateClientMeetingSlotsAction`: read settings; if `panelExecIds.length !== 3` return `{ error: "Set a panel of exactly 3 execs first." }`; call `generateClientMeetingSlots(panelExecIds, availability, existingSlots, slotMinutes)`; insert with `published: false`; log audit `client_meeting.slots_generated`; return `{ createdCount }`.
  - `publishClientMeetingSlotAction` / `publishAllClientMeetingSlotsAction`: update `published`; **no** cancellation of bookings on unpublish.
  - `deleteClientMeetingSlotAction`: block with `"That slot has a confirmed booking. Cancel the booking first."` when a confirmed `client_meetings` row exists (the FK cascades and would silently delete it).
  - `setClientMeetingUrlAction(bookingId, raw)`: run `validateMeetingUrl(raw)`; on `error` return it; load the booking's `panel_exec_ids`, `status`, `meeting_url`; require `status === "confirmed"`; require caller is an exec who is on `panel_exec_ids` **or** an admin (use whichever helper `src/lib/auth/roles.ts` exposes for admin — read it; if there is no admin distinction, any exec may set it); update `meeting_url`; if the new url is non-null and differs from the old, `await emailClientMeetingLink(bookingId)`; audit `client_meeting.link_set`.
  - `cancelClientMeetingAsAdminAction`: same as `cancelInterviewBookingAsAdminAction` with `notifyClientMeetingExecs(id,"cancelled")` and `emailClientMeetingCancelled(id,"admin")`.
  - `setClientMeetingBookingOpenAction`: upsert `client_meeting_booking_open`.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint -- src/actions/client-meeting.ts src/lib/data/client-meeting.ts src/lib/email/notify-client-meeting.ts`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/notify-client-meeting.ts src/lib/data/client-meeting.ts src/actions/client-meeting.ts
git commit -m "Add client meeting admin data, actions and exec notifications"
```

---

### Task 7: Public data and booking actions

**Files:**
- Create: `src/lib/data/client-meeting-public.ts`, `src/actions/client-meeting-public.ts`

**Interfaces:**
- Consumes: Tasks 1, 4, 6 (`notifyClientMeetingExecs`, `emailClientMeetingCancelled`), `verifyTurnstileToken` from `@/lib/turnstile`, `sendEmail`.
- Produces:
  - `getPublicClientMeetingState(): Promise<{ bookingOpen: boolean; slots: PublicClientMeetingSlot[] }>` where `PublicClientMeetingSlot = { id; date; startTime; endTime }` (returns closed/empty when booking is off **or the panel is invalid**).
  - `getClientMeetingByToken(token): Promise<ManagedClientMeeting | null>` with `ManagedClientMeeting = { status: "confirmed" | "cancelled" | "completed"; contactName; businessName; email; date; startTime; endTime; meetingUrl: string | null; canSelfCancel: boolean; canReschedule: boolean }` (`canReschedule = bookingOpen && slots.length > 0`).
  - `createClientMeetingAction(input: { slotId; contactName; businessName; email; phone; needs; turnstileToken; rescheduleFromToken?: string }): Promise<{ error?: string; booking?: { manageToken; date; startTime; endTime; meetingUrl: string | null } }>`
  - `cancelClientMeetingByTokenAction(token: string, options?: { reschedule?: boolean }): Promise<{ error?: string }>`

- [ ] **Step 1: `client-meeting-public.ts`** — mirror `src/lib/data/interview-public.ts` using `createAdminClient()` and `fetchAllPages`: read the three `org_settings` keys through `parseClientMeetingSettings`; return `{ bookingOpen: false, slots: [] }` unless `bookingOpen && panelExecIds.length === 3`; read published slots `gte("date", formatOrgDate(now))`, confirmed `client_meetings` `(id, slot_id)`, filter with `isClientMeetingBookable({date, startTime, published, hasConfirmedBooking}, true, now)`. `getClientMeetingByToken` mirrors `getInterviewBookingByToken` (no invitee check); `canSelfCancel = canClientCancel(...)`.

- [ ] **Step 2: `createClientMeetingAction`** — mirror `createInterviewBookingAction` step for step, with these differences:
  1. `validateClientMeetingInput(...)` instead of name/UCSC checks; return its `error`.
  2. Turnstile check, then settings read; `bookingOpen` false → `"Booking isn't open right now. Check back soon."`; `panelExecIds.length !== 3` → `"Booking isn't available right now. Please contact us."`.
  3. No allowlist. `retirePastBookings` becomes: select confirmed `client_meetings` for the email, fetch their slots, set `status: "completed"` for those where `isClientMeetingPast(date, end_time, now)`.
  4. Existing confirmed booking for email → `"You already have an intro call booked with that email. Check your confirmation email for the link to cancel or reschedule."` (never return the token).
  5. Slot load + `isClientMeetingBookable({...}, true, new Date())`, else `"That slot was just taken or is no longer available. Please pick another."`.
  6. Insert: `slot_id, contact_name, business_name, email, phone, needs, panel_exec_ids: panelExecIds, manage_token: randomUUID(), meeting_url: carried` where `carried` is the old booking's `meeting_url` when `rescheduleFromToken` matches a booking **with the same email**, else `null`. Unique violation `23505` → `"That slot was just taken, or you already have a booking. Please refresh and try again."`.
  7. Send `buildClientMeetingConfirmationEmail` (best effort), `await notifyClientMeetingExecs(inserted.id, "booked")`, revalidate `/services/book` and `/portal/admin/client-meetings`, return `{ booking: { manageToken, date, startTime, endTime, meetingUrl } }`.

- [ ] **Step 3: `cancelClientMeetingByTokenAction`** — mirror `cancelInterviewBookingByTokenAction` with `canClientCancel`, message `"Intro calls can only be changed up to 12 hours ahead. Please contact us and we'll help."`, table `client_meetings`, and `emailClientMeetingCancelled(booking.id, "client")` unless `options.reschedule`. Only a `confirmed` booking may be cancelled (a `completed` one returns `{}` untouched).

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint -- src/actions/client-meeting-public.ts src/lib/data/client-meeting-public.ts`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/client-meeting-public.ts src/actions/client-meeting-public.ts
git commit -m "Add public client meeting booking and cancel actions"
```

---

### Task 8: Public pages and ICS route

**Files:**
- Create: `src/app/(marketing)/services/book/page.tsx`, `booking-form.tsx`, `confirmation.tsx`, `add-to-calendar.tsx`, `manage/[token]/page.tsx`, `manage/[token]/manage-view.tsx`
- Create: `src/app/api/client-meeting/[token]/calendar.ics/route.ts`

**Interfaces:**
- Consumes: Task 7 data/actions; shared UI primitives exported from `src/app/(marketing)/apply/coffee-chat/booking-form.tsx` (`BookingShell`, `FieldMessage`, `TimeChips`, `inputClass`).
- Produces: pages at the paths in Global Constraints.

Before writing, read `node_modules/next/dist/docs/` for the route handler / page `params` conventions used by `src/app/api/interview/[token]/calendar.ics/route.ts` (they match this repo's version; mirror that file).

- [ ] **Step 1: ICS route** — copy `src/app/api/interview/[token]/calendar.ics/route.ts`, swapping to `getClientMeetingByToken` and `buildClientMeetingIcs({ businessName, contactName, date, startTime, endTime, manageToken: token, meetingUrl, audience: "client" })`, filename `intro-call.ics`; 404 unless `status === "confirmed"`.

- [ ] **Step 2: `page.tsx`** — copy `src/app/(marketing)/apply/interview/page.tsx`: `export const dynamic = "force-dynamic"`, metadata title `Book an Intro Call`, call `getPublicClientMeetingState()`, render `ClientMeetingBookingForm` with heading "Book an intro call" and intro copy: "Pick a time for a 30-minute video call with our exec team. We'll learn about your organization and talk through how a student consulting team could help. It's free." Pass `turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}`.

- [ ] **Step 3: `booking-form.tsx`** — copy `src/app/(marketing)/apply/interview/interview-booking-form.tsx` and adapt:
  - Props `{ bookingOpen; slots: PublicClientMeetingSlot[]; turnstileSiteKey; intro }`.
  - Fields: contact name, business name, email, phone (optional), needs (`<textarea>` styled with `inputClass`, `maxLength={MAX_NEEDS}`, with a live character count). Use `validateClientMeetingInput` client-side for inline errors; `isValidEmail` replaces `isValidUcscEmail`.
  - Remove the location chip/`MapPin`/`INTERVIEW_LOCATION`; show "30-minute video call" instead.
  - Submit calls `createClientMeetingAction`. Keep the Turnstile handling, slot date/time pickers, error notice, and the reschedule prefill (rename the sessionStorage key to `clientMeetingReschedule`, store `{ contactName, businessName, email, phone, needs, token }`; pass `rescheduleFromToken`).
  - Closed state copy: "Booking is closed right now. Check back soon or contact us."
  - On success render `ClientMeetingConfirmation`.

- [ ] **Step 4: `confirmation.tsx` and `add-to-calendar.tsx`** — copy `interview-confirmation.tsx` / `interview-add-to-calendar.tsx`; type `ConfirmedClientMeeting = { manageToken; date; startTime; endTime; meetingUrl: string | null }`; use `buildClientMeetingGoogleCalendarUrl` with `audience: "client"` and the ics path `/api/client-meeting/${token}/calendar.ics`; manage link `/services/book/manage/${token}`; show the meeting link or "We'll email you the video link before the meeting."

- [ ] **Step 5: manage page and view** — copy `apply/interview/manage/[token]/page.tsx` and `manage-view.tsx`; use `getClientMeetingByToken`; show business, contact, date/time, meeting link or "to follow"; **Cancel** calls `cancelClientMeetingByTokenAction(token)`; **Reschedule** stores the prefill in sessionStorage, calls `cancelClientMeetingByTokenAction(token, { reschedule: true })`, then routes to `/services/book`; both only when `canSelfCancel`; when past cutoff show "Changes close 12 hours before the call. Please contact us and we'll help." For `completed`/`cancelled` show the appropriate status and a "Book a new time" link when `canReschedule`.

- [ ] **Step 6: Verify** — `npx tsc --noEmit && npm run lint`. Then run the dev server per the `run` skill and open `/services/book` with booking closed (shows closed state) — full flow is verified in Task 11.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(marketing)/services/book" src/app/api/client-meeting
git commit -m "Add public client meeting booking and manage pages"
```

---

### Task 9: Admin UI

**Files:**
- Create: `src/app/portal/(app)/admin/client-meetings/page.tsx`, `booking-toggle.tsx`, `panel-view.tsx`, `availability-view.tsx`, `slots-view.tsx`, `bookings-view.tsx`
- Modify: wherever the sidebar/admin nav lists `/portal/admin/interviews` (run `grep -rn "admin/interviews" src --include=*.tsx -l`) — add "Client meetings" next to it with the same icon pattern and access rule.

**Interfaces:**
- Consumes: Task 6 data and actions.

- [ ] **Step 1: `booking-toggle.tsx`** — copy `admin/interviews/booking-toggle.tsx`, using `setClientMeetingBookingOpenAction` and "Client booking" copy.

- [ ] **Step 2: `page.tsx`** — copy `admin/interviews/page.tsx`: metadata `Admin · Client Meetings`; load `getClientMeetingSettings`, `getClientMeetingExecOptions`, `getClientMeetingAvailability`, `getClientMeetingSlots`, `getClientMeetingBookings`, `getCurrentProfile`, `calendarFeedPath(profile.id)`; tabs `panel` (default), `availability`, `slots`, `bookings` selected by `?tab=`; header line "N open slots." (published and open). Show a warning banner on every tab when `panelExecIds.length !== 3`: "Pick a panel of exactly 3 execs before generating slots or opening booking."

- [ ] **Step 3: `panel-view.tsx`** — card with 3 `<select>` (or the repo's existing select component; check `src/components/ui`) populated from exec options, preselected from `panelExecIds`, "Save panel" calls `setClientMeetingPanelAction`; reject duplicates client-side; helper text: "Changing the panel doesn't affect meetings already booked."

- [ ] **Step 4: `availability-view.tsx`** — copy `admin/interviews/availability-view.tsx` with `addClientMeetingAvailabilityAction` / `removeClientMeetingAvailabilityAction` and `ClientMeetingAvailabilityRow`; only render the add form when `currentExecId` is in the panel (otherwise: "Only the 3 panel members add availability."); list all panel members' blocks, removing allowed for any exec.

- [ ] **Step 5: `slots-view.tsx`** — simplified adaptation of `admin/interviews/schedule-view.tsx` (slots part only; no exec swap/add/remove): table of slots (date, time, status open/booked with business name, published badge) with per-row Publish/Unpublish and Delete (disabled when booked), top buttons "Generate slots" (`generateClientMeetingSlotsAction`, toast with `createdCount`) and "Publish all" (`publishAllClientMeetingSlotsAction`), and the calendar-feed subscription URL block from the interviews schedule view.

- [ ] **Step 6: `bookings-view.tsx`** — table of bookings (business, contact name/email/phone, needs in an expandable/`title` cell, date/time, panel names, status). For `confirmed` rows: an inline meeting-link `Input` + Save (`setClientMeetingUrlAction`, toast the returned error), highlight rows with no link (amber "Link needed" badge), and a Cancel button (`cancelClientMeetingAsAdminAction`, with the same confirm pattern the interviews schedule view uses). Sort: confirmed-upcoming first.

- [ ] **Step 7: Nav entry** — add the link.

- [ ] **Step 8: Verify** — `npx tsc --noEmit && npm run lint`; start the dev server and confirm all four tabs render for an exec account with and without a panel set.

- [ ] **Step 9: Commit**

```bash
git add "src/app/portal/(app)/admin/client-meetings" src
git commit -m "Add client meetings admin page"
```

---

### Task 10: Notification bell and services link

**Files:**
- Modify: `src/lib/data/notifications.ts`
- Modify: `src/app/(marketing)/services/page.tsx`

- [ ] **Step 1: Bell** — in `notifications.ts`, add to the `Promise.all` a third fetch for execs:

```ts
isExecUser
  ? supabase
      .from("client_meetings")
      .select("id, business_name, status, meeting_url, created_at, cancelled_at")
      .contains("panel_exec_ids", [userId])
      .order("created_at", { ascending: false })
      .limit(15)
  : Promise.resolve({ data: null }),
```

(destructure as `{ data: clientMeetings }`) and after the interview loop add:

```ts
for (const b of (clientMeetings ?? []) as { id: string; business_name: string; status: string; meeting_url: string | null; created_at: string; cancelled_at: string | null }[]) {
  if (b.status === "confirmed") {
    items.push({
      id: `client-meeting-booked-${b.id}`,
      message: `${b.business_name} booked an intro call with you${b.meeting_url ? "." : ". Add the video link."}`,
      href: "/portal/admin/client-meetings?tab=bookings",
      occurredAt: b.created_at,
    });
  } else if (b.status === "cancelled" && b.cancelled_at) {
    items.push({
      id: `client-meeting-cancelled-${b.id}`,
      message: `${b.business_name}'s intro call with you was cancelled.`,
      href: "/portal/admin/client-meetings?tab=bookings",
      occurredAt: b.cancelled_at,
    });
  }
}
```

- [ ] **Step 2: Services link** — in `services/page.tsx`, next to the existing "Become a Client" button (both places it appears at lines ~54 and ~129), add a secondary outline button "Book an intro call" linking to `/services/book` (use `render={<Link href="/services/book" />}` with `nativeButton={false}`, importing `Link` from `next/link` if not already imported; match the existing Button props).

- [ ] **Step 3: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: all pass.

```bash
git add src/lib/data/notifications.ts "src/app/(marketing)/services/page.tsx"
git commit -m "Add client meeting bell entries and services page link"
```

---

### Task 11: End-to-end verification

**Files:** none (fix anything found in the relevant earlier task's files).

- [ ] **Step 1: Full suite** — `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`. Expected: all green.

- [ ] **Step 2: Manual flow** (use the `run` skill to start the app, Playwright/Chrome tools for the browser). With 3 exec test accounts:
  1. Admin opens `/portal/admin/client-meetings`, picks the 3-exec panel; confirm the warning banner disappears.
  2. Each panel exec adds overlapping availability on a day at least 2 days out; a 4th exec cannot add (message shown).
  3. Generate slots; confirm slots appear **unpublished** and only in the 3-way overlap on the :00/:30 grid; publish all; open booking.
  4. In a logged-out window, `/services/book` lists the slots; book one with intake fields. Confirm: confirmation screen, client confirmation email, 3 exec emails (showing "Video link: not added yet"), bell entries with "Add the video link."
  5. Book again with the same email → friendly "already have an intro call" error; book the same slot as a second client in another window → friendly taken error.
  6. As a panel exec set the meeting URL (try `http://x` → rejected; `https://meet.google.com/abc` → saved); client receives the link email; manage page shows the link.
  7. Change the panel in admin; confirm the existing booking still lists its original 3 execs and the feed still shows it for them.
  8. Exec calendar feed (`calendarFeedPath`) contains the event with `UID:<id>-client-meeting-exec`; cancel the booking from the manage page → event disappears from the feed, client receipt + exec cancelled emails sent.
  9. Reschedule from the manage page → form prefilled, new booking keeps the meeting link.
  10. Pause booking → `/services/book` shows closed state and a direct action call is rejected.
  11. Call `GET /api/cron/client-meeting-reminders` with `Authorization: Bearer $CRON_SECRET` at the right hour (or temporarily stub the hour guard locally) for a booking tomorrow; confirm one reminder and that a second call sends none. Revert any stub.
  12. Cancel booking within 12h of start is rejected on the manage page (adjust test slot time or system date).
- [ ] **Step 3: Record results** — note any step skipped and why in the final message; do not claim a step passed that was not run.

- [ ] **Step 4: Final commit** if fixes were made, then push the branch and open a PR (no Claude attribution lines in commits or the PR body).
