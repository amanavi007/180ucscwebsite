# Recruitment Points — Bulk Import and Booking Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let execs give points to a whole attendee list at once (Zoom CSV or typed names) through a grouped review step, and mark coffee chat / interview attendance from existing bookings so points and applicants are created automatically.

**Architecture:** Pure, unit-tested parsing/classification/mapping logic in `src/lib/recruit-import.ts` and `src/lib/recruit-attendance.ts`. Two transactional SQL functions (`commit_recruit_import`, `undo_recruit_import`) and two for bookings (`mark_recruit_booking`, `clear_recruit_booking_mark`) keep the ledger consistent. Server Actions orchestrate; a multi-step import dialog and an Attendance tab sit on the existing Applicants page.

**Tech Stack:** Next.js (breaking-changes build), Supabase Postgres + RLS, TypeScript, Vitest, base-ui shadcn components, sonner.

**Spec:** `docs/superpowers/specs/2026-10-07-recruitment-points-bulk-and-linking-design.md` (builds on `2026-10-07-recruitment-points-foundation-design.md`, already merged)

## Global Constraints

- `AGENTS.md`: this Next.js version has breaking changes; copy patterns from `src/actions/recruit.ts` and `src/app/portal/(app)/admin/applicants/*` rather than relying on memory.
- All new tables exec-only RLS via `public.is_exec()`; no anon policy. Migration filename: `supabase/migrations/20261008000001_recruitment_import_and_links.sql`.
- Server Actions return `{ error?: string }` instead of throwing; start with `requireExec()`; call `revalidatePath("/portal/admin/applicants")`.
- The ledger stays append-only: changes void rows, they never delete them. Import and booking points use `source` `'import'` / `'booking'`.
- Interview attendance gives **no points**; coffee chat: attended +1, no-show −1 (default reason "No-show, no notice"), excused 0. Cancelling via the booking link is excused and creates no points row.
- Zoom minimum-time default is 10 minutes, editable per import; 0 disables it.
- Never apply the migration to a hosted Supabase without asking the user.
- React lint rule `react-hooks/set-state-in-effect` is enforced: reset state with `key`-remounted components or derived values, not `setState` in effects.
- Commit messages: plain, **no `Co-Authored-By` / Claude attribution lines** (saved user preference).
- Before the final commit run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## Review Focus

1. **Zoom export quirks** — UTF-8 BOM, CRLF, metadata lines above the header, quoted names containing commas (`"Kim, Jessica"`), blank lines, rejoins as multiple rows, names like `Jessica Kim (she/her)` / `iPhone` (Task 2/3 tests).
2. **Re-importing the same or a second list** — someone who already has live points for the event is skipped, never double-awarded; two list names matching the same applicant never both award (Task 3 tests, Task 1 SQL).
3. **Undo import** — voids exactly the batch's points and archives only applicants that batch created and nobody has touched since (Task 1 SQL, Task 5 action, Task 6 UI).
4. **Marking the same booking twice or changing a mark** — one link per booking; re-marking voids the old points row and writes one new row; no-show requires the −1 to be explicit and reasoned (Task 1 SQL, Task 4 tests).
5. **Booking with no clean applicant match** — email match wins; a name-only fuzzy match asks the exec instead of guessing; an unmatched booking creates an applicant (Task 5, Task 7).

---

### Task 1: Migration — import, ignore list, booking links, system categories

**Files:**
- Create: `supabase/migrations/20261008000001_recruitment_import_and_links.sql`
- Modify: `src/lib/supabase/database.types.ts`
- Modify: `src/lib/data/recruit.ts` (add `systemKey` to `RecruitCategory`)
- Modify: `src/app/portal/(app)/admin/applicants/setup-view.tsx` (hide Archive for system categories)

**Interfaces:**
- Produces: tables `recruit_ignored_names`, `recruit_booking_links`; columns `recruit_categories.system_key`, `recruit_applicants.created_by_batch_id`; functions `commit_recruit_import(p_quarter uuid, p_event uuid, p_category uuid, p_points numeric, p_rows jsonb) → jsonb`, `undo_recruit_import(p_batch uuid) → integer`, `mark_recruit_booking(p_kind text, p_booking uuid, p_applicant uuid, p_status text, p_category uuid, p_points numeric, p_reason text) → uuid`, `clear_recruit_booking_mark(p_kind text, p_booking uuid) → void`; `RecruitCategory.systemKey: string | null`.
- `commit_recruit_import` rows (JSON array of): `{ "kind": "existing", "applicantId": "<uuid>", "alias": "<normalized name or null>" }`, `{ "kind": "new", "name": "<text>", "email": "<text or null>" }`, `{ "kind": "ignore", "alias": "<normalized name>" }`. Returns `{ "batchId": "<uuid>", "created": n, "awarded": n, "skipped": n }`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20261008000001_recruitment_import_and_links.sql`:

```sql
-- Recruitment points piece 2: bulk import, ignore list, booking attendance links.
-- See docs/superpowers/specs/2026-10-07-recruitment-points-bulk-and-linking-design.md.

alter table public.recruit_applicants
  add column if not exists created_by_batch_id uuid;

-- System categories: the app finds these by key, so renaming is fine but archiving is not.
alter table public.recruit_categories
  add column if not exists system_key text;
create unique index if not exists recruit_categories_system_key_idx
  on public.recruit_categories (system_key) where system_key is not null;

update public.recruit_categories set system_key = 'info_session'
  where system_key is null and lower(btrim(name)) = 'info session'
  and not exists (select 1 from public.recruit_categories where system_key = 'info_session');
update public.recruit_categories set system_key = 'coffee_chat_attended'
  where system_key is null and lower(btrim(name)) = 'coffee chat attended'
  and not exists (select 1 from public.recruit_categories where system_key = 'coffee_chat_attended');
update public.recruit_categories set system_key = 'coffee_chat_no_show'
  where system_key is null and lower(btrim(name)) = 'coffee chat no-show'
  and not exists (select 1 from public.recruit_categories where system_key = 'coffee_chat_no_show');
update public.recruit_categories set system_key = 'coffee_chat_excused'
  where system_key is null and lower(btrim(name)) = 'coffee chat excused'
  and not exists (select 1 from public.recruit_categories where system_key = 'coffee_chat_excused');

-- If a seeded category was renamed or removed before this migration, recreate the missing key.
insert into public.recruit_categories (name, section, default_points, sort_order, system_key)
select v.name, 'engagement', v.points, v.sort_order, v.key
from (values
  ('Info Session', 1, 10, 'info_session'),
  ('Coffee Chat Attended', 1, 20, 'coffee_chat_attended'),
  ('Coffee Chat No-show', -1, 30, 'coffee_chat_no_show'),
  ('Coffee Chat Excused', 0, 40, 'coffee_chat_excused')
) as v(name, points, sort_order, key)
where not exists (select 1 from public.recruit_categories c where c.system_key = v.key)
  and not exists (select 1 from public.recruit_categories c where lower(btrim(c.name)) = lower(v.name));

create or replace function public.recruit_categories_protect_system()
returns trigger language plpgsql as $$
begin
  if new.system_key is not null and new.archived_at is not null then
    raise exception 'This category is used automatically and cannot be archived.';
  end if;
  return new;
end;
$$;

drop trigger if exists recruit_categories_protect_system on public.recruit_categories;
create trigger recruit_categories_protect_system
  before update on public.recruit_categories
  for each row execute procedure public.recruit_categories_protect_system();

create table public.recruit_ignored_names (
  id uuid primary key default gen_random_uuid(),
  quarter_id uuid not null references public.quarters (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  created_at timestamptz not null default now(),
  constraint recruit_ignored_names_unique unique (quarter_id, name)
);

alter table public.recruit_ignored_names enable row level security;
create policy recruit_ignored_names_all on public.recruit_ignored_names
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create table public.recruit_booking_links (
  id uuid primary key default gen_random_uuid(),
  booking_kind text not null check (booking_kind in ('coffee_chat', 'interview')),
  booking_id uuid not null,
  applicant_id uuid not null references public.recruit_applicants (id) on delete cascade,
  status text not null check (status in ('attended', 'no_show', 'excused')),
  points_id uuid references public.recruit_points (id) on delete set null,
  marked_by uuid references public.profiles (id) on delete set null,
  marked_at timestamptz not null default now(),
  constraint recruit_booking_links_unique unique (booking_kind, booking_id)
);
create index recruit_booking_links_applicant_idx on public.recruit_booking_links (applicant_id);

alter table public.recruit_booking_links enable row level security;
create policy recruit_booking_links_all on public.recruit_booking_links
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

-- Commit a reviewed attendee list in one transaction.
create or replace function public.commit_recruit_import(
  p_quarter uuid,
  p_event uuid,
  p_category uuid,
  p_points numeric,
  p_rows jsonb
)
returns jsonb
language plpgsql
as $$
declare
  batch uuid := gen_random_uuid();
  r jsonb;
  applicant uuid;
  clean_email text;
  created_n int := 0;
  awarded_n int := 0;
  skipped_n int := 0;
begin
  if not public.is_exec() then
    raise exception 'Only exec can import points.';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    if r ->> 'kind' = 'ignore' then
      if nullif(btrim(r ->> 'alias'), '') is not null then
        insert into public.recruit_ignored_names (quarter_id, name)
        values (p_quarter, btrim(r ->> 'alias'))
        on conflict (quarter_id, name) do nothing;
      end if;
      continue;
    end if;

    applicant := null;
    if r ->> 'kind' = 'new' then
      clean_email := nullif(lower(btrim(coalesce(r ->> 'email', ''))), '');
      if clean_email is not null then
        select id into applicant from public.recruit_applicants
          where quarter_id = p_quarter and email = clean_email and archived_at is null;
      end if;
      if applicant is null then
        insert into public.recruit_applicants (quarter_id, name, email, created_by_batch_id)
        values (p_quarter, btrim(r ->> 'name'), clean_email, batch)
        returning id into applicant;
        created_n := created_n + 1;
      end if;
    else
      applicant := (r ->> 'applicantId')::uuid;
      if not exists (
        select 1 from public.recruit_applicants
        where id = applicant and quarter_id = p_quarter and archived_at is null
      ) then
        skipped_n := skipped_n + 1;
        continue;
      end if;
    end if;

    if nullif(btrim(coalesce(r ->> 'alias', '')), '') is not null then
      insert into public.recruit_applicant_aliases (applicant_id, quarter_id, alias)
      values (applicant, p_quarter, btrim(r ->> 'alias'))
      on conflict (quarter_id, alias) do nothing;
    end if;

    if p_event is not null and exists (
      select 1 from public.recruit_points
      where applicant_id = applicant and event_id = p_event and voided_at is null
    ) then
      skipped_n := skipped_n + 1;
      continue;
    end if;

    insert into public.recruit_points (applicant_id, category_id, event_id, points, source, batch_id, awarded_by)
    values (applicant, p_category, p_event, p_points, 'import', batch, auth.uid());
    awarded_n := awarded_n + 1;
  end loop;

  return jsonb_build_object('batchId', batch, 'created', created_n, 'awarded', awarded_n, 'skipped', skipped_n);
end;
$$;

-- Undo an import: void its points and archive applicants it created that nobody has touched.
create or replace function public.undo_recruit_import(p_batch uuid)
returns integer
language plpgsql
as $$
declare
  voided_n integer;
begin
  if not public.is_exec() then
    raise exception 'Only exec can undo an import.';
  end if;

  update public.recruit_points
    set voided_at = now(), voided_by = auth.uid(), void_reason = 'Import undone'
    where batch_id = p_batch and voided_at is null;
  get diagnostics voided_n = row_count;

  update public.recruit_applicants a
    set archived_at = now()
    where a.created_by_batch_id = p_batch
      and a.archived_at is null
      and a.notes = ''
      and a.major is null
      and a.year is null
      and not exists (
        select 1 from public.recruit_points p where p.applicant_id = a.id and p.voided_at is null
      );

  return voided_n;
end;
$$;

-- Mark (or re-mark) a booking's attendance. Coffee chats pass a category + points; interviews pass nulls.
create or replace function public.mark_recruit_booking(
  p_kind text,
  p_booking uuid,
  p_applicant uuid,
  p_status text,
  p_category uuid,
  p_points numeric,
  p_reason text
)
returns uuid
language plpgsql
as $$
declare
  existing public.recruit_booking_links;
  new_points uuid;
  link_id uuid;
begin
  if not public.is_exec() then
    raise exception 'Only exec can mark attendance.';
  end if;
  if p_kind not in ('coffee_chat', 'interview') then
    raise exception 'Unknown booking type.';
  end if;
  if p_status not in ('attended', 'no_show', 'excused') then
    raise exception 'Unknown attendance status.';
  end if;

  select * into existing from public.recruit_booking_links
    where booking_kind = p_kind and booking_id = p_booking for update;

  if existing.id is not null and existing.points_id is not null then
    update public.recruit_points
      set voided_at = now(), voided_by = auth.uid(), void_reason = 'Attendance changed'
      where id = existing.points_id and voided_at is null;
  end if;

  if p_category is not null then
    insert into public.recruit_points (applicant_id, category_id, points, reason, source, awarded_by)
    values (p_applicant, p_category, p_points, p_reason, 'booking', auth.uid())
    returning id into new_points;
  end if;

  if existing.id is null then
    insert into public.recruit_booking_links (booking_kind, booking_id, applicant_id, status, points_id, marked_by)
    values (p_kind, p_booking, p_applicant, p_status, new_points, auth.uid())
    returning id into link_id;
  else
    update public.recruit_booking_links
      set applicant_id = p_applicant, status = p_status, points_id = new_points,
          marked_by = auth.uid(), marked_at = now()
      where id = existing.id;
    link_id := existing.id;
  end if;

  return link_id;
end;
$$;

create or replace function public.clear_recruit_booking_mark(p_kind text, p_booking uuid)
returns void
language plpgsql
as $$
declare
  existing public.recruit_booking_links;
begin
  if not public.is_exec() then
    raise exception 'Only exec can clear attendance.';
  end if;

  select * into existing from public.recruit_booking_links
    where booking_kind = p_kind and booking_id = p_booking for update;
  if existing.id is null then
    return;
  end if;

  if existing.points_id is not null then
    update public.recruit_points
      set voided_at = now(), voided_by = auth.uid(), void_reason = 'Attendance mark cleared'
      where id = existing.points_id and voided_at is null;
  end if;
  delete from public.recruit_booking_links where id = existing.id;
end;
$$;
```

- [ ] **Step 2: Add the types**

In `src/lib/supabase/database.types.ts`:
- In `recruit_applicants` `Row`/`Insert` add `created_by_batch_id: string | null` / `created_by_batch_id?: string | null`.
- In `recruit_categories` `Row`/`Insert` add `system_key: string | null` / `system_key?: string | null`.
- Add these tables next to the other `recruit_*` tables:

```ts
      recruit_ignored_names: {
        Row: { id: string; quarter_id: string; name: string; created_at: string };
        Insert: { id?: string; quarter_id: string; name: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["recruit_ignored_names"]["Insert"]>;
        Relationships: [];
      };
      recruit_booking_links: {
        Row: {
          id: string;
          booking_kind: "coffee_chat" | "interview";
          booking_id: string;
          applicant_id: string;
          status: "attended" | "no_show" | "excused";
          points_id: string | null;
          marked_by: string | null;
          marked_at: string;
        };
        Insert: {
          id?: string;
          booking_kind: "coffee_chat" | "interview";
          booking_id: string;
          applicant_id: string;
          status: "attended" | "no_show" | "excused";
          points_id?: string | null;
          marked_by?: string | null;
          marked_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["recruit_booking_links"]["Insert"]>;
        Relationships: [];
      };
```

- Add inside `Functions`:

```ts
      commit_recruit_import: {
        Args: { p_quarter: string; p_event: string | null; p_category: string; p_points: number; p_rows: unknown };
        Returns: unknown;
      };
      undo_recruit_import: {
        Args: { p_batch: string };
        Returns: number;
      };
      mark_recruit_booking: {
        Args: {
          p_kind: string;
          p_booking: string;
          p_applicant: string;
          p_status: string;
          p_category: string | null;
          p_points: number | null;
          p_reason: string | null;
        };
        Returns: string;
      };
      clear_recruit_booking_mark: {
        Args: { p_kind: string; p_booking: string };
        Returns: unknown;
      };
```

- [ ] **Step 3: Expose `systemKey` and protect system categories in the UI**

In `src/lib/data/recruit.ts`: add `systemKey: string | null;` to `RecruitCategory` and `systemKey: c.system_key,` to the mapping in `getRecruitCategories`.

In `setup-view.tsx`, wrap the Archive `<Button>` for active categories so it renders only when `!c.systemKey`, and when `c.systemKey` render a small `<Badge variant="outline">Used automatically</Badge>` before the edit button.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261008000001_recruitment_import_and_links.sql src/lib/supabase/database.types.ts src/lib/data/recruit.ts "src/app/portal/(app)/admin/applicants/setup-view.tsx"
git commit -m "Add recruitment import, ignore list and booking link schema"
```

---

### Task 2: Attendee list parsing (pure logic, TDD)

**Files:**
- Create: `src/lib/recruit-import.ts`
- Test: `src/lib/recruit-import.test.ts`

**Interfaces:**
- Produces (exported from `src/lib/recruit-import.ts`):
  - `interface ParsedAttendee { rawName: string; email: string | null; minutes: number | null }`
  - `parseCsvLine(line: string): string[]`
  - `parseAttendeeInput(text: string): ParsedAttendee[]`
  - `cleanDisplayName(raw: string): string`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/recruit-import.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cleanDisplayName, parseAttendeeInput, parseCsvLine } from "./recruit-import";

describe("parseCsvLine", () => {
  it("splits simple fields", () => {
    expect(parseCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });
  it("keeps commas inside quotes and unescapes doubled quotes", () => {
    expect(parseCsvLine('"Kim, Jessica","say ""hi""",x')).toEqual(["Kim, Jessica", 'say "hi"', "x"]);
  });
  it("trims whitespace around fields", () => {
    expect(parseCsvLine(" a , b ")).toEqual(["a", "b"]);
  });
});

describe("parseAttendeeInput — plain lists", () => {
  it("parses one name per line and ignores blanks", () => {
    expect(parseAttendeeInput("Jessica Kim\n\n  Daniel Ortiz  \n")).toEqual([
      { rawName: "Jessica Kim", email: null, minutes: null },
      { rawName: "Daniel Ortiz", email: null, minutes: null },
    ]);
  });
  it("parses 'name, email' lines", () => {
    expect(parseAttendeeInput("Jessica Kim, JKim@ucsc.edu")).toEqual([
      { rawName: "Jessica Kim", email: "jkim@ucsc.edu", minutes: null },
    ]);
  });
  it("treats 'Last, First' as a name, not name+email", () => {
    expect(parseAttendeeInput("Kim, Jessica")).toEqual([{ rawName: "Kim, Jessica", email: null, minutes: null }]);
  });
  it("accepts a bare email", () => {
    expect(parseAttendeeInput("jess.kim@ucsc.edu")).toEqual([
      { rawName: "jess kim", email: "jess.kim@ucsc.edu", minutes: null },
    ]);
  });
  it("accepts tab-separated name and email (spreadsheet paste)", () => {
    expect(parseAttendeeInput("Jessica Kim\tjkim@ucsc.edu")).toEqual([
      { rawName: "Jessica Kim", email: "jkim@ucsc.edu", minutes: null },
    ]);
  });
  it("returns [] for empty input", () => {
    expect(parseAttendeeInput("  \n \r\n")).toEqual([]);
  });
  it("merges repeated names", () => {
    expect(parseAttendeeInput("Jessica Kim\njessica kim")).toHaveLength(1);
  });
});

const ZOOM = [
  "﻿Topic,ID,Host,Duration (minutes),Start time,End time,Participants",
  "Info Session,123456789,Exec,62,10/14/2026 7:00,10/14/2026 8:02,40",
  "",
  'Name (original name),User Email,Join time,Leave time,Duration (minutes),Guest,In Waiting Room',
  '"Kim, Jessica",jkim@ucsc.edu,10/14/2026 7:01,10/14/2026 7:30,29,No,No',
  "Jessica Kim (she/her),jkim@ucsc.edu,10/14/2026 7:35,10/14/2026 8:02,27,No,No",
  "iPhone,,10/14/2026 7:05,10/14/2026 7:08,3,Yes,No",
  "Daniel Ortiz,dortiz@ucsc.edu,10/14/2026 7:00,10/14/2026 8:02,62,No,No",
].join("\r\n");

describe("parseAttendeeInput — Zoom reports", () => {
  const rows = parseAttendeeInput(ZOOM);

  it("skips metadata lines above the header and strips the BOM", () => {
    expect(rows.map((r) => r.rawName)).not.toContain("Info Session");
    expect(rows.length).toBe(3);
  });
  it("sums minutes for the same person across rejoins (matched by email)", () => {
    const jessica = rows.find((r) => r.email === "jkim@ucsc.edu");
    expect(jessica?.minutes).toBe(56);
  });
  it("keeps attendees without an email", () => {
    expect(rows.find((r) => r.rawName === "iPhone")).toMatchObject({ email: null, minutes: 3 });
  });
  it("reads a registration-style First/Last Name header", () => {
    const csv = "First Name,Last Name,Email\nJessica,Kim,jkim@ucsc.edu\nDaniel,Ortiz,";
    expect(parseAttendeeInput(csv)).toEqual([
      { rawName: "Jessica Kim", email: "jkim@ucsc.edu", minutes: null },
      { rawName: "Daniel Ortiz", email: null, minutes: null },
    ]);
  });
});

describe("cleanDisplayName", () => {
  it("removes pronouns and device suffixes and flips Last, First", () => {
    expect(cleanDisplayName("Kim, Jessica (she/her)")).toBe("Jessica Kim");
    expect(cleanDisplayName("Jessica Kim - iPhone")).toBe("Jessica Kim");
  });
  it("title-cases all-lowercase or all-uppercase names only", () => {
    expect(cleanDisplayName("jessica kim")).toBe("Jessica Kim");
    expect(cleanDisplayName("JESSICA KIM")).toBe("Jessica Kim");
    expect(cleanDisplayName("Jessica McKim")).toBe("Jessica McKim");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/recruit-import.test.ts`
Expected: FAIL — cannot resolve `./recruit-import`.

- [ ] **Step 3: Implement**

Create `src/lib/recruit-import.ts`:

```ts
import { normalizeName } from "./recruit-matching";

export interface ParsedAttendee {
  rawName: string;
  email: string | null;
  minutes: number | null;
}

const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

/** Splits one CSV line, honouring double quotes and "" escapes. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

interface Header {
  index: number;
  name: number;
  first: number;
  last: number;
  email: number;
  minutes: number;
}

function findHeader(rows: string[][]): Header | null {
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map((c) => c.toLowerCase());
    const first = cells.findIndex((c) => c === "first name");
    const last = cells.findIndex((c) => c === "last name");
    const name = cells.findIndex((c) => c.startsWith("name"));
    const email = cells.findIndex((c) => c.includes("email"));
    const minutes = cells.findIndex((c) => c.includes("duration"));
    const join = cells.findIndex((c) => c.includes("join time"));
    const hasName = name >= 0 || (first >= 0 && last >= 0);
    if (hasName && (email >= 0 || minutes >= 0 || join >= 0)) {
      return { index: i, name, first, last, email, minutes };
    }
  }
  return null;
}

function mergeAttendees(rows: ParsedAttendee[]): ParsedAttendee[] {
  const byKey = new Map<string, ParsedAttendee>();
  for (const row of rows) {
    const key = row.email ?? (normalizeName(row.rawName) || row.rawName.toLowerCase());
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...row });
      continue;
    }
    if (row.minutes !== null) existing.minutes = (existing.minutes ?? 0) + row.minutes;
    if (!existing.email && row.email) existing.email = row.email;
  }
  return [...byKey.values()];
}

/** Zoom participant/registration CSVs or a plain list of names (optionally "name, email"). */
export function parseAttendeeInput(text: string): ParsedAttendee[] {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\t/g, ",").trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const rows = lines.map(parseCsvLine);
  const header = findHeader(rows);
  const parsed: ParsedAttendee[] = [];

  if (header) {
    for (const cells of rows.slice(header.index + 1)) {
      const name =
        header.first >= 0 && header.last >= 0
          ? `${cells[header.first] ?? ""} ${cells[header.last] ?? ""}`.trim()
          : (cells[header.name] ?? "");
      if (!name) continue;
      const emailCell = header.email >= 0 ? (cells[header.email] ?? "").toLowerCase() : "";
      const mins = header.minutes >= 0 ? Number(cells[header.minutes]) : Number.NaN;
      parsed.push({
        rawName: name,
        email: EMAIL_RE.test(emailCell) ? emailCell : null,
        minutes: Number.isFinite(mins) ? mins : null,
      });
    }
  } else {
    for (let i = 0; i < lines.length; i++) {
      const cells = rows[i];
      if (cells.length === 1 && EMAIL_RE.test(cells[0])) {
        const email = cells[0].toLowerCase();
        parsed.push({ rawName: email.split("@")[0].replace(/[._]+/g, " "), email, minutes: null });
      } else if (cells.length === 2 && EMAIL_RE.test(cells[1])) {
        parsed.push({ rawName: cells[0], email: cells[1].toLowerCase(), minutes: null });
      } else {
        parsed.push({ rawName: cells.join(", "), email: null, minutes: null });
      }
    }
  }

  return mergeAttendees(parsed);
}

/** A tidy display name for a brand-new applicant created from a list entry. */
export function cleanDisplayName(raw: string): string {
  let s = raw.replace(/\([^)]*\)/g, " ").replace(/\s+-\s+.*$/, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (/^[^,]+,[^,]+$/.test(s)) {
    const [last, first] = s.split(",");
    s = `${first.trim()} ${last.trim()}`;
  }
  s = s.replace(/\s+/g, " ").trim();
  if (s === s.toLowerCase() || s === s.toUpperCase()) {
    s = s.toLowerCase().replace(/(^|\s)([a-z])/g, (_, space: string, ch: string) => `${space}${ch.toUpperCase()}`);
  }
  return s;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/recruit-import.test.ts`
Expected: all PASS. If "sums minutes for the same person" fails, check that the two Jessica rows merge on email (the first row's name `"Kim, Jessica"` is kept as `rawName`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/recruit-import.ts src/lib/recruit-import.test.ts
git commit -m "Add attendee list parsing for Zoom reports and plain lists"
```

---

### Task 3: Import review and commit-row building (pure logic, TDD)

**Files:**
- Modify: `src/lib/recruit-import.ts` (append)
- Modify: `src/lib/recruit-import.test.ts` (append)

**Interfaces:**
- Consumes: `findMatches`, `normalizeName`, `MatchCandidate`, `MatchableApplicant` from `./recruit-matching`; `ParsedAttendee`, `cleanDisplayName` (Task 2).
- Produces (exported from `src/lib/recruit-import.ts`):
  - `type ImportGroup = "matched" | "needs-look" | "new" | "ignored" | "already"`
  - `interface ReviewContext { applicants: MatchableApplicant[]; ignoredNames: Set<string>; memberNames: Set<string>; awardedApplicantIds: Set<string>; minMinutes: number }` (`ignoredNames`/`memberNames` hold *normalized* names)
  - `interface ReviewRow { key: string; attendee: ParsedAttendee; group: ImportGroup; reason: string; candidates: MatchCandidate[]; applicantId: string | null }`
  - `reviewImport(attendees: ParsedAttendee[], ctx: ReviewContext): ReviewRow[]`
  - `type ImportAction = { action: "award"; applicantId: string } | { action: "new" } | { action: "skip" } | { action: "ignore" }`
  - `defaultActions(rows: ReviewRow[]): Record<string, ImportAction>`
  - `type CommitRow = { kind: "existing"; applicantId: string; alias: string | null } | { kind: "new"; name: string; email: string | null } | { kind: "ignore"; alias: string }`
  - `buildCommitRows(rows: ReviewRow[], actions: Record<string, ImportAction>, applicants: MatchableApplicant[]): CommitRow[]`
  - `summarizeActions(rows: ReviewRow[], actions: Record<string, ImportAction>): { award: number; create: number; skip: number; unresolved: number }`

- [ ] **Step 1: Append the failing tests**

Add to `src/lib/recruit-import.test.ts` (extend the import list with the new names):

```ts
import {
  buildCommitRows,
  defaultActions,
  reviewImport,
  summarizeActions,
  type ParsedAttendee,
  type ReviewContext,
} from "./recruit-import";
import type { MatchableApplicant } from "./recruit-matching";

const applicants: MatchableApplicant[] = [
  { id: "a1", name: "Jessica Kim", email: "jkim@ucsc.edu", aliases: [] },
  { id: "a2", name: "Daniel Ortiz", email: null, aliases: ["danny ortiz"] },
  { id: "a3", name: "Aisha Rahman", email: null, aliases: [] },
];

const ctx = (over: Partial<ReviewContext> = {}): ReviewContext => ({
  applicants,
  ignoredNames: new Set(),
  memberNames: new Set(),
  awardedApplicantIds: new Set(),
  minMinutes: 10,
  ...over,
});

const att = (rawName: string, over: Partial<ParsedAttendee> = {}): ParsedAttendee => ({
  rawName,
  email: null,
  minutes: null,
  ...over,
});

describe("reviewImport", () => {
  it("matches an exact normalized name", () => {
    const [row] = reviewImport([att("Kim, Jessica (she/her)")], ctx());
    expect(row).toMatchObject({ group: "matched", applicantId: "a1" });
  });
  it("matches by email even when the name differs", () => {
    const [row] = reviewImport([att("J K", { email: "jkim@ucsc.edu" })], ctx());
    expect(row).toMatchObject({ group: "matched", applicantId: "a1" });
  });
  it("matches through a saved alias", () => {
    const [row] = reviewImport([att("Danny Ortiz")], ctx());
    expect(row).toMatchObject({ group: "matched", applicantId: "a2" });
  });
  it("sends a fuzzy match to 'needs-look' with candidates and no default applicant", () => {
    const [row] = reviewImport([att("Jess K.")], ctx());
    expect(row.group).toBe("needs-look");
    expect(row.applicantId).toBeNull();
    expect(row.candidates[0].applicantId).toBe("a1");
  });
  it("marks an unknown person as new", () => {
    expect(reviewImport([att("Marcus Lee")], ctx())[0].group).toBe("new");
  });
  it("ignores short Zoom stays but keeps people with no minutes", () => {
    const rows = reviewImport([att("Marcus Lee", { minutes: 3 }), att("Priya Natarajan", { minutes: null })], ctx());
    expect(rows[0]).toMatchObject({ group: "ignored", reason: "Stayed 3 min" });
    expect(rows[1].group).toBe("new");
  });
  it("a minMinutes of 0 disables the filter", () => {
    expect(reviewImport([att("Marcus Lee", { minutes: 1 })], ctx({ minMinutes: 0 }))[0].group).toBe("new");
  });
  it("ignores names on the ignore list", () => {
    const rows = reviewImport([att("Zoom Room 1")], ctx({ ignoredNames: new Set(["zoom room"]) }));
    expect(rows[0]).toMatchObject({ group: "ignored", reason: "On your ignore list" });
  });
  it("ignores names that look like portal members, unless they match an applicant", () => {
    const c = ctx({ memberNames: new Set(["sam exec", "jessica kim"]) });
    expect(reviewImport([att("Sam Exec")], c)[0]).toMatchObject({ group: "ignored", reason: "Looks like a member or exec" });
    expect(reviewImport([att("Jessica Kim")], c)[0].group).toBe("matched");
  });
  it("skips applicants who already have points for the event", () => {
    const [row] = reviewImport([att("Jessica Kim")], ctx({ awardedApplicantIds: new Set(["a1"]) }));
    expect(row).toMatchObject({ group: "already", applicantId: "a1" });
  });
  it("never lets two list names award the same applicant", () => {
    const rows = reviewImport([att("Jessica Kim"), att("Kim, Jessica")], ctx());
    expect(rows[0].group).toBe("matched");
    expect(rows[1].group).toBe("needs-look");
  });
  it("flags an empty name with no email as ignored", () => {
    expect(reviewImport([att("  ")], ctx())[0]).toMatchObject({ group: "ignored", reason: "No name" });
  });
  it("gives each row a stable key", () => {
    expect(reviewImport([att("A One"), att("B Two")], ctx()).map((r) => r.key)).toEqual(["0", "1"]);
  });
});

describe("actions and commit rows", () => {
  const rows = reviewImport(
    [att("Jessica Kim"), att("Jess K."), att("Marcus Lee"), att("Zoom Room 1", { minutes: 1 }), att("Daniel Ortiz")],
    ctx({ awardedApplicantIds: new Set(["a2"]) }),
  );

  it("defaults: award matched, add new, skip everything uncertain or ignored", () => {
    const actions = defaultActions(rows);
    expect(actions["0"]).toEqual({ action: "award", applicantId: "a1" });
    expect(actions["1"]).toEqual({ action: "skip" });
    expect(actions["2"]).toEqual({ action: "new" });
    expect(actions["3"]).toEqual({ action: "skip" });
    expect(actions["4"]).toEqual({ action: "skip" }); // already awarded
  });

  it("summarizes, counting unresolved 'needs a look' rows", () => {
    expect(summarizeActions(rows, defaultActions(rows))).toEqual({ award: 1, create: 1, skip: 3, unresolved: 1 });
  });

  it("builds commit rows, saving an alias only when the list name differs", () => {
    const actions = defaultActions(rows);
    actions["1"] = { action: "award", applicantId: "a1" }; // exec confirmed "Jess K." = Jessica
    actions["3"] = { action: "ignore" };
    expect(buildCommitRows(rows, actions, applicants)).toEqual([
      { kind: "existing", applicantId: "a1", alias: null },
      { kind: "existing", applicantId: "a1", alias: "jess k" },
      { kind: "new", name: "Marcus Lee", email: null },
      { kind: "ignore", alias: "zoom room" },
    ]);
  });

  it("omits skipped rows entirely", () => {
    expect(buildCommitRows(rows, defaultActions(rows), applicants)).toEqual([
      { kind: "existing", applicantId: "a1", alias: null },
      { kind: "new", name: "Marcus Lee", email: null },
    ]);
  });
});
```

(The `rows` fixture's "Daniel Ortiz" is awarded already via `awardedApplicantIds`, and "Zoom Room 1" with 1 minute is ignored by the minutes rule — its normalized form `zoom room` is what an exec's "ignore" action stores.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/recruit-import.test.ts`
Expected: FAIL — the new exports don't exist yet.

- [ ] **Step 3: Implement**

In `src/lib/recruit-import.ts` change the first import to `import { findMatches, normalizeName, type MatchCandidate, type MatchableApplicant } from "./recruit-matching";` and append:

```ts
export type ImportGroup = "matched" | "needs-look" | "new" | "ignored" | "already";

export interface ReviewContext {
  applicants: MatchableApplicant[];
  /** Normalized names the exec has told us to ignore this quarter. */
  ignoredNames: Set<string>;
  /** Normalized names of portal members/execs (hosts, co-hosts). */
  memberNames: Set<string>;
  /** Applicants who already hold live points for the chosen event. */
  awardedApplicantIds: Set<string>;
  minMinutes: number;
}

export interface ReviewRow {
  key: string;
  attendee: ParsedAttendee;
  group: ImportGroup;
  reason: string;
  candidates: MatchCandidate[];
  applicantId: string | null;
}

export function reviewImport(attendees: ParsedAttendee[], ctx: ReviewContext): ReviewRow[] {
  const byId = new Map(ctx.applicants.map((a) => [a.id, a]));
  const claimed = new Set<string>();

  return attendees.map((attendee, index): ReviewRow => {
    const key = String(index);
    const norm = normalizeName(attendee.rawName);
    const base = { key, attendee, candidates: [] as MatchCandidate[], applicantId: null as string | null };

    if (!norm && !attendee.email) return { ...base, group: "ignored", reason: "No name" };
    if (attendee.minutes !== null && attendee.minutes < ctx.minMinutes) {
      return { ...base, group: "ignored", reason: `Stayed ${Math.round(attendee.minutes)} min` };
    }
    if (norm && ctx.ignoredNames.has(norm)) return { ...base, group: "ignored", reason: "On your ignore list" };

    const matches = findMatches({ name: attendee.rawName, email: attendee.email }, ctx.applicants);
    const sure = matches.filter((m) => m.kind === "duplicate" || m.kind === "likely");

    if (sure.length === 1) {
      const id = sure[0].applicantId;
      if (claimed.has(id)) {
        return {
          ...base,
          group: "needs-look",
          reason: `Another name in this list already matched ${byId.get(id)?.name ?? "this applicant"}`,
          candidates: matches,
        };
      }
      claimed.add(id);
      if (ctx.awardedApplicantIds.has(id)) {
        return { ...base, group: "already", reason: "Already has points for this event", applicantId: id };
      }
      return { ...base, group: "matched", reason: "", applicantId: id };
    }

    if (matches.length > 0) {
      return {
        ...base,
        group: "needs-look",
        reason: sure.length > 1 ? "Matches more than one applicant" : "Looks similar to an existing applicant",
        candidates: matches,
      };
    }
    if (norm && ctx.memberNames.has(norm)) return { ...base, group: "ignored", reason: "Looks like a member or exec" };
    return { ...base, group: "new", reason: "" };
  });
}

export type ImportAction =
  | { action: "award"; applicantId: string }
  | { action: "new" }
  | { action: "skip" }
  | { action: "ignore" };

export function defaultActions(rows: ReviewRow[]): Record<string, ImportAction> {
  const out: Record<string, ImportAction> = {};
  for (const row of rows) {
    if (row.group === "matched" && row.applicantId) out[row.key] = { action: "award", applicantId: row.applicantId };
    else if (row.group === "new") out[row.key] = { action: "new" };
    else out[row.key] = { action: "skip" };
  }
  return out;
}

export type CommitRow =
  | { kind: "existing"; applicantId: string; alias: string | null }
  | { kind: "new"; name: string; email: string | null }
  | { kind: "ignore"; alias: string };

export function buildCommitRows(
  rows: ReviewRow[],
  actions: Record<string, ImportAction>,
  applicants: MatchableApplicant[],
): CommitRow[] {
  const byId = new Map(applicants.map((a) => [a.id, a]));
  const out: CommitRow[] = [];
  for (const row of rows) {
    const action = actions[row.key] ?? { action: "skip" };
    const norm = normalizeName(row.attendee.rawName);

    if (action.action === "award") {
      const applicant = byId.get(action.applicantId);
      const known = applicant ? [applicant.name, ...applicant.aliases].map(normalizeName) : [];
      out.push({
        kind: "existing",
        applicantId: action.applicantId,
        alias: norm && !known.includes(norm) ? norm : null,
      });
    } else if (action.action === "new") {
      out.push({ kind: "new", name: cleanDisplayName(row.attendee.rawName), email: row.attendee.email });
    } else if (action.action === "ignore" && norm) {
      out.push({ kind: "ignore", alias: norm });
    }
  }
  return out;
}

export function summarizeActions(
  rows: ReviewRow[],
  actions: Record<string, ImportAction>,
): { award: number; create: number; skip: number; unresolved: number } {
  let award = 0;
  let create = 0;
  let skip = 0;
  let unresolved = 0;
  for (const row of rows) {
    const action = actions[row.key] ?? { action: "skip" };
    if (action.action === "award") award++;
    else if (action.action === "new") create++;
    else {
      skip++;
      if (row.group === "needs-look" && action.action === "skip") unresolved++;
    }
  }
  return { award, create, skip, unresolved };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/recruit-import.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recruit-import.ts src/lib/recruit-import.test.ts
git commit -m "Add import review classification and commit-row building"
```

---

### Task 4: Attendance mapping and queue (pure logic, TDD)

**Files:**
- Create: `src/lib/recruit-attendance.ts`
- Test: `src/lib/recruit-attendance.test.ts`

**Interfaces:**
- Produces (exported from `src/lib/recruit-attendance.ts`):
  - `type BookingKind = "coffee_chat" | "interview"`, `type AttendanceStatus = "attended" | "no_show" | "excused"`
  - `NO_SHOW_DEFAULT_REASON = "No-show, no notice"`
  - `systemKeyFor(kind: BookingKind, status: AttendanceStatus): string | null`
  - `bookingKey(kind: BookingKind, bookingId: string): string`
  - `interface QueueBooking { kind: BookingKind; bookingId: string; applicantName: string; applicantEmail: string; status: "confirmed" | "cancelled" | "completed"; date: string; startTime: string; endTime: string }`
  - `isBookingPast(date: string, endTime: string, now: Date): boolean`
  - `bookingsInQuarter(bookings: QueueBooking[], quarter: { start_date: string; end_date: string }): QueueBooking[]`
  - `splitQueue(bookings: QueueBooking[], markedKeys: Set<string>, now: Date): { toMark: QueueBooking[]; cancelled: QueueBooking[]; upcoming: number }`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/recruit-attendance.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  bookingKey,
  bookingsInQuarter,
  isBookingPast,
  NO_SHOW_DEFAULT_REASON,
  splitQueue,
  systemKeyFor,
  type QueueBooking,
} from "./recruit-attendance";

const booking = (over: Partial<QueueBooking> = {}): QueueBooking => ({
  kind: "coffee_chat",
  bookingId: "b1",
  applicantName: "Jessica Kim",
  applicantEmail: "jkim@ucsc.edu",
  status: "confirmed",
  date: "2026-10-14",
  startTime: "14:00",
  endTime: "14:20",
  ...over,
});

describe("systemKeyFor", () => {
  it("maps coffee chat statuses to the system categories", () => {
    expect(systemKeyFor("coffee_chat", "attended")).toBe("coffee_chat_attended");
    expect(systemKeyFor("coffee_chat", "no_show")).toBe("coffee_chat_no_show");
    expect(systemKeyFor("coffee_chat", "excused")).toBe("coffee_chat_excused");
  });
  it("gives interviews no points at all", () => {
    expect(systemKeyFor("interview", "attended")).toBeNull();
    expect(systemKeyFor("interview", "no_show")).toBeNull();
    expect(systemKeyFor("interview", "excused")).toBeNull();
  });
  it("has a sensible default no-show reason", () => {
    expect(NO_SHOW_DEFAULT_REASON).toMatch(/no-show/i);
  });
});

describe("bookingKey", () => {
  it("separates the two booking tables", () => {
    expect(bookingKey("coffee_chat", "x")).not.toBe(bookingKey("interview", "x"));
  });
});

describe("isBookingPast", () => {
  it("is false before the slot ends and true after (org time zone)", () => {
    expect(isBookingPast("2026-10-14", "14:20", new Date("2026-10-14T20:00:00Z"))).toBe(false); // 1pm PDT
    expect(isBookingPast("2026-10-14", "14:20", new Date("2026-10-14T21:30:00Z"))).toBe(true); // 2:30pm PDT
  });
  it("accepts HH:MM:SS end times", () => {
    expect(isBookingPast("2026-10-14", "14:20:00", new Date("2026-10-15T12:00:00Z"))).toBe(true);
  });
});

describe("bookingsInQuarter", () => {
  const quarter = { start_date: "2026-09-24", end_date: "2026-12-12" };
  it("keeps bookings dated inside the quarter, inclusive", () => {
    const inside = [booking({ date: "2026-09-24" }), booking({ date: "2026-12-12", bookingId: "b2" })];
    const outside = [booking({ date: "2026-09-23", bookingId: "b3" }), booking({ date: "2027-01-05", bookingId: "b4" })];
    expect(bookingsInQuarter([...inside, ...outside], quarter).map((b) => b.bookingId)).toEqual(["b1", "b2"]);
  });
});

describe("splitQueue", () => {
  const now = new Date("2026-10-20T12:00:00Z");

  it("puts past, unmarked, non-cancelled bookings in toMark", () => {
    const { toMark } = splitQueue([booking()], new Set(), now);
    expect(toMark).toHaveLength(1);
  });
  it("excludes already-marked bookings", () => {
    const marked = new Set([bookingKey("coffee_chat", "b1")]);
    expect(splitQueue([booking()], marked, now).toMark).toHaveLength(0);
  });
  it("lists cancelled bookings separately and never as to-mark", () => {
    const result = splitQueue([booking({ status: "cancelled" })], new Set(), now);
    expect(result.toMark).toHaveLength(0);
    expect(result.cancelled).toHaveLength(1);
  });
  it("counts future bookings as upcoming, not to-mark", () => {
    const result = splitQueue([booking({ date: "2026-10-25" })], new Set(), now);
    expect(result.toMark).toHaveLength(0);
    expect(result.upcoming).toBe(1);
  });
  it("sorts to-mark by date then time", () => {
    const result = splitQueue(
      [
        booking({ bookingId: "late", date: "2026-10-15", startTime: "15:00" }),
        booking({ bookingId: "early", date: "2026-10-14", startTime: "14:00" }),
      ],
      new Set(),
      now,
    );
    expect(result.toMark.map((b) => b.bookingId)).toEqual(["early", "late"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/recruit-attendance.test.ts`
Expected: FAIL — cannot resolve `./recruit-attendance`.

- [ ] **Step 3: Implement**

Create `src/lib/recruit-attendance.ts`:

```ts
import { zonedDateTimeToUtc } from "./date";

export type BookingKind = "coffee_chat" | "interview";
export type AttendanceStatus = "attended" | "no_show" | "excused";

export const NO_SHOW_DEFAULT_REASON = "No-show, no notice";

/** Which system category a mark uses. Interviews never create points. */
export function systemKeyFor(kind: BookingKind, status: AttendanceStatus): string | null {
  if (kind !== "coffee_chat") return null;
  if (status === "attended") return "coffee_chat_attended";
  if (status === "no_show") return "coffee_chat_no_show";
  return "coffee_chat_excused";
}

export function bookingKey(kind: BookingKind, bookingId: string): string {
  return `${kind}:${bookingId}`;
}

export interface QueueBooking {
  kind: BookingKind;
  bookingId: string;
  applicantName: string;
  applicantEmail: string;
  status: "confirmed" | "cancelled" | "completed";
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
}

export function isBookingPast(date: string, endTime: string, now: Date): boolean {
  return zonedDateTimeToUtc(date, endTime.slice(0, 5)).getTime() <= now.getTime();
}

export function bookingsInQuarter(
  bookings: QueueBooking[],
  quarter: { start_date: string; end_date: string },
): QueueBooking[] {
  return bookings.filter((b) => b.date >= quarter.start_date && b.date <= quarter.end_date);
}

export function splitQueue(
  bookings: QueueBooking[],
  markedKeys: Set<string>,
  now: Date,
): { toMark: QueueBooking[]; cancelled: QueueBooking[]; upcoming: number } {
  const toMark: QueueBooking[] = [];
  const cancelled: QueueBooking[] = [];
  let upcoming = 0;
  for (const b of bookings) {
    if (b.status === "cancelled") {
      cancelled.push(b);
    } else if (markedKeys.has(bookingKey(b.kind, b.bookingId))) {
      continue;
    } else if (isBookingPast(b.date, b.endTime, now)) {
      toMark.push(b);
    } else {
      upcoming++;
    }
  }
  const byTime = (a: QueueBooking, b: QueueBooking) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`);
  return { toMark: toMark.sort(byTime), cancelled: cancelled.sort(byTime), upcoming };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/recruit-attendance.test.ts`
Expected: all PASS. If the time-zone assertions fail, read `ORG_TIME_ZONE` in `src/lib/date.ts` and adjust the UTC instants in the test to the org zone's offset on 2026-10-14 (the intent: one instant before 14:20 org time, one after).

- [ ] **Step 5: Commit**

```bash
git add src/lib/recruit-attendance.ts src/lib/recruit-attendance.test.ts
git commit -m "Add attendance mapping and booking queue logic"
```

---

### Task 5: Data layer and Server Actions

**Files:**
- Create: `src/lib/data/recruit-import.ts`
- Modify: `src/actions/recruit.ts` (add actions, make `createEventAction` return the id, share the previous-applicant lookup)
- Modify: `src/lib/audit-labels.ts`

**Interfaces:**
- Consumes: Task 3 `reviewImport`, `ReviewRow`, `CommitRow`; Task 4 `splitQueue`, `bookingsInQuarter`, `QueueBooking`, `systemKeyFor`, `NO_SHOW_DEFAULT_REASON`, `bookingKey`; piece 1 `getMatchableApplicants`, `findMatches`, `normalizeName`.
- Produces:
  - `src/lib/data/recruit-import.ts`: `getImportContext(quarterId: string): Promise<{ applicants: MatchableApplicant[]; ignoredNames: Set<string>; memberNames: Set<string> }>`; `getAwardedApplicantIds(eventId: string): Promise<Set<string>>`; `interface AttendanceItem extends QueueBooking { applicantId: string | null; markStatus: AttendanceStatus | null }`; `interface AttendanceData { toMark: AttendanceItem[]; cancelled: AttendanceItem[]; marked: AttendanceItem[]; upcoming: number }`; `getAttendanceData(quarterId: string): Promise<AttendanceData>`
  - Actions in `src/actions/recruit.ts`: `reviewImportAction(input: { quarterId: string; text: string; eventId: string | null; minMinutes: number }): Promise<{ error?: string; rows?: ReviewRow[]; applicants?: { id: string; name: string; email: string | null }[] }>`; `commitImportAction(input: { quarterId: string; eventId: string | null; categoryId: string; points: number; rows: CommitRow[] }): Promise<ActionResult & { batchId?: string; created?: number; awarded?: number; skipped?: number }>`; `undoImportAction(batchId: string): Promise<ActionResult & { voided?: number }>`; `markBookingAction(input: { quarterId: string; kind: BookingKind; bookingId: string; status: AttendanceStatus; resolution?: { applicantId?: string; createNew?: boolean } }): Promise<ActionResult & { needsPick?: { applicantId: string; name: string; email: string | null; score: number }[] }>`; `clearBookingMarkAction(kind: BookingKind, bookingId: string): Promise<ActionResult>`; `createEventAction` now returns `ActionResult & { eventId?: string }`.

- [ ] **Step 1: Write the import/attendance data layer**

Create `src/lib/data/recruit-import.ts`:

```ts
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/paginate";
import { getQuarters } from "@/lib/data/quarters";
import { getAllBookings } from "@/lib/data/coffee-chat";
import { getInterviewBookings } from "@/lib/data/interview";
import { getMatchableApplicants } from "@/lib/data/recruit";
import { normalizeName, type MatchableApplicant } from "@/lib/recruit-matching";
import {
  bookingKey,
  bookingsInQuarter,
  splitQueue,
  type AttendanceStatus,
  type QueueBooking,
} from "@/lib/recruit-attendance";

export async function getImportContext(quarterId: string): Promise<{
  applicants: MatchableApplicant[];
  ignoredNames: Set<string>;
  memberNames: Set<string>;
}> {
  const supabase = await createClient();
  const [applicants, ignored, profiles] = await Promise.all([
    getMatchableApplicants(quarterId),
    fetchAllPages((from, to) =>
      supabase.from("recruit_ignored_names").select("name").eq("quarter_id", quarterId).order("id").range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase.from("profiles").select("name").is("archived_at", null).order("id").range(from, to),
    ),
  ]);
  return {
    applicants,
    ignoredNames: new Set(ignored.map((i) => normalizeName(i.name)).filter(Boolean)),
    memberNames: new Set(profiles.map((p) => normalizeName(p.name)).filter(Boolean)),
  };
}

/** Applicants who already hold live (non-voided) points for this event. */
export async function getAwardedApplicantIds(eventId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const rows = await fetchAllPages((from, to) =>
    supabase
      .from("recruit_points")
      .select("applicant_id")
      .eq("event_id", eventId)
      .is("voided_at", null)
      .order("id")
      .range(from, to),
  );
  return new Set(rows.map((r) => r.applicant_id));
}

export interface AttendanceItem extends QueueBooking {
  applicantId: string | null;
  markStatus: AttendanceStatus | null;
}

export interface AttendanceData {
  toMark: AttendanceItem[];
  cancelled: AttendanceItem[];
  marked: AttendanceItem[];
  upcoming: number;
}

export async function getAttendanceData(quarterId: string): Promise<AttendanceData> {
  const supabase = await createClient();
  const quarters = await getQuarters();
  const quarter = quarters.find((q) => q.id === quarterId);
  if (!quarter) return { toMark: [], cancelled: [], marked: [], upcoming: 0 };

  const [coffee, interviews, links] = await Promise.all([
    getAllBookings(),
    getInterviewBookings(),
    fetchAllPages((from, to) => supabase.from("recruit_booking_links").select("*").order("id").range(from, to)),
  ]);

  const all: QueueBooking[] = [
    ...coffee.map(
      (b): QueueBooking => ({
        kind: "coffee_chat",
        bookingId: b.id,
        applicantName: b.applicantName,
        applicantEmail: b.applicantEmail,
        status: b.status,
        date: b.date,
        startTime: b.startTime,
        endTime: b.endTime,
      }),
    ),
    ...interviews.map(
      (b): QueueBooking => ({
        kind: "interview",
        bookingId: b.id,
        applicantName: b.applicantName,
        applicantEmail: b.applicantEmail,
        status: b.status,
        date: b.date,
        startTime: b.startTime,
        endTime: b.endTime,
      }),
    ),
  ].filter((b) => b.date);

  const inQuarter = bookingsInQuarter(all, quarter);
  const linkByKey = new Map(links.map((l) => [bookingKey(l.booking_kind, l.booking_id), l]));
  const { toMark, cancelled, upcoming } = splitQueue(inQuarter, new Set(linkByKey.keys()), new Date());

  const withLink = (b: QueueBooking): AttendanceItem => {
    const link = linkByKey.get(bookingKey(b.kind, b.bookingId));
    return { ...b, applicantId: link?.applicant_id ?? null, markStatus: link?.status ?? null };
  };

  const marked = inQuarter
    .filter((b) => linkByKey.has(bookingKey(b.kind, b.bookingId)))
    .map(withLink)
    .sort((a, b) => `${b.date}T${b.startTime}`.localeCompare(`${a.date}T${a.startTime}`));

  return { toMark: toMark.map(withLink), cancelled: cancelled.map(withLink), marked, upcoming };
}
```

- [ ] **Step 2: Add the actions**

In `src/actions/recruit.ts`:

1. Add imports: `import { getAwardedApplicantIds, getImportContext } from "@/lib/data/recruit-import";`, `import { buildCommitRows ... }` is **not** needed server-side except types: `import { parseAttendeeInput, reviewImport, cleanDisplayName, type CommitRow, type ReviewRow } from "@/lib/recruit-import";`, and `import { NO_SHOW_DEFAULT_REASON, systemKeyFor, type AttendanceStatus, type BookingKind } from "@/lib/recruit-attendance";`.
2. Add a shared helper above `addApplicantAction` and use it there (replacing the inline previous-applicant query, and also filtering out merged-away rows):

```ts
async function findPreviousApplicantId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  email: string | null,
  quarterId: string,
): Promise<string | null> {
  if (!email) return null;
  const { data } = await supabase
    .from("recruit_applicants")
    .select("id")
    .eq("email", email)
    .neq("quarter_id", quarterId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0]?.id ?? null;
}
```

   In `addApplicantAction` replace the `let previousId ... if (email) { ... }` block with `const previousId = await findPreviousApplicantId(supabase, email, input.quarterId);`.
3. Change `createEventAction`'s insert to return the id and its signature to `Promise<ActionResult & { eventId?: string }>`:

```ts
  const { data, error: insertError } = await supabase
    .from("recruit_events")
    .insert({
      quarter_id: input.quarterId,
      category_id: input.categoryId,
      name: input.name.trim(),
      date: input.date,
    })
    .select("id")
    .single();
  if (insertError) return { error: insertError.message };

  revalidateAll();
  return { eventId: data.id };
```

4. Append the new actions:

```ts
export async function reviewImportAction(input: {
  quarterId: string;
  text: string;
  eventId: string | null;
  minMinutes: number;
}): Promise<{ error?: string; rows?: ReviewRow[]; applicants?: { id: string; name: string; email: string | null }[] }> {
  const { error } = await requireExec();
  if (error) return { error };

  const attendees = parseAttendeeInput(input.text);
  if (attendees.length === 0) return { error: "Couldn't find any names in that. Paste one name per line or upload a Zoom CSV." };

  const [context, awarded] = await Promise.all([
    getImportContext(input.quarterId),
    input.eventId ? getAwardedApplicantIds(input.eventId) : Promise.resolve(new Set<string>()),
  ]);

  const rows = reviewImport(attendees, {
    applicants: context.applicants,
    ignoredNames: context.ignoredNames,
    memberNames: context.memberNames,
    awardedApplicantIds: awarded,
    minMinutes: Number.isFinite(input.minMinutes) ? Math.max(0, input.minMinutes) : 10,
  });
  return {
    rows,
    applicants: context.applicants
      .map((a) => ({ id: a.id, name: a.name, email: a.email }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function commitImportAction(input: {
  quarterId: string;
  eventId: string | null;
  categoryId: string;
  points: number;
  rows: CommitRow[];
}): Promise<ActionResult & { batchId?: string; created?: number; awarded?: number; skipped?: number }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  if (!Number.isFinite(input.points)) return { error: "Enter the points as a number." };
  if (input.rows.length === 0) return { error: "Nothing to import — every row was skipped." };

  const supabase = await createClient();
  const { data: category, error: categoryError } = await supabase
    .from("recruit_categories")
    .select("archived_at, name")
    .eq("id", input.categoryId)
    .maybeSingle();
  if (categoryError) return { error: categoryError.message };
  if (!category || category.archived_at) return { error: "That category is archived — pick another one." };

  const { data, error: rpcError } = await supabase.rpc("commit_recruit_import", {
    p_quarter: input.quarterId,
    p_event: input.eventId,
    p_category: input.categoryId,
    p_points: input.points,
    p_rows: input.rows,
  });
  if (rpcError) return { error: rpcError.message };

  const result = data as { batchId: string; created: number; awarded: number; skipped: number };
  await logAudit(
    profile.id,
    "recruit.import_committed",
    category.name,
    `${result.awarded} awarded, ${result.created} new applicants, ${result.skipped} skipped`,
  );
  revalidateAll();
  return { batchId: result.batchId, created: result.created, awarded: result.awarded, skipped: result.skipped };
}

export async function undoImportAction(batchId: string): Promise<ActionResult & { voided?: number }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const supabase = await createClient();
  const { data, error: rpcError } = await supabase.rpc("undo_recruit_import", { p_batch: batchId });
  if (rpcError) return { error: rpcError.message };

  await logAudit(profile.id, "recruit.import_undone", null, `${data} entries voided`);
  revalidateAll();
  return { voided: data as number };
}

export async function markBookingAction(input: {
  quarterId: string;
  kind: BookingKind;
  bookingId: string;
  status: AttendanceStatus;
  resolution?: { applicantId?: string; createNew?: boolean };
}): Promise<ActionResult & { needsPick?: { applicantId: string; name: string; email: string | null; score: number }[] }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const supabase = await createClient();
  const table = input.kind === "coffee_chat" ? "coffee_chat_bookings" : "interview_bookings";
  const { data: booking, error: bookingError } = await supabase
    .from(table)
    .select("applicant_name, applicant_email")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (bookingError) return { error: bookingError.message };
  if (!booking) return { error: "That booking no longer exists." };

  const existing = await getMatchableApplicants(input.quarterId);
  const byId = new Map(existing.map((a) => [a.id, a]));
  const email = normalizeApplicantEmail(booking.applicant_email);
  const matches = findMatches({ name: booking.applicant_name, email }, existing);

  let applicantId: string | null = null;
  const emailHit = matches.find((m) => m.kind === "duplicate");
  if (emailHit) {
    applicantId = emailHit.applicantId;
  } else if (input.resolution?.applicantId && byId.has(input.resolution.applicantId)) {
    applicantId = input.resolution.applicantId;
    const alias = normalizeName(booking.applicant_name);
    if (alias) {
      await supabase
        .from("recruit_applicant_aliases")
        .upsert({ applicant_id: applicantId, quarter_id: input.quarterId, alias }, { onConflict: "quarter_id,alias", ignoreDuplicates: true });
    }
  } else if (!input.resolution?.createNew && matches.length > 0) {
    return {
      needsPick: matches.map((m) => ({
        applicantId: m.applicantId,
        name: byId.get(m.applicantId)?.name ?? "Unknown",
        email: byId.get(m.applicantId)?.email ?? null,
        score: m.score,
      })),
    };
  }

  if (!applicantId) {
    const previousId = await findPreviousApplicantId(supabase, email, input.quarterId);
    const { data: created, error: createError } = await supabase
      .from("recruit_applicants")
      .insert({
        quarter_id: input.quarterId,
        name: cleanDisplayName(booking.applicant_name),
        email,
        previous_applicant_id: previousId,
      })
      .select("id")
      .single();
    if (createError) return { error: createError.message };
    applicantId = created.id;
  }

  let categoryId: string | null = null;
  let points: number | null = null;
  let reason: string | null = null;
  const key = systemKeyFor(input.kind, input.status);
  if (key) {
    const { data: category, error: categoryError } = await supabase
      .from("recruit_categories")
      .select("id, default_points")
      .eq("system_key", key)
      .maybeSingle();
    if (categoryError) return { error: categoryError.message };
    if (!category) return { error: "The automatic points category is missing — check the Setup tab." };
    categoryId = category.id;
    points = Number(category.default_points);
    reason = input.status === "no_show" ? NO_SHOW_DEFAULT_REASON : null;
  }

  const { error: rpcError } = await supabase.rpc("mark_recruit_booking", {
    p_kind: input.kind,
    p_booking: input.bookingId,
    p_applicant: applicantId,
    p_status: input.status,
    p_category: categoryId,
    p_points: points,
    p_reason: reason,
  });
  if (rpcError) return { error: rpcError.message };

  revalidateAll();
  return {};
}

export async function clearBookingMarkAction(kind: BookingKind, bookingId: string): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  const { error: rpcError } = await supabase.rpc("clear_recruit_booking_mark", { p_kind: kind, p_booking: bookingId });
  if (rpcError) return { error: rpcError.message };

  revalidateAll();
  return {};
}
```

   The file's existing imports already cover `createClient`, `logAudit`, `findMatches`, `normalizeName`, `normalizeApplicantEmail`, `getMatchableApplicants`.
5. Add labels in `src/lib/audit-labels.ts`: `"recruit.import_committed": "Imported attendee points"`, `"recruit.import_undone": "Undid an attendee import"`.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all pass. (`rpc` return typing: if `data as {...}` complains, cast through `unknown`.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/recruit-import.ts src/actions/recruit.ts src/lib/audit-labels.ts
git commit -m "Add import and attendance data layer and server actions"
```

---

### Task 6: Import dialog (multi-step UI)

**Files:**
- Create: `src/app/portal/(app)/admin/applicants/import-dialog.tsx`
- Create: `src/app/portal/(app)/admin/applicants/import-review.tsx`
- Modify: `src/app/portal/(app)/admin/applicants/applicants-workspace.tsx` (Import button next to Add applicant)

**Interfaces:**
- Consumes: Task 5 actions `reviewImportAction`, `commitImportAction`, `undoImportAction`, `createEventAction`; Task 3 `defaultActions`, `buildCommitRows`, `summarizeActions`, types `ReviewRow`, `ImportAction`; `RecruitCategory`, `RecruitEvent`.
- Produces: `ImportDialog` props `{ quarterId: string; categories: RecruitCategory[]; events: RecruitEvent[] }`; `ImportReview` props `{ rows: ReviewRow[]; applicants: { id: string; name: string; email: string | null }[]; actions: Record<string, ImportAction>; onChange: (key: string, action: ImportAction) => void }`.

- [ ] **Step 1: The review component (grouped by "what needs you")**

Create `src/app/portal/(app)/admin/applicants/import-review.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ImportAction, ReviewRow } from "@/lib/recruit-import";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Applicant = { id: string; name: string; email: string | null };

function Group({
  title,
  hint,
  count,
  tone,
  defaultOpen,
  children,
}: {
  title: string;
  hint?: string;
  count: number;
  tone: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;
  return (
    <section className="rounded-xl border">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        <span className="font-medium">{title}</span>
        <Badge className={tone}>{count}</Badge>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </button>
      {open && <div className="divide-y border-t">{children}</div>}
    </section>
  );
}

function Name({ row }: { row: ReviewRow }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium">{row.attendee.rawName || "(no name)"}</div>
      <div className="text-xs text-muted-foreground">
        {[row.attendee.email, row.attendee.minutes !== null ? `${Math.round(row.attendee.minutes)} min` : null]
          .filter(Boolean)
          .join(" · ")}
      </div>
    </div>
  );
}

export function ImportReview({
  rows,
  applicants,
  actions,
  onChange,
}: {
  rows: ReviewRow[];
  applicants: Applicant[];
  actions: Record<string, ImportAction>;
  onChange: (key: string, action: ImportAction) => void;
}) {
  const byId = new Map(applicants.map((a) => [a.id, a]));
  const of = (group: ReviewRow["group"]) => rows.filter((r) => r.group === group);
  const isAward = (key: string) => actions[key]?.action === "award";

  return (
    <div className="space-y-3">
      <Group title="Needs a look" count={of("needs-look").length} tone="bg-amber-100 text-amber-900" defaultOpen hint="Confirm who each of these is">
        {of("needs-look").map((row) => {
          const action = actions[row.key];
          return (
            <div key={row.key} className="space-y-2 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Name row={row} />
                {action?.action === "award" && (
                  <Badge variant="secondary">→ {byId.get(action.applicantId)?.name ?? "Chosen applicant"}</Badge>
                )}
                {action?.action === "new" && <Badge variant="secondary">→ New person</Badge>}
                {action?.action === "skip" && <Badge variant="outline">Skipped</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{row.reason}</p>
              <div className="flex flex-wrap items-center gap-2">
                {row.candidates.slice(0, 3).map((c) => (
                  <Button
                    key={c.applicantId}
                    size="sm"
                    variant={action?.action === "award" && action.applicantId === c.applicantId ? "default" : "outline"}
                    onClick={() => onChange(row.key, { action: "award", applicantId: c.applicantId })}
                  >
                    Yes, {byId.get(c.applicantId)?.name ?? "this person"}
                  </Button>
                ))}
                <Select
                  value=""
                  onValueChange={(v) => v && onChange(row.key, { action: "award", applicantId: v })}
                >
                  <SelectTrigger size="sm" className="w-44">
                    <SelectValue placeholder="Pick someone else">{() => "Pick someone else"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {applicants.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant={action?.action === "new" ? "default" : "outline"} onClick={() => onChange(row.key, { action: "new" })}>
                  Add as new person
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onChange(row.key, { action: "skip" })}>
                  Skip
                </Button>
              </div>
            </div>
          );
        })}
      </Group>

      <Group title="New people" count={of("new").length} tone="bg-blue-100 text-blue-900" defaultOpen hint="Will be added as applicants">
        {of("new").map((row) => (
          <div key={row.key} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <Name row={row} />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={actions[row.key]?.action === "new" ? "default" : "outline"}
                onClick={() => onChange(row.key, { action: actions[row.key]?.action === "new" ? "skip" : "new" })}
              >
                {actions[row.key]?.action === "new" ? "Adding" : "Add"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onChange(row.key, { action: "ignore" })}>
                Ignore this name
              </Button>
            </div>
          </div>
        ))}
      </Group>

      <Group title="Matched" count={of("matched").length} tone="bg-green-100 text-green-900" defaultOpen={false} hint="Exact matches — will get points">
        {of("matched").map((row) => (
          <div key={row.key} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <Name row={row} />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">→ {byId.get(row.applicantId ?? "")?.name}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  onChange(row.key, isAward(row.key) ? { action: "skip" } : { action: "award", applicantId: row.applicantId! })
                }
              >
                {isAward(row.key) ? "Skip" : "Include"}
              </Button>
            </div>
          </div>
        ))}
      </Group>

      <Group title="Already has points" count={of("already").length} tone="bg-slate-100 text-slate-900" defaultOpen={false} hint="Skipped so nobody is counted twice">
        {of("already").map((row) => (
          <div key={row.key} className="p-3 text-sm">
            <Name row={row} />
            <p className="text-xs text-muted-foreground">→ {byId.get(row.applicantId ?? "")?.name}</p>
          </div>
        ))}
      </Group>

      <Group title="Ignored" count={of("ignored").length} tone="bg-slate-100 text-slate-900" defaultOpen={false} hint="Hosts, short stays, your ignore list">
        {of("ignored").map((row) => (
          <div key={row.key} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <Name row={row} />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{row.reason}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onChange(row.key, actions[row.key]?.action === "new" ? { action: "skip" } : { action: "new" })}
              >
                {actions[row.key]?.action === "new" ? "Not adding" : "Add as new person"}
              </Button>
            </div>
          </div>
        ))}
      </Group>
    </div>
  );
}
```

- [ ] **Step 2: The dialog**

Create `src/app/portal/(app)/admin/applicants/import-dialog.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Undo2 } from "lucide-react";
import { commitImportAction, createEventAction, reviewImportAction, undoImportAction } from "@/actions/recruit";
import type { RecruitCategory, RecruitEvent } from "@/lib/data/recruit";
import {
  buildCommitRows,
  defaultActions,
  summarizeActions,
  type ImportAction,
  type ReviewRow,
} from "@/lib/recruit-import";
import { formatDateLong } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImportReview } from "./import-review";

const NEW_EVENT = "new";
const NO_EVENT = "none";

type Step = "input" | "review" | "done";
type Applicant = { id: string; name: string; email: string | null };

export function ImportDialog({
  quarterId,
  categories,
  events,
}: {
  quarterId: string;
  categories: RecruitCategory[];
  events: RecruitEvent[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <FileUp />
            Import list
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {/* Remounted on every open so each import starts from a clean state. */}
        {open && <ImportFlow quarterId={quarterId} categories={categories} events={events} onClose={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ImportFlow({
  quarterId,
  categories,
  events,
  onClose,
}: {
  quarterId: string;
  categories: RecruitCategory[];
  events: RecruitEvent[];
  onClose: () => void;
}) {
  const choices = categories.filter((c) => !c.archived);
  const infoSession = choices.find((c) => c.systemKey === "info_session") ?? choices[0];
  const [step, setStep] = useState<Step>("input");
  const [categoryId, setCategoryId] = useState(infoSession?.id ?? "");
  const [eventId, setEventId] = useState<string>(NEW_EVENT);
  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState("");
  const [points, setPoints] = useState(String(infoSession?.defaultPoints ?? 1));
  const [minMinutes, setMinMinutes] = useState("10");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [actions, setActions] = useState<Record<string, ImportAction>>({});
  const [resolvedEventId, setResolvedEventId] = useState<string | null>(null);
  const [result, setResult] = useState<{ batchId: string; awarded: number; created: number; skipped: number } | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const category = choices.find((c) => c.id === categoryId);
  const categoryEvents = events.filter((e) => e.categoryId === categoryId);
  const isNewEvent = eventId === NEW_EVENT;
  const canReview =
    !!categoryId && text.trim().length > 0 && Number.isFinite(Number(points)) && (!isNewEvent || (newName.trim() && newDate));

  function pickCategory(id: string) {
    setCategoryId(id);
    setEventId(NEW_EVENT);
    const next = choices.find((c) => c.id === id);
    if (next) setPoints(String(next.defaultPoints));
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    setText(await file.text());
  }

  function review() {
    startTransition(async () => {
      let useEventId: string | null = eventId === NO_EVENT || isNewEvent ? null : eventId;
      if (isNewEvent) {
        const created = await createEventAction({ quarterId, categoryId, name: newName, date: newDate });
        if (created.error || !created.eventId) {
          toast.error(created.error ?? "Couldn't create the event.");
          return;
        }
        useEventId = created.eventId;
        setEventId(created.eventId);
      }
      const reviewed = await reviewImportAction({ quarterId, text, eventId: useEventId, minMinutes: Number(minMinutes) });
      if (reviewed.error || !reviewed.rows) {
        toast.error(reviewed.error ?? "Couldn't read that list.");
        return;
      }
      setResolvedEventId(useEventId);
      setRows(reviewed.rows);
      setApplicants(reviewed.applicants ?? []);
      setActions(defaultActions(reviewed.rows));
      setStep("review");
    });
  }

  function commit() {
    startTransition(async () => {
      const commitRows = buildCommitRows(
        rows,
        actions,
        applicants.map((a) => ({ id: a.id, name: a.name, email: a.email, aliases: [] })),
      );
      const outcome = await commitImportAction({
        quarterId,
        eventId: resolvedEventId,
        categoryId,
        points: Number(points),
        rows: commitRows,
      });
      if (outcome.error || !outcome.batchId) {
        toast.error(outcome.error ?? "The import didn't go through.");
        return;
      }
      setResult({
        batchId: outcome.batchId,
        awarded: outcome.awarded ?? 0,
        created: outcome.created ?? 0,
        skipped: outcome.skipped ?? 0,
      });
      setStep("done");
      router.refresh();
    });
  }

  function undo() {
    if (!result) return;
    startTransition(async () => {
      const outcome = await undoImportAction(result.batchId);
      if (outcome.error) {
        toast.error(outcome.error);
        return;
      }
      toast.success(`Import undone — ${outcome.voided ?? 0} entries voided.`);
      router.refresh();
      onClose();
    });
  }

  const summary = summarizeActions(rows, actions);

  if (step === "done" && result) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Import complete</DialogTitle>
          <DialogDescription>
            {result.awarded} {result.awarded === 1 ? "person" : "people"} got {Number(points) > 0 ? "+" : ""}
            {points} for {category?.name}
            {result.created > 0 ? `, including ${result.created} new applicant${result.created === 1 ? "" : "s"}` : ""}.
            {result.skipped > 0 ? ` ${result.skipped} were skipped (already had points or no longer exist).` : ""}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Made a mistake? Undo removes this import&apos;s points and any applicants it created that you haven&apos;t touched.
        </p>
        <DialogFooter>
          <Button variant="outline" disabled={isPending} onClick={undo}>
            <Undo2 />
            Undo this import
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </>
    );
  }

  if (step === "review") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Check before giving points</DialogTitle>
          <DialogDescription>
            {rows.length} names from your list. Only the ones that need you are open — nothing is saved until you confirm.
          </DialogDescription>
        </DialogHeader>
        <ImportReview
          rows={rows}
          applicants={applicants}
          actions={actions}
          onChange={(key, action) => setActions((prev) => ({ ...prev, [key]: action }))}
        />
        <DialogFooter className="items-center">
          <span className="mr-auto text-sm text-muted-foreground">
            <b>{summary.award + summary.create}</b> will get {Number(points) > 0 ? "+" : ""}
            {points}
            {summary.create > 0 ? ` (${summary.create} new)` : ""}
            {summary.unresolved > 0 ? ` · ${summary.unresolved} still need a look and will be skipped` : ""}
          </span>
          <Button variant="ghost" onClick={() => setStep("input")}>
            Back
          </Button>
          <Button disabled={isPending || summary.award + summary.create === 0} onClick={commit}>
            Give points
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Import an attendee list</DialogTitle>
        <DialogDescription>
          Paste names from an in-person sign-in sheet, or upload the participants report from Zoom. You&apos;ll check anything
          uncertain before points are given.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel>What is this for?</FieldLabel>
          <Select value={categoryId} onValueChange={(v) => v && pickCategory(v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pick a category">{(v: string) => choices.find((c) => c.id === v)?.name}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {choices.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel>Which event?</FieldLabel>
          <Select value={eventId} onValueChange={(v) => v && setEventId(v)}>
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v: string) =>
                  v === NEW_EVENT ? "Create a new event…" : v === NO_EVENT ? "No specific event" : categoryEvents.find((e) => e.id === v)?.name
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NEW_EVENT}>Create a new event…</SelectItem>
              {categoryEvents.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name} · {formatDateLong(e.date)}
                </SelectItem>
              ))}
              <SelectItem value={NO_EVENT}>No specific event</SelectItem>
            </SelectContent>
          </Select>
          <FieldDescription>Attaching an event also stops anyone being counted twice if you import a second list.</FieldDescription>
        </Field>

        {isNewEvent && (
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="import-event-name">Event name</FieldLabel>
              <Input id="import-event-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Info Session 1" />
            </Field>
            <Field>
              <FieldLabel htmlFor="import-event-date">Date</FieldLabel>
              <Input id="import-event-date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="import-points">Points each</FieldLabel>
            <Input id="import-points" type="number" step="0.5" value={points} onChange={(e) => setPoints(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="import-min">Zoom: minimum minutes</FieldLabel>
            <Input id="import-min" type="number" min="0" value={minMinutes} onChange={(e) => setMinMinutes(e.target.value)} />
            <FieldDescription>People who stayed less than this are ignored. 0 turns it off.</FieldDescription>
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="import-text">Names</FieldLabel>
          <Textarea
            id="import-text"
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Jessica Kim\nDaniel Ortiz\nAisha Rahman, arahman@ucsc.edu"}
          />
          <div className="flex items-center gap-2">
            <Input type="file" accept=".csv,.txt" aria-label="Upload a Zoom report" onChange={(e) => readFile(e.target.files?.[0])} />
          </div>
          <FieldDescription>One name per line, or upload the CSV from Zoom → Reports → Usage → Participants.</FieldDescription>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button disabled={isPending || !canReview} onClick={review}>
          Review list
        </Button>
      </DialogFooter>
    </>
  );
}
```

  Note: `commit` passes aliases-empty applicant records to `buildCommitRows`; that only affects whether an alias is re-saved for an existing name, which the SQL's `on conflict do nothing` makes harmless.

- [ ] **Step 3: Mount in the workspace**

In `applicants-workspace.tsx`, import `ImportDialog` and render `<ImportDialog quarterId={quarterId} categories={categories} events={events} />` between `<HowItWorks />` and `<AddApplicantDialog … />` in the header actions.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all pass.

Manual (after the user applies the migration): import a 6-name list that includes an exact match, a nickname ("Jess K."), a brand-new person and a duplicate of the first; confirm grouping, that the summary line counts match, that "Give points" awards, that importing the same list again shows everyone under "Already has points", and that "Undo this import" removes the points and the new applicant.

- [ ] **Step 5: Commit**

```bash
git add "src/app/portal/(app)/admin/applicants"
git commit -m "Add attendee list import dialog with grouped review"
```

---

### Task 7: Attendance tab, to-do banner and page wiring

**Files:**
- Create: `src/app/portal/(app)/admin/applicants/attendance-view.tsx`
- Modify: `src/app/portal/(app)/admin/applicants/applicants-workspace.tsx` (new tab + prop)
- Modify: `src/app/portal/(app)/admin/applicants/applicants-view.tsx` (banner line)
- Modify: `src/app/portal/(app)/admin/applicants/page.tsx` (load attendance data)

**Interfaces:**
- Consumes: Task 5 `getAttendanceData`, `markBookingAction`, `clearBookingMarkAction`, `AttendanceData`, `AttendanceItem`; Task 4 types.
- Produces: `AttendanceView` props `{ quarterId: string; data: AttendanceData; applicantNames: Record<string, string> }`; `ApplicantsView` gains `toMarkCount: number` and `onReviewAttendance: () => void`; `ApplicantsWorkspace` gains `attendance: AttendanceData`.

- [ ] **Step 1: The attendance view**

Create `src/app/portal/(app)/admin/applicants/attendance-view.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleCheck } from "lucide-react";
import { clearBookingMarkAction, markBookingAction } from "@/actions/recruit";
import type { AttendanceData, AttendanceItem } from "@/lib/data/recruit-import";
import type { AttendanceStatus } from "@/lib/recruit-attendance";
import { formatTime12h } from "@/lib/coffee-chat";
import { formatDateLong } from "@/lib/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Pick = { applicantId: string; name: string; email: string | null; score: number };

const STATUS_LABEL: Record<AttendanceStatus, string> = { attended: "Attended", no_show: "No-show", excused: "Excused" };
const KIND_LABEL = { coffee_chat: "Coffee chat", interview: "Interview" } as const;

function BookingRow({
  item,
  quarterId,
  applicantNames,
}: {
  item: AttendanceItem;
  quarterId: string;
  applicantNames: Record<string, string>;
}) {
  const [isPending, startTransition] = useTransition();
  const [picks, setPicks] = useState<{ status: AttendanceStatus; options: Pick[] } | null>(null);
  const router = useRouter();

  function mark(status: AttendanceStatus, resolution?: { applicantId?: string; createNew?: boolean }) {
    startTransition(async () => {
      const result = await markBookingAction({
        quarterId,
        kind: item.kind,
        bookingId: item.bookingId,
        status,
        resolution,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.needsPick) {
        setPicks({ status, options: result.needsPick });
        return;
      }
      setPicks(null);
      toast.success(
        status === "no_show" && item.kind === "coffee_chat"
          ? `${item.applicantName} marked no-show (−1). You can void it from their profile.`
          : `${item.applicantName} marked ${STATUS_LABEL[status].toLowerCase()}.`,
      );
      router.refresh();
    });
  }

  function clear() {
    startTransition(async () => {
      const result = await clearBookingMarkAction(item.kind, item.bookingId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Mark cleared.");
      router.refresh();
    });
  }

  return (
    <li className="space-y-2 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium">
            {item.applicantName} <span className="font-normal text-muted-foreground">· {item.applicantEmail}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {KIND_LABEL[item.kind]} · {formatTime12h(item.startTime)}
            {item.markStatus && item.applicantId ? ` · ${applicantNames[item.applicantId] ?? "Applicant"}` : ""}
          </div>
        </div>
        {item.status === "cancelled" ? (
          <Badge variant="outline">Cancelled — excused</Badge>
        ) : item.markStatus ? (
          <div className="flex items-center gap-2">
            <Badge variant={item.markStatus === "no_show" ? "destructive" : "secondary"}>{STATUS_LABEL[item.markStatus]}</Badge>
            <Button size="sm" variant="ghost" disabled={isPending} onClick={clear}>
              Clear
            </Button>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <Button size="sm" disabled={isPending} onClick={() => mark("attended")}>
              Attended
            </Button>
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => mark("excused")}>
              Excused
            </Button>
            <Button size="sm" variant="destructive" disabled={isPending} onClick={() => mark("no_show")}>
              No-show{item.kind === "coffee_chat" ? " (−1)" : ""}
            </Button>
          </div>
        )}
      </div>

      {picks && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 dark:border-amber-500/40 dark:bg-amber-500/10">
          <p className="mb-1.5 text-xs font-medium">Is {item.applicantName} one of these applicants?</p>
          <div className="flex flex-wrap gap-2">
            {picks.options.slice(0, 3).map((o) => (
              <Button key={o.applicantId} size="sm" variant="outline" disabled={isPending} onClick={() => mark(picks.status, { applicantId: o.applicantId })}>
                Yes, {o.name}
              </Button>
            ))}
            <Button size="sm" disabled={isPending} onClick={() => mark(picks.status, { createNew: true })}>
              No, add as a new person
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function DayGroup({
  date,
  items,
  quarterId,
  applicantNames,
  onMarkAll,
  canMarkAll,
  isPending,
}: {
  date: string;
  items: AttendanceItem[];
  quarterId: string;
  applicantNames: Record<string, string>;
  onMarkAll: (items: AttendanceItem[]) => void;
  canMarkAll: boolean;
  isPending: boolean;
}) {
  return (
    <section className="rounded-xl border">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <h3 className="text-sm font-medium">{formatDateLong(date)}</h3>
        {canMarkAll && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => onMarkAll(items)}>
            Mark everyone attended
          </Button>
        )}
      </div>
      <ul className="divide-y">
        {items.map((item) => (
          <BookingRow key={`${item.kind}:${item.bookingId}`} item={item} quarterId={quarterId} applicantNames={applicantNames} />
        ))}
      </ul>
    </section>
  );
}

export function AttendanceView({
  quarterId,
  data,
  applicantNames,
}: {
  quarterId: string;
  data: AttendanceData;
  applicantNames: Record<string, string>;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const byDate = new Map<string, AttendanceItem[]>();
  for (const item of data.toMark) byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);

  function markAll(items: AttendanceItem[]) {
    startTransition(async () => {
      let skipped = 0;
      for (const item of items) {
        const result = await markBookingAction({ quarterId, kind: item.kind, bookingId: item.bookingId, status: "attended" });
        if (result.error || result.needsPick) skipped++;
      }
      if (skipped > 0) toast.warning(`${skipped} need you to confirm who they are — mark those one by one.`);
      else toast.success("Everyone marked attended.");
      router.refresh();
    });
  }

  return (
    <div className="mt-4 space-y-5">
      {data.toMark.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <CircleCheck className="size-8 text-emerald-600" />
            <p className="font-medium">Nothing to mark right now</p>
            <p className="text-sm text-muted-foreground">
              Coffee chats and interviews show up here once they&apos;ve happened.
              {data.upcoming > 0 ? ` ${data.upcoming} more are coming up.` : ""}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Mark who showed up. Coffee chat points are given automatically (attended +1, no-show −1, excused 0); interviews only
            record attendance. Applicants are created for you if they aren&apos;t in the list yet.
          </p>
          {[...byDate.entries()].map(([date, items]) => (
            <DayGroup
              key={date}
              date={date}
              items={items}
              quarterId={quarterId}
              applicantNames={applicantNames}
              onMarkAll={markAll}
              canMarkAll={items.length > 1}
              isPending={isPending}
            />
          ))}
        </>
      )}

      {data.cancelled.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Cancelled by the applicant (counted as excused, no points)</h3>
          <ul className="divide-y rounded-xl border">
            {data.cancelled.map((item) => (
              <BookingRow key={`${item.kind}:${item.bookingId}`} item={item} quarterId={quarterId} applicantNames={applicantNames} />
            ))}
          </ul>
        </section>
      )}

      {data.marked.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Already marked</h3>
          <ul className="divide-y rounded-xl border">
            {data.marked.map((item) => (
              <BookingRow key={`${item.kind}:${item.bookingId}`} item={item} quarterId={quarterId} applicantNames={applicantNames} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire the tab, banner, and page**

`page.tsx`: add `getAttendanceData` to the `Promise.all` (import from `@/lib/data/recruit-import`) and pass `attendance={attendance}` to `ApplicantsWorkspace`.

`applicants-workspace.tsx`: add `attendance: AttendanceData` to props; build `const applicantNames = Object.fromEntries(rows.map((r) => [r.id, r.name]));`; add a tab `<TabsTrigger value="attendance">Attendance{attendance.toMark.length > 0 && <Badge variant="secondary">{attendance.toMark.length}</Badge>}</TabsTrigger>` and `<TabsContent value="attendance"><AttendanceView quarterId={quarterId} data={attendance} applicantNames={applicantNames} /></TabsContent>`; pass `toMarkCount={attendance.toMark.length}` and `onReviewAttendance={() => setTab("attendance")}` to `ApplicantsView`.

`applicants-view.tsx`: add the two props. Replace the single-purpose duplicates banner with a combined to-do banner shown when `duplicateCount > 0 || toMarkCount > 0`:

```tsx
      {(duplicateCount > 0 || toMarkCount > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
          <b>To do:</b>
          {toMarkCount > 0 && (
            <button type="button" className="underline-offset-2 hover:underline" onClick={onReviewAttendance}>
              {toMarkCount} booking{toMarkCount === 1 ? "" : "s"} to mark →
            </button>
          )}
          {duplicateCount > 0 && (
            <button type="button" className="underline-offset-2 hover:underline" onClick={onReviewDuplicates}>
              {duplicateCount} possible duplicate{duplicateCount === 1 ? "" : "s"} →
            </button>
          )}
        </div>
      )}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all pass.

Manual (after migration): with a past confirmed coffee chat booking for an email that matches an applicant → Attended marks it and adds +1; for a booking whose email is new → applicant created; for a fuzzy-name-only match → the "Is this one of these applicants?" prompt appears; No-show shows −1 with the default reason in the applicant history; changing the mark voids the old entry and adds a new one; Clear voids it and returns the booking to the queue; a cancelled booking appears under "Cancelled" with no actions; an interview mark creates no points.

- [ ] **Step 4: Commit**

```bash
git add "src/app/portal/(app)/admin/applicants"
git commit -m "Add attendance tab and to-do banner for booking links"
```

---

### Task 8: Final verification

- [ ] **Step 1: Full verification**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 2: Walk the Review Focus list**

Confirm each Review Focus item once by test or manual check (items 1–2 are covered by Task 2/3 unit tests; 3–5 need the migration applied — ask the user first).

- [ ] **Step 3: Commit nothing further** unless a fix was needed; report any unverified items (SQL not run, UI not exercised) in the hand-off.
