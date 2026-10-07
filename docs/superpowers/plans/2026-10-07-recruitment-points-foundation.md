# Recruitment Points — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship piece 1 of the recruitment points system: quarter-scoped applicants, duplicate detection and merge/undo, editable point categories and dated events, an append-only points ledger, and the Applicants admin page (leaderboard, side panel, setup, duplicates).

**Architecture:** New `recruit_*` Postgres tables (exec-only RLS, same pattern as `interview_*`) plus two SQL functions for transactional merge/undo. Pure, unit-tested logic lives in `src/lib/recruit.ts` and `src/lib/recruit-matching.ts`; reads in `src/lib/data/recruit.ts`; writes are `requireExec()` Server Actions in `src/actions/recruit.ts`. The UI is a client workspace under `src/app/portal/(app)/admin/applicants/` using the existing shadcn/base-ui components.

**Tech Stack:** Next.js (breaking-changes build — see constraints), Supabase (Postgres + RLS), TypeScript, Vitest, base-ui shadcn components, sonner toasts, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-07-recruitment-points-foundation-design.md`

## Global Constraints

- `AGENTS.md`: this Next.js version has breaking changes. Before writing any route/page/action code, skim the relevant guide in `node_modules/next/dist/docs/` and copy the patterns of existing files (`src/actions/interview.ts`, `src/app/portal/(app)/admin/interviews/page.tsx`) instead of relying on memory.
- All new tables: exec-only RLS via `public.is_exec()`; no anon policy.
- Migration filename: `supabase/migrations/20261007000001_recruitment_points.sql`.
- Server Actions return `{ error?: string }` instead of throwing; start with `requireExec()`; call `revalidatePath("/portal/admin/applicants")`.
- Ledger rows are never hard-deleted; voiding is the only removal. Totals are computed on read from rows where `voided_at is null`.
- Points are `numeric` (half points allowed); sums are rounded to 2 decimals.
- A negative point entry requires a non-empty reason.
- Applicants are quarter-scoped (`quarter_id`); categories are not.
- Matching never auto-merges or auto-accepts anything in piece 1.
- UI copy: plain verbs ("Give points", "Merge"), every empty state says what to do first, destructive actions say what happens and whether it can be undone.
- Commit messages: plain, **no `Co-Authored-By` / Claude attribution lines** (user preference, see project memory).
- Applying the migration to a hosted Supabase project is outward-facing: **ask the user** before running it against anything but a local database.
- Run `npm test`, `npx tsc --noEmit`, and `npm run lint` before the final commit.

## Review Focus

1. **Zoom-style display names** — `"Kim, Jessica (she/her)"`, `"Jessica Kim - iPhone"`, `"JOSÉ O'Brien"` must normalize so they match the stored `"Jessica Kim"` / `"Jose OBrien"` (Task 2 tests).
2. **Same name, different people** — two applicants with the identical name but different emails must be flagged only as `maybe` (never `likely`), and an exact email match must be a hard `duplicate`; `"Jessica Kim"` vs `"Jessica Kimball"` must not match at all (Task 2 tests).
3. **Merge when both have different emails** — refused until the exec picks which email to keep; undo restores both records and exactly the moved rows (Task 1 SQL, Task 3 `resolveMerge` tests, Task 9 UI).
4. **Archived category and negative points** — giving points to an archived category is rejected (action check + DB trigger); a −1 without a reason is rejected; `0.1 + 0.2` style float sums display as `0.3` (Task 3 tests, Task 5 action checks).
5. **No active quarter / empty quarter** — page renders an explanatory empty state instead of crashing; an empty applicant list shows the "add one or import" guidance (Task 6).

---

### Task 1: Migration and database types

**Files:**
- Create: `supabase/migrations/20261007000001_recruitment_points.sql`
- Modify: `src/lib/supabase/database.types.ts` (add tables inside `Tables`, functions inside `Functions`)

**Interfaces:**
- Produces: tables `recruit_applicants`, `recruit_applicant_aliases`, `recruit_categories`, `recruit_events`, `recruit_points`, `recruit_not_duplicates`, `recruit_merge_log`; functions `merge_recruit_applicants(p_survivor, p_absorbed, p_absorbed_alias, p_keep_email) → uuid` and `undo_merge_recruit_applicants(p_log_id) → void`.

Note vs. the spec: the merge function takes `p_absorbed_alias` (the app passes the normalized absorbed name, since SQL can't replicate JS normalization) and the log table also stores `added_alias_id` so undo can remove the alias the merge created.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20261007000001_recruitment_points.sql`:

```sql
-- Recruitment points system, piece 1 (foundation). See docs/superpowers/specs/
-- 2026-10-07-recruitment-points-foundation-design.md.
--
-- Exec-only everywhere: every table has one RLS policy gated on is_exec() and
-- there is deliberately no anon policy. Applicants never see any of this.

create table public.recruit_applicants (
  id uuid primary key default gen_random_uuid(),
  quarter_id uuid not null references public.quarters (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  email text,
  major text,
  year text,
  notes text not null default '',
  previous_applicant_id uuid references public.recruit_applicants (id) on delete set null,
  merged_into_id uuid references public.recruit_applicants (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recruit_applicants_email_normalized check (email is null or email = lower(btrim(email)))
);

-- One live applicant per email per quarter. Archived (merged) rows keep their
-- email but don't count, so a merge can hand the email to the survivor.
create unique index recruit_applicants_email_idx
  on public.recruit_applicants (quarter_id, email)
  where email is not null and archived_at is null;
create index recruit_applicants_quarter_idx on public.recruit_applicants (quarter_id);

alter table public.recruit_applicants enable row level security;
create policy recruit_applicants_all on public.recruit_applicants
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create trigger recruit_applicants_set_updated_at
  before update on public.recruit_applicants
  for each row execute procedure public.set_updated_at();

create table public.recruit_applicant_aliases (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.recruit_applicants (id) on delete cascade,
  quarter_id uuid not null references public.quarters (id) on delete cascade,
  alias text not null check (btrim(alias) <> ''),
  created_at timestamptz not null default now(),
  constraint recruit_applicant_aliases_unique unique (quarter_id, alias)
);
create index recruit_applicant_aliases_applicant_idx on public.recruit_applicant_aliases (applicant_id);

alter table public.recruit_applicant_aliases enable row level security;
create policy recruit_applicant_aliases_all on public.recruit_applicant_aliases
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

-- Not quarter-scoped: the category setup carries over every cycle.
create table public.recruit_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  section text not null check (section in ('engagement', 'resume', 'interview')),
  default_points numeric not null default 1,
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index recruit_categories_name_idx on public.recruit_categories (lower(btrim(name)));

alter table public.recruit_categories enable row level security;
create policy recruit_categories_all on public.recruit_categories
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

insert into public.recruit_categories (name, section, default_points, sort_order) values
  ('Info Session', 'engagement', 1, 10),
  ('Coffee Chat Attended', 'engagement', 1, 20),
  ('Coffee Chat No-show', 'engagement', -1, 30),
  ('Coffee Chat Excused', 'engagement', 0, 40)
on conflict do nothing;

create table public.recruit_events (
  id uuid primary key default gen_random_uuid(),
  quarter_id uuid not null references public.quarters (id) on delete cascade,
  category_id uuid not null references public.recruit_categories (id),
  name text not null check (btrim(name) <> ''),
  date date not null,
  created_at timestamptz not null default now()
);
create index recruit_events_quarter_idx on public.recruit_events (quarter_id, date);

alter table public.recruit_events enable row level security;
create policy recruit_events_all on public.recruit_events
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

-- Append-only ledger. Never hard-deleted: voiding is the only removal.
create table public.recruit_points (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.recruit_applicants (id),
  category_id uuid not null references public.recruit_categories (id),
  event_id uuid references public.recruit_events (id),
  points numeric not null,
  reason text,
  source text not null default 'manual' check (source in ('manual', 'import', 'booking')),
  batch_id uuid,
  awarded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  void_reason text
);
create index recruit_points_applicant_idx on public.recruit_points (applicant_id);
create index recruit_points_batch_idx on public.recruit_points (batch_id) where batch_id is not null;

alter table public.recruit_points enable row level security;
create policy recruit_points_all on public.recruit_points
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create or replace function public.recruit_points_check_category()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.recruit_categories where id = new.category_id and archived_at is not null) then
    raise exception 'That category is archived.';
  end if;
  return new;
end;
$$;

create trigger recruit_points_check_category
  before insert on public.recruit_points
  for each row execute procedure public.recruit_points_check_category();

-- "Not the same person" dismissals, stored as an ordered pair (a < b).
create table public.recruit_not_duplicates (
  applicant_a uuid not null references public.recruit_applicants (id) on delete cascade,
  applicant_b uuid not null references public.recruit_applicants (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (applicant_a, applicant_b),
  constraint recruit_not_duplicates_ordered check (applicant_a < applicant_b)
);

alter table public.recruit_not_duplicates enable row level security;
create policy recruit_not_duplicates_all on public.recruit_not_duplicates
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create table public.recruit_merge_log (
  id uuid primary key default gen_random_uuid(),
  survivor_id uuid not null references public.recruit_applicants (id) on delete cascade,
  absorbed_id uuid not null references public.recruit_applicants (id) on delete cascade,
  moved_point_ids uuid[] not null default '{}',
  moved_alias_ids uuid[] not null default '{}',
  added_alias_id uuid,
  survivor_before jsonb not null,
  created_at timestamptz not null default now(),
  undone_at timestamptz
);

alter table public.recruit_merge_log enable row level security;
create policy recruit_merge_log_all on public.recruit_merge_log
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

-- Merge `p_absorbed` into `p_survivor` in one transaction. Returns the log id.
create or replace function public.merge_recruit_applicants(
  p_survivor uuid,
  p_absorbed uuid,
  p_absorbed_alias text default null,
  p_keep_email text default null
)
returns uuid
language plpgsql
as $$
declare
  s public.recruit_applicants;
  a public.recruit_applicants;
  new_email text;
  new_notes text;
  moved_points uuid[];
  moved_aliases uuid[];
  added_alias uuid;
  log_id uuid;
begin
  if not public.is_exec() then
    raise exception 'Only exec can merge applicants.';
  end if;
  if p_survivor = p_absorbed then
    raise exception 'Pick two different applicants.';
  end if;

  select * into s from public.recruit_applicants where id = p_survivor for update;
  select * into a from public.recruit_applicants where id = p_absorbed for update;
  if s.id is null or a.id is null then
    raise exception 'Applicant not found.';
  end if;
  if s.quarter_id <> a.quarter_id then
    raise exception 'Those applicants are in different quarters.';
  end if;
  if s.archived_at is not null or a.archived_at is not null then
    raise exception 'An archived applicant cannot be merged.';
  end if;

  if s.email is not null and a.email is not null and s.email <> a.email then
    if p_keep_email is null or p_keep_email not in (s.email, a.email) then
      raise exception 'Both applicants have different emails; choose which one to keep.';
    end if;
    new_email := p_keep_email;
  else
    new_email := coalesce(s.email, a.email);
  end if;

  new_notes := case
    when btrim(s.notes) = '' then a.notes
    when btrim(a.notes) = '' then s.notes
    else s.notes || E'\n\n' || a.notes
  end;

  insert into public.recruit_merge_log (survivor_id, absorbed_id, survivor_before)
  values (
    p_survivor, p_absorbed,
    jsonb_build_object('email', s.email, 'major', s.major, 'year', s.year, 'notes', s.notes)
  )
  returning id into log_id;

  -- Archive first so the absorbed row releases its email before the survivor takes it.
  update public.recruit_applicants
    set archived_at = now(), merged_into_id = p_survivor
    where id = p_absorbed;

  select coalesce(array_agg(id), '{}') into moved_points
    from public.recruit_points where applicant_id = p_absorbed;
  update public.recruit_points set applicant_id = p_survivor where applicant_id = p_absorbed;

  select coalesce(array_agg(id), '{}') into moved_aliases
    from public.recruit_applicant_aliases where applicant_id = p_absorbed;
  update public.recruit_applicant_aliases set applicant_id = p_survivor where applicant_id = p_absorbed;

  if p_absorbed_alias is not null and btrim(p_absorbed_alias) <> '' then
    insert into public.recruit_applicant_aliases (applicant_id, quarter_id, alias)
    values (p_survivor, s.quarter_id, p_absorbed_alias)
    on conflict (quarter_id, alias) do nothing
    returning id into added_alias;
  end if;

  update public.recruit_applicants
    set email = new_email,
        major = coalesce(s.major, a.major),
        year = coalesce(s.year, a.year),
        notes = new_notes
    where id = p_survivor;

  update public.recruit_merge_log
    set moved_point_ids = moved_points,
        moved_alias_ids = moved_aliases,
        added_alias_id = added_alias
    where id = log_id;

  return log_id;
end;
$$;

-- Reverse a merge: restore the survivor's old fields, un-archive the absorbed
-- record, and move back exactly the rows the merge moved.
create or replace function public.undo_merge_recruit_applicants(p_log_id uuid)
returns void
language plpgsql
as $$
declare
  l public.recruit_merge_log;
  s public.recruit_applicants;
begin
  if not public.is_exec() then
    raise exception 'Only exec can undo a merge.';
  end if;

  select * into l from public.recruit_merge_log where id = p_log_id for update;
  if l.id is null then
    raise exception 'Merge not found.';
  end if;
  if l.undone_at is not null then
    raise exception 'That merge was already undone.';
  end if;

  select * into s from public.recruit_applicants where id = l.survivor_id for update;
  if s.archived_at is not null then
    raise exception 'The surviving applicant was merged into someone else; undo that merge first.';
  end if;

  update public.recruit_applicants
    set email = l.survivor_before ->> 'email',
        major = l.survivor_before ->> 'major',
        year = l.survivor_before ->> 'year',
        notes = coalesce(l.survivor_before ->> 'notes', '')
    where id = l.survivor_id;

  update public.recruit_applicants
    set archived_at = null, merged_into_id = null
    where id = l.absorbed_id;

  update public.recruit_points set applicant_id = l.absorbed_id where id = any (l.moved_point_ids);
  update public.recruit_applicant_aliases set applicant_id = l.absorbed_id where id = any (l.moved_alias_ids);

  if l.added_alias_id is not null then
    delete from public.recruit_applicant_aliases where id = l.added_alias_id;
  end if;

  update public.recruit_merge_log set undone_at = now() where id = p_log_id;
end;
$$;
```

- [ ] **Step 2: Add the table and function types**

In `src/lib/supabase/database.types.ts`, inside `Tables: { ... }` (next to the `interview_*` entries) add:

```ts
      recruit_applicants: {
        Row: {
          id: string;
          quarter_id: string;
          name: string;
          email: string | null;
          major: string | null;
          year: string | null;
          notes: string;
          previous_applicant_id: string | null;
          merged_into_id: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          quarter_id: string;
          name: string;
          email?: string | null;
          major?: string | null;
          year?: string | null;
          notes?: string;
          previous_applicant_id?: string | null;
          merged_into_id?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["recruit_applicants"]["Insert"]>;
        Relationships: [];
      };
      recruit_applicant_aliases: {
        Row: { id: string; applicant_id: string; quarter_id: string; alias: string; created_at: string };
        Insert: { id?: string; applicant_id: string; quarter_id: string; alias: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["recruit_applicant_aliases"]["Insert"]>;
        Relationships: [];
      };
      recruit_categories: {
        Row: {
          id: string;
          name: string;
          section: "engagement" | "resume" | "interview";
          default_points: number;
          sort_order: number;
          archived_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          section: "engagement" | "resume" | "interview";
          default_points?: number;
          sort_order?: number;
          archived_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["recruit_categories"]["Insert"]>;
        Relationships: [];
      };
      recruit_events: {
        Row: { id: string; quarter_id: string; category_id: string; name: string; date: string; created_at: string };
        Insert: { id?: string; quarter_id: string; category_id: string; name: string; date: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["recruit_events"]["Insert"]>;
        Relationships: [];
      };
      recruit_points: {
        Row: {
          id: string;
          applicant_id: string;
          category_id: string;
          event_id: string | null;
          points: number;
          reason: string | null;
          source: "manual" | "import" | "booking";
          batch_id: string | null;
          awarded_by: string | null;
          created_at: string;
          voided_at: string | null;
          voided_by: string | null;
          void_reason: string | null;
        };
        Insert: {
          id?: string;
          applicant_id: string;
          category_id: string;
          event_id?: string | null;
          points: number;
          reason?: string | null;
          source?: "manual" | "import" | "booking";
          batch_id?: string | null;
          awarded_by?: string | null;
          created_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["recruit_points"]["Insert"]>;
        Relationships: [];
      };
      recruit_not_duplicates: {
        Row: { applicant_a: string; applicant_b: string; created_at: string };
        Insert: { applicant_a: string; applicant_b: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["recruit_not_duplicates"]["Insert"]>;
        Relationships: [];
      };
      recruit_merge_log: {
        Row: {
          id: string;
          survivor_id: string;
          absorbed_id: string;
          moved_point_ids: string[];
          moved_alias_ids: string[];
          added_alias_id: string | null;
          survivor_before: Record<string, string | null>;
          created_at: string;
          undone_at: string | null;
        };
        Insert: {
          id?: string;
          survivor_id: string;
          absorbed_id: string;
          moved_point_ids?: string[];
          moved_alias_ids?: string[];
          added_alias_id?: string | null;
          survivor_before: Record<string, string | null>;
          created_at?: string;
          undone_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["recruit_merge_log"]["Insert"]>;
        Relationships: [];
      };
```

Inside `Functions: { ... }` add:

```ts
      merge_recruit_applicants: {
        Args: { p_survivor: string; p_absorbed: string; p_absorbed_alias?: string | null; p_keep_email?: string | null };
        Returns: string;
      };
      undo_merge_recruit_applicants: {
        Args: { p_log_id: string };
        Returns: unknown;
      };
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Apply and smoke-test the migration (only after asking the user which database to use)**

Ask the user whether to apply to a local Supabase (`supabase db reset` / `supabase db push`) or leave applying to them. If applied, run in the SQL editor / `psql`:

```sql
select name, default_points from public.recruit_categories order by sort_order;
```
Expected: the four seeded categories (Info Session 1, Coffee Chat Attended 1, Coffee Chat No-show -1, Coffee Chat Excused 0).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261007000001_recruitment_points.sql src/lib/supabase/database.types.ts
git commit -m "Add recruitment points tables, merge functions and types"
```

---

### Task 2: Name matching (pure logic, TDD)

**Files:**
- Create: `src/lib/recruit-matching.ts`
- Test: `src/lib/recruit-matching.test.ts`

**Interfaces:**
- Produces (all exported from `src/lib/recruit-matching.ts`):
  - `MAYBE_MIN_SCORE = 75`
  - `normalizeName(raw: string): string`
  - `nameSimilarity(a: string, b: string): number` — inputs already normalized, returns 0–100
  - `type MatchClass = "duplicate" | "likely" | "maybe"`
  - `type MatchReason = "email" | "name" | "alias" | "fuzzy"`
  - `interface MatchableApplicant { id: string; name: string; email: string | null; aliases: string[] }`
  - `interface MatchCandidate { applicantId: string; score: number; kind: MatchClass; reason: MatchReason }`
  - `findMatches(input: { name: string; email?: string | null }, existing: MatchableApplicant[]): MatchCandidate[]` — sorted best first
  - `pairKey(a: string, b: string): string`
  - `interface DuplicatePair { a: string; b: string; score: number; kind: MatchClass; reason: MatchReason }`
  - `findDuplicatePairs(applicants: MatchableApplicant[], dismissed: Set<string>): DuplicatePair[]` — sorted best first, skipping dismissed pair keys

- [ ] **Step 1: Write the failing tests**

Create `src/lib/recruit-matching.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  findDuplicatePairs,
  findMatches,
  MAYBE_MIN_SCORE,
  nameSimilarity,
  normalizeName,
  pairKey,
  type MatchableApplicant,
} from "./recruit-matching";

const person = (id: string, name: string, email: string | null = null, aliases: string[] = []): MatchableApplicant => ({
  id,
  name,
  email,
  aliases,
});

describe("normalizeName", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeName("  Jessica   KIM ")).toBe("jessica kim");
  });
  it("flips Last, First", () => {
    expect(normalizeName("Kim, Jessica")).toBe("jessica kim");
  });
  it("strips pronoun parentheticals", () => {
    expect(normalizeName("Jessica Kim (she/her)")).toBe("jessica kim");
    expect(normalizeName("Kim, Jessica (she/her)")).toBe("jessica kim");
  });
  it("strips a ' - device' Zoom suffix", () => {
    expect(normalizeName("Jessica Kim - iPhone")).toBe("jessica kim");
  });
  it("strips diacritics and apostrophes", () => {
    expect(normalizeName("JOSÉ O'Brien")).toBe("jose obrien");
  });
  it("treats hyphens in names as spaces", () => {
    expect(normalizeName("Mary-Jane Watson")).toBe("mary jane watson");
  });
  it("returns an empty string for junk", () => {
    expect(normalizeName("  ")).toBe("");
  });
});

describe("nameSimilarity", () => {
  it("is 100 for identical normalized names", () => {
    expect(nameSimilarity("jessica kim", "jessica kim")).toBe(100);
  });
  it("matches a nickname plus last initial to the full name", () => {
    expect(nameSimilarity("jess k", "jessica kim")).toBeGreaterThanOrEqual(MAYBE_MIN_SCORE);
  });
  it("matches a reordered name", () => {
    expect(nameSimilarity("kim jessica", "jessica kim")).toBeGreaterThanOrEqual(MAYBE_MIN_SCORE);
  });
  it("matches a one-letter typo in a long name", () => {
    expect(nameSimilarity("priya natarajan", "priya natarajn")).toBeGreaterThanOrEqual(MAYBE_MIN_SCORE);
  });
  it("keeps Jessica Kim and Jessica Kimball apart", () => {
    expect(nameSimilarity("jessica kim", "jessica kimball")).toBeLessThan(MAYBE_MIN_SCORE);
  });
  it("keeps different last names with the same first name apart", () => {
    expect(nameSimilarity("priya natarajan", "priya nair")).toBeLessThan(MAYBE_MIN_SCORE);
  });
  it("does not match a lone first name", () => {
    expect(nameSimilarity("jess", "jessica kim")).toBeLessThan(MAYBE_MIN_SCORE);
  });
  it("is 0 when either side is empty", () => {
    expect(nameSimilarity("", "jessica kim")).toBe(0);
  });
});

describe("findMatches", () => {
  const existing = [
    person("1", "Jessica Kim", "jkim@ucsc.edu"),
    person("2", "Daniel Ortiz", null, ["danny ortiz"]),
    person("3", "Aisha Rahman", "arahman@ucsc.edu"),
  ];

  it("flags an exact email as a hard duplicate regardless of name", () => {
    const [top] = findMatches({ name: "Totally Different", email: "JKim@ucsc.edu " }, existing);
    expect(top).toMatchObject({ applicantId: "1", kind: "duplicate", reason: "email", score: 100 });
  });

  it("flags an exact normalized name as likely", () => {
    const [top] = findMatches({ name: "Kim, Jessica (she/her)" }, existing);
    expect(top).toMatchObject({ applicantId: "1", kind: "likely", reason: "name", score: 100 });
  });

  it("matches through a saved alias", () => {
    const [top] = findMatches({ name: "Danny Ortiz" }, existing);
    expect(top).toMatchObject({ applicantId: "2", kind: "likely", reason: "alias" });
  });

  it("downgrades an identical name with a different email to maybe", () => {
    const [top] = findMatches({ name: "Jessica Kim", email: "other@ucsc.edu" }, existing);
    expect(top.kind).toBe("maybe");
    expect(top.score).toBeLessThan(100);
  });

  it("flags fuzzy matches as maybe", () => {
    const [top] = findMatches({ name: "Jess K." }, existing);
    expect(top).toMatchObject({ applicantId: "1", kind: "maybe", reason: "fuzzy" });
  });

  it("returns nothing for a genuinely new person", () => {
    expect(findMatches({ name: "Marcus Lee" }, existing)).toEqual([]);
  });

  it("returns nothing for a blank name and no email", () => {
    expect(findMatches({ name: "  " }, existing)).toEqual([]);
  });

  it("sorts best match first", () => {
    const list = [person("a", "Jessica Kimm"), person("b", "Jessica Kim")];
    const result = findMatches({ name: "Jessica Kim" }, list);
    expect(result.map((r) => r.applicantId)).toEqual(["b", "a"]);
  });
});

describe("findDuplicatePairs", () => {
  const list = [
    person("a", "Jessica Kim", "jkim@ucsc.edu"),
    person("b", "Jess K."),
    person("c", "Marcus Lee"),
  ];

  it("finds suspected pairs", () => {
    const pairs = findDuplicatePairs(list, new Set());
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ kind: "maybe" });
    expect([pairs[0].a, pairs[0].b].sort()).toEqual(["a", "b"]);
  });

  it("skips pairs the exec marked as not the same", () => {
    expect(findDuplicatePairs(list, new Set([pairKey("b", "a")]))).toEqual([]);
  });
});

describe("pairKey", () => {
  it("is order-independent", () => {
    expect(pairKey("x", "y")).toBe(pairKey("y", "x"));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/recruit-matching.test.ts`
Expected: FAIL — cannot resolve `./recruit-matching`.

- [ ] **Step 3: Implement**

Create `src/lib/recruit-matching.ts`:

```ts
/** Below this score two names are treated as different people. */
export const MAYBE_MIN_SCORE = 75;

export type MatchClass = "duplicate" | "likely" | "maybe";
export type MatchReason = "email" | "name" | "alias" | "fuzzy";

export interface MatchableApplicant {
  id: string;
  name: string;
  email: string | null;
  aliases: string[];
}

export interface MatchCandidate {
  applicantId: string;
  score: number;
  kind: MatchClass;
  reason: MatchReason;
}

export interface DuplicatePair {
  a: string;
  b: string;
  score: number;
  kind: MatchClass;
  reason: MatchReason;
}

/** Lowercase, de-accent, drop pronouns/device suffixes, flip "Last, First", keep letters and single spaces only. */
export function normalizeName(raw: string): string {
  let s = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/\s+-\s+.*$/, " ");
  if (/^[^,]+,[^,]+$/.test(s)) {
    const [last, first] = s.split(",");
    s = `${first} ${last}`;
  }
  s = s.replace(/['’`]/g, "");
  s = s.replace(/[^a-z\s]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = temp;
    }
  }
  return prev[b.length];
}

// First names allow nicknames ("jess" ~ "jessica"); last names do not, so
// "kim" never matches "kimball".
function firstNameScore(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 1 || b.length === 1) return a[0] === b[0] ? 0.8 : 0;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 3 && long.startsWith(short)) return 0.85;
  if (Math.min(a.length, b.length) >= 4 && editDistance(a, b) === 1) return 0.9;
  return 0;
}

function lastNameScore(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 1 || b.length === 1) return a[0] === b[0] ? 0.8 : 0;
  const shortest = Math.min(a.length, b.length);
  const d = editDistance(a, b);
  if (d === 1 && shortest >= 4) return 0.9;
  if (d === 2 && shortest >= 8) return 0.8;
  return 0;
}

/** Similarity 0–100 between two already-normalized names. */
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 100;
  const ta = a.split(" ");
  const tb = b.split(" ");
  if (ta.length === 1 || tb.length === 1) {
    return Math.round(Math.min(firstNameScore(ta[0], tb[0]), 0.6) * 100);
  }
  const direct = (firstNameScore(ta[0], tb[0]) + lastNameScore(ta[ta.length - 1], tb[tb.length - 1])) / 2;
  const swapped = (firstNameScore(ta[0], tb[tb.length - 1]) + lastNameScore(ta[ta.length - 1], tb[0])) / 2;
  return Math.round(Math.max(direct, swapped) * 100);
}

function normalizeEmail(email: string | null | undefined): string | null {
  const e = email?.trim().toLowerCase();
  return e ? e : null;
}

interface Comparable {
  names: string[]; // normalized; names[0] is the applicant's own name, the rest are aliases
  email: string | null;
}

function compare(a: Comparable, b: Comparable): Omit<MatchCandidate, "applicantId"> | null {
  if (a.email && b.email && a.email === b.email) {
    return { score: 100, kind: "duplicate", reason: "email" };
  }
  const emailsConflict = !!a.email && !!b.email && a.email !== b.email;

  let best = 0;
  let viaAlias = false;
  for (const an of a.names) {
    b.names.forEach((bn, j) => {
      const s = nameSimilarity(an, bn);
      if (s > best) {
        best = s;
        viaAlias = j > 0;
      }
    });
  }

  if (best === 100) {
    if (emailsConflict) return { score: 90, kind: "maybe", reason: "name" };
    return { score: 100, kind: "likely", reason: viaAlias ? "alias" : "name" };
  }
  if (best >= MAYBE_MIN_SCORE) return { score: best, kind: "maybe", reason: "fuzzy" };
  return null;
}

function toComparable(a: { name: string; email: string | null; aliases?: string[] }): Comparable {
  return {
    names: [normalizeName(a.name), ...(a.aliases ?? []).map(normalizeName)].filter(Boolean),
    email: normalizeEmail(a.email),
  };
}

const KIND_ORDER: Record<MatchClass, number> = { duplicate: 0, likely: 1, maybe: 2 };

function bySeverity(
  x: { score: number; kind: MatchClass },
  y: { score: number; kind: MatchClass },
): number {
  return y.score - x.score || KIND_ORDER[x.kind] - KIND_ORDER[y.kind];
}

/** Who in `existing` might be the person described by `input`, best match first. */
export function findMatches(
  input: { name: string; email?: string | null },
  existing: MatchableApplicant[],
): MatchCandidate[] {
  const probe = toComparable({ name: input.name, email: input.email ?? null });
  if (probe.names.length === 0 && !probe.email) return [];

  const out: MatchCandidate[] = [];
  for (const ap of existing) {
    const result = compare(probe, toComparable(ap));
    if (result) out.push({ applicantId: ap.id, ...result });
  }
  return out.sort(bySeverity);
}

export function pairKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

/** Every suspected duplicate pair in `applicants`, minus pairs an exec dismissed. */
export function findDuplicatePairs(applicants: MatchableApplicant[], dismissed: Set<string>): DuplicatePair[] {
  const comparables = applicants.map(toComparable);
  const out: DuplicatePair[] = [];
  for (let i = 0; i < applicants.length; i++) {
    for (let j = i + 1; j < applicants.length; j++) {
      if (dismissed.has(pairKey(applicants[i].id, applicants[j].id))) continue;
      const result = compare(comparables[i], comparables[j]);
      if (result) out.push({ a: applicants[i].id, b: applicants[j].id, ...result });
    }
  }
  return out.sort(bySeverity);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/recruit-matching.test.ts`
Expected: all tests PASS. If one fails, fix the implementation (not the test) unless the test contradicts the spec.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recruit-matching.ts src/lib/recruit-matching.test.ts
git commit -m "Add applicant name matching and duplicate detection"
```

---

### Task 3: Ledger and merge logic (pure logic, TDD)

**Files:**
- Create: `src/lib/recruit.ts`
- Test: `src/lib/recruit.test.ts`

**Interfaces:**
- Produces (exported from `src/lib/recruit.ts`):
  - `type RecruitSection = "engagement" | "resume" | "interview"`
  - `RECRUIT_SECTIONS: { value: RecruitSection; label: string }[]`
  - `roundPoints(n: number): number`
  - `sumPoints(entries: { points: number; voidedAt: string | null }[]): number`
  - `formatPoints(n: number): string` — `"+1"`, `"-1"`, `"0"`, `"+0.5"`
  - `validateAward(input: { points: number; reason?: string | null }): string | null`
  - `normalizeApplicantEmail(raw?: string | null): string | null`
  - `isPlausibleEmail(email: string): boolean`
  - `interface MergeSide { email: string | null; major: string | null; year: string | null; notes: string }`
  - `needsEmailChoice(survivor: MergeSide, absorbed: MergeSide): boolean`
  - `resolveMerge(survivor: MergeSide, absorbed: MergeSide, keepEmail?: string | null): { ok: true; merged: MergeSide } | { ok: false; error: string }`
  - `rankByTotal<T extends { id: string; name: string; total: number }>(rows: T[]): (T & { rank: number })[]` — ties share a rank
  - `ringFraction(total: number, max: number): number` — clamped 0..1

- [ ] **Step 1: Write the failing tests**

Create `src/lib/recruit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  formatPoints,
  isPlausibleEmail,
  needsEmailChoice,
  normalizeApplicantEmail,
  rankByTotal,
  resolveMerge,
  ringFraction,
  roundPoints,
  sumPoints,
  validateAward,
  type MergeSide,
} from "./recruit";

describe("sumPoints", () => {
  it("adds entries and ignores voided ones", () => {
    expect(
      sumPoints([
        { points: 1, voidedAt: null },
        { points: 1, voidedAt: null },
        { points: 5, voidedAt: "2026-10-01T00:00:00Z" },
      ]),
    ).toBe(2);
  });
  it("handles negatives", () => {
    expect(sumPoints([{ points: 1, voidedAt: null }, { points: -1, voidedAt: null }])).toBe(0);
  });
  it("does not leak float error", () => {
    expect(sumPoints([{ points: 0.1, voidedAt: null }, { points: 0.2, voidedAt: null }])).toBe(0.3);
  });
  it("is 0 for no entries", () => {
    expect(sumPoints([])).toBe(0);
  });
});

describe("roundPoints / formatPoints", () => {
  it("rounds to two decimals", () => {
    expect(roundPoints(0.30000000000000004)).toBe(0.3);
  });
  it("formats signs", () => {
    expect(formatPoints(1)).toBe("+1");
    expect(formatPoints(-1)).toBe("-1");
    expect(formatPoints(0)).toBe("0");
    expect(formatPoints(0.5)).toBe("+0.5");
  });
});

describe("validateAward", () => {
  it("accepts positive points without a reason", () => {
    expect(validateAward({ points: 1 })).toBeNull();
  });
  it("accepts zero (excused)", () => {
    expect(validateAward({ points: 0 })).toBeNull();
  });
  it("requires a reason for negative points", () => {
    expect(validateAward({ points: -1 })).toMatch(/reason/i);
    expect(validateAward({ points: -1, reason: "   " })).toMatch(/reason/i);
    expect(validateAward({ points: -1, reason: "No-show, no word" })).toBeNull();
  });
  it("rejects non-finite numbers", () => {
    expect(validateAward({ points: Number.NaN })).toMatch(/number/i);
    expect(validateAward({ points: Number.POSITIVE_INFINITY })).toMatch(/number/i);
  });
});

describe("email helpers", () => {
  it("normalizes and blanks", () => {
    expect(normalizeApplicantEmail("  JKim@UCSC.edu ")).toBe("jkim@ucsc.edu");
    expect(normalizeApplicantEmail("   ")).toBeNull();
    expect(normalizeApplicantEmail(null)).toBeNull();
  });
  it("checks plausibility", () => {
    expect(isPlausibleEmail("a@b.co")).toBe(true);
    expect(isPlausibleEmail("not-an-email")).toBe(false);
    expect(isPlausibleEmail("a@b")).toBe(false);
  });
});

const side = (over: Partial<MergeSide> = {}): MergeSide => ({
  email: null,
  major: null,
  year: null,
  notes: "",
  ...over,
});

describe("resolveMerge", () => {
  it("fills the survivor's gaps from the absorbed record", () => {
    const r = resolveMerge(side({ major: "Econ" }), side({ email: "a@ucsc.edu", major: "Math", year: "2028" }));
    expect(r).toEqual({ ok: true, merged: side({ email: "a@ucsc.edu", major: "Econ", year: "2028" }) });
  });
  it("appends notes when both have some", () => {
    const r = resolveMerge(side({ notes: "Great energy" }), side({ notes: "Asked about PM role" }));
    expect(r.ok && r.merged.notes).toBe("Great energy\n\nAsked about PM role");
  });
  it("keeps whichever side has notes when only one does", () => {
    const r = resolveMerge(side(), side({ notes: "Only here" }));
    expect(r.ok && r.merged.notes).toBe("Only here");
  });
  it("refuses when both have different emails and no choice was made", () => {
    const s = side({ email: "a@ucsc.edu" });
    const a = side({ email: "b@ucsc.edu" });
    expect(needsEmailChoice(s, a)).toBe(true);
    expect(resolveMerge(s, a)).toMatchObject({ ok: false });
  });
  it("accepts a valid email choice", () => {
    const r = resolveMerge(side({ email: "a@ucsc.edu" }), side({ email: "b@ucsc.edu" }), "b@ucsc.edu");
    expect(r.ok && r.merged.email).toBe("b@ucsc.edu");
  });
  it("rejects an email choice that is neither record's email", () => {
    expect(resolveMerge(side({ email: "a@ucsc.edu" }), side({ email: "b@ucsc.edu" }), "c@ucsc.edu")).toMatchObject({
      ok: false,
    });
  });
  it("does not need a choice when emails match or one is missing", () => {
    expect(needsEmailChoice(side({ email: "a@ucsc.edu" }), side({ email: "a@ucsc.edu" }))).toBe(false);
    expect(needsEmailChoice(side({ email: "a@ucsc.edu" }), side())).toBe(false);
  });
});

describe("rankByTotal", () => {
  it("ranks by total desc then name, with ties sharing a rank", () => {
    const ranked = rankByTotal([
      { id: "1", name: "Zed", total: 3 },
      { id: "2", name: "Amy", total: 5 },
      { id: "3", name: "Bob", total: 3 },
    ]);
    expect(ranked.map((r) => [r.name, r.rank])).toEqual([
      ["Amy", 1],
      ["Bob", 2],
      ["Zed", 2],
    ]);
  });
});

describe("ringFraction", () => {
  it("scales against the max and clamps", () => {
    expect(ringFraction(5, 10)).toBe(0.5);
    expect(ringFraction(-2, 10)).toBe(0);
    expect(ringFraction(20, 10)).toBe(1);
  });
  it("is 0 when nobody has points", () => {
    expect(ringFraction(0, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/recruit.test.ts`
Expected: FAIL — cannot resolve `./recruit`.

- [ ] **Step 3: Implement**

Create `src/lib/recruit.ts`:

```ts
export type RecruitSection = "engagement" | "resume" | "interview";

export const RECRUIT_SECTIONS: { value: RecruitSection; label: string }[] = [
  { value: "engagement", label: "Engagement" },
  { value: "resume", label: "Resume / written app" },
  { value: "interview", label: "Interview" },
];

export function roundPoints(n: number): number {
  return Math.round(n * 100) / 100;
}

export function sumPoints(entries: { points: number; voidedAt: string | null }[]): number {
  return roundPoints(entries.reduce((sum, e) => (e.voidedAt ? sum : sum + e.points), 0));
}

export function formatPoints(n: number): string {
  const r = roundPoints(n);
  return r > 0 ? `+${r}` : String(r);
}

/** Returns an error message, or null when the entry is fine to save. */
export function validateAward(input: { points: number; reason?: string | null }): string | null {
  if (!Number.isFinite(input.points)) return "Enter the points as a number.";
  if (input.points < 0 && !input.reason?.trim()) return "Add a reason when giving negative points.";
  return null;
}

export function normalizeApplicantEmail(raw?: string | null): string | null {
  const e = raw?.trim().toLowerCase();
  return e ? e : null;
}

export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export interface MergeSide {
  email: string | null;
  major: string | null;
  year: string | null;
  notes: string;
}

export function needsEmailChoice(survivor: MergeSide, absorbed: MergeSide): boolean {
  return !!survivor.email && !!absorbed.email && survivor.email !== absorbed.email;
}

/** Mirrors `merge_recruit_applicants` in SQL; used to preview a merge and to validate before calling it. */
export function resolveMerge(
  survivor: MergeSide,
  absorbed: MergeSide,
  keepEmail?: string | null,
): { ok: true; merged: MergeSide } | { ok: false; error: string } {
  let email = survivor.email ?? absorbed.email;
  if (needsEmailChoice(survivor, absorbed)) {
    if (!keepEmail) return { ok: false, error: "Both applicants have different emails — choose which one to keep." };
    if (keepEmail !== survivor.email && keepEmail !== absorbed.email) {
      return { ok: false, error: "The email to keep must be one of the two records' emails." };
    }
    email = keepEmail;
  }

  const sNotes = survivor.notes.trim();
  const aNotes = absorbed.notes.trim();
  const notes = !sNotes ? absorbed.notes : !aNotes ? survivor.notes : `${survivor.notes}\n\n${absorbed.notes}`;

  return {
    ok: true,
    merged: {
      email,
      major: survivor.major ?? absorbed.major,
      year: survivor.year ?? absorbed.year,
      notes,
    },
  };
}

/** Sorts by total (desc) then name; applicants with equal totals share a rank. */
export function rankByTotal<T extends { id: string; name: string; total: number }>(
  rows: T[],
): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  let rank = 0;
  let lastTotal: number | null = null;
  return sorted.map((row, i) => {
    if (row.total !== lastTotal) {
      rank = i + 1;
      lastTotal = row.total;
    }
    return { ...row, rank };
  });
}

export function ringFraction(total: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, total / max));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/recruit.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recruit.ts src/lib/recruit.test.ts
git commit -m "Add recruitment ledger totals, ranking and merge resolution logic"
```

---

### Task 4: Data layer

**Files:**
- Create: `src/lib/data/recruit.ts`

**Interfaces:**
- Consumes: `sumPoints`, `RecruitSection` from `@/lib/recruit`; `MatchableApplicant`, `pairKey` from `@/lib/recruit-matching`; `fetchAllPages` from `@/lib/paginate`; `getQuarters` from `@/lib/data/quarters`.
- Produces (exported):
  - `interface RecruitCategory { id: string; name: string; section: RecruitSection; defaultPoints: number; sortOrder: number; archived: boolean }`
  - `interface RecruitEvent { id: string; quarterId: string; categoryId: string; name: string; date: string }`
  - `interface PointEntry { id: string; categoryId: string; categoryName: string; eventId: string | null; eventName: string | null; points: number; reason: string | null; source: "manual" | "import" | "booking"; awardedByName: string | null; createdAt: string; voidedAt: string | null; voidReason: string | null }`
  - `interface ApplicantRow { id: string; quarterId: string; name: string; email: string | null; major: string | null; year: string | null; notes: string; hasPrevious: boolean; previousQuarterName: string | null; aliases: string[]; entries: PointEntry[]; total: number }`
  - `interface MergeLogRow { id: string; survivorName: string; absorbedName: string; createdAt: string }`
  - `getRecruitCategories(): Promise<RecruitCategory[]>`
  - `getRecruitEvents(quarterId: string): Promise<RecruitEvent[]>`
  - `getApplicantRows(quarterId: string): Promise<ApplicantRow[]>`
  - `getMatchableApplicants(quarterId: string): Promise<MatchableApplicant[]>`
  - `getDismissedPairKeys(): Promise<Set<string>>`
  - `getRecentMerges(quarterId: string): Promise<MergeLogRow[]>`

- [ ] **Step 1: Write the data layer**

Create `src/lib/data/recruit.ts`:

```ts
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/paginate";
import { getQuarters } from "@/lib/data/quarters";
import { sumPoints, type RecruitSection } from "@/lib/recruit";
import { pairKey, type MatchableApplicant } from "@/lib/recruit-matching";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface RecruitCategory {
  id: string;
  name: string;
  section: RecruitSection;
  defaultPoints: number;
  sortOrder: number;
  archived: boolean;
}

export interface RecruitEvent {
  id: string;
  quarterId: string;
  categoryId: string;
  name: string;
  date: string;
}

export interface PointEntry {
  id: string;
  categoryId: string;
  categoryName: string;
  eventId: string | null;
  eventName: string | null;
  points: number;
  reason: string | null;
  source: "manual" | "import" | "booking";
  awardedByName: string | null;
  createdAt: string;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface ApplicantRow {
  id: string;
  quarterId: string;
  name: string;
  email: string | null;
  major: string | null;
  year: string | null;
  notes: string;
  hasPrevious: boolean;
  previousQuarterName: string | null;
  aliases: string[];
  entries: PointEntry[];
  total: number;
}

export interface MergeLogRow {
  id: string;
  survivorName: string;
  absorbedName: string;
  createdAt: string;
}

export async function getRecruitCategories(): Promise<RecruitCategory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recruit_categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    section: c.section,
    defaultPoints: Number(c.default_points),
    sortOrder: c.sort_order,
    archived: c.archived_at !== null,
  }));
}

export async function getRecruitEvents(quarterId: string): Promise<RecruitEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recruit_events")
    .select("*")
    .eq("quarter_id", quarterId)
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((e) => ({
    id: e.id,
    quarterId: e.quarter_id,
    categoryId: e.category_id,
    name: e.name,
    date: e.date,
  }));
}

async function lookupProfileNames(supabase: Supabase, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from("profiles").select("id, name").in("id", ids);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id, p.name]));
}

const ID_CHUNK = 100;

export async function getApplicantRows(quarterId: string): Promise<ApplicantRow[]> {
  const supabase = await createClient();

  const [applicants, aliases, categories, events, quarters] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from("recruit_applicants")
        .select("*")
        .eq("quarter_id", quarterId)
        .is("archived_at", null)
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("recruit_applicant_aliases")
        .select("applicant_id, alias")
        .eq("quarter_id", quarterId)
        .order("id")
        .range(from, to),
    ),
    getRecruitCategories(),
    getRecruitEvents(quarterId),
    getQuarters(),
  ]);

  const ids = applicants.map((a) => a.id);
  const pointRows = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    pointRows.push(
      ...(await fetchAllPages((from, to) =>
        supabase
          .from("recruit_points")
          .select("*")
          .in("applicant_id", chunk)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      )),
    );
  }

  const awarderNames = await lookupProfileNames(
    supabase,
    [...new Set(pointRows.map((p) => p.awarded_by).filter((x): x is string => !!x))],
  );

  const previousIds = [...new Set(applicants.map((a) => a.previous_applicant_id).filter((x): x is string => !!x))];
  const previousQuarterById = new Map<string, string>();
  if (previousIds.length > 0) {
    const { data, error } = await supabase.from("recruit_applicants").select("id, quarter_id").in("id", previousIds);
    if (error) throw error;
    const quarterName = new Map(quarters.map((q) => [q.id, q.name]));
    for (const row of data ?? []) {
      const name = quarterName.get(row.quarter_id);
      if (name) previousQuarterById.set(row.id, name);
    }
  }

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const eventName = new Map(events.map((e) => [e.id, e.name]));

  const aliasesByApplicant = new Map<string, string[]>();
  for (const a of aliases) {
    aliasesByApplicant.set(a.applicant_id, [...(aliasesByApplicant.get(a.applicant_id) ?? []), a.alias]);
  }

  const entriesByApplicant = new Map<string, PointEntry[]>();
  for (const p of pointRows) {
    const entry: PointEntry = {
      id: p.id,
      categoryId: p.category_id,
      categoryName: categoryName.get(p.category_id) ?? "Unknown category",
      eventId: p.event_id,
      eventName: p.event_id ? (eventName.get(p.event_id) ?? null) : null,
      points: Number(p.points),
      reason: p.reason,
      source: p.source,
      awardedByName: p.awarded_by ? (awarderNames.get(p.awarded_by) ?? null) : null,
      createdAt: p.created_at,
      voidedAt: p.voided_at,
      voidReason: p.void_reason,
    };
    entriesByApplicant.set(p.applicant_id, [...(entriesByApplicant.get(p.applicant_id) ?? []), entry]);
  }

  return applicants.map((a) => {
    const entries = entriesByApplicant.get(a.id) ?? [];
    return {
      id: a.id,
      quarterId: a.quarter_id,
      name: a.name,
      email: a.email,
      major: a.major,
      year: a.year,
      notes: a.notes,
      hasPrevious: a.previous_applicant_id !== null,
      previousQuarterName: a.previous_applicant_id ? (previousQuarterById.get(a.previous_applicant_id) ?? null) : null,
      aliases: aliasesByApplicant.get(a.id) ?? [],
      entries,
      total: sumPoints(entries),
    };
  });
}

/** Live applicants in a quarter, shaped for the matcher. */
export async function getMatchableApplicants(quarterId: string): Promise<MatchableApplicant[]> {
  const supabase = await createClient();
  const [applicants, aliases] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from("recruit_applicants")
        .select("id, name, email")
        .eq("quarter_id", quarterId)
        .is("archived_at", null)
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("recruit_applicant_aliases")
        .select("applicant_id, alias")
        .eq("quarter_id", quarterId)
        .order("id")
        .range(from, to),
    ),
  ]);
  const byApplicant = new Map<string, string[]>();
  for (const a of aliases) byApplicant.set(a.applicant_id, [...(byApplicant.get(a.applicant_id) ?? []), a.alias]);
  return applicants.map((a) => ({ id: a.id, name: a.name, email: a.email, aliases: byApplicant.get(a.id) ?? [] }));
}

export async function getDismissedPairKeys(): Promise<Set<string>> {
  const supabase = await createClient();
  const rows = await fetchAllPages((from, to) =>
    supabase.from("recruit_not_duplicates").select("applicant_a, applicant_b").order("applicant_a").order("applicant_b").range(from, to),
  );
  return new Set(rows.map((r) => pairKey(r.applicant_a, r.applicant_b)));
}

/** Merges in this quarter that can still be undone, newest first. */
export async function getRecentMerges(quarterId: string): Promise<MergeLogRow[]> {
  const supabase = await createClient();
  const { data: logs, error } = await supabase
    .from("recruit_merge_log")
    .select("id, survivor_id, absorbed_id, created_at")
    .is("undone_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  if (!logs || logs.length === 0) return [];

  const ids = [...new Set(logs.flatMap((l) => [l.survivor_id, l.absorbed_id]))];
  const { data: people, error: peopleError } = await supabase
    .from("recruit_applicants")
    .select("id, name, quarter_id")
    .in("id", ids);
  if (peopleError) throw peopleError;
  const byId = new Map((people ?? []).map((p) => [p.id, p]));

  return logs
    .filter((l) => byId.get(l.survivor_id)?.quarter_id === quarterId)
    .map((l) => ({
      id: l.id,
      survivorName: byId.get(l.survivor_id)?.name ?? "Unknown",
      absorbedName: byId.get(l.absorbed_id)?.name ?? "Unknown",
      createdAt: l.created_at,
    }));
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (If the typed client complains about `.in(...)` argument types or `Number(...)` on a `number`, fix the call, not the types file.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/recruit.ts
git commit -m "Add recruitment data layer"
```

---

### Task 5: Server Actions and audit labels

**Files:**
- Create: `src/actions/recruit.ts`
- Modify: `src/lib/audit-labels.ts` (append labels)

**Interfaces:**
- Consumes: Task 3 helpers (`validateAward`, `normalizeApplicantEmail`, `isPlausibleEmail`, `resolveMerge`), Task 2 (`findMatches`, `normalizeName`, `pairKey`, `MatchClass`), Task 4 (`getMatchableApplicants`).
- Produces (all `async`, exported from `src/actions/recruit.ts`):
  - `interface ActionResult { error?: string }`
  - `interface MatchPreview { applicantId: string; name: string; email: string | null; kind: MatchClass; score: number }`
  - `checkApplicantMatchesAction(input: { quarterId: string; name: string; email?: string }): Promise<{ matches: MatchPreview[] }>`
  - `addApplicantAction(input: { quarterId: string; name: string; email?: string; major?: string; year?: string; confirmDuplicate?: boolean }): Promise<ActionResult & { needsConfirm?: boolean }>`
  - `updateApplicantAction(id: string, input: { name: string; email?: string; major?: string; year?: string; notes: string }): Promise<ActionResult>`
  - `awardPointsAction(input: { applicantId: string; categoryId: string; eventId?: string | null; points: number; reason?: string }): Promise<ActionResult>`
  - `voidPointsAction(entryId: string, reason: string): Promise<ActionResult>`
  - `createCategoryAction(input: { name: string; section: RecruitSection; defaultPoints: number }): Promise<ActionResult>`
  - `updateCategoryAction(id: string, input: { name: string; section: RecruitSection; defaultPoints: number }): Promise<ActionResult>`
  - `setCategoryArchivedAction(id: string, archived: boolean): Promise<ActionResult>`
  - `reorderCategoriesAction(orderedIds: string[]): Promise<ActionResult>`
  - `createEventAction(input: { quarterId: string; categoryId: string; name: string; date: string }): Promise<ActionResult>`
  - `deleteEventAction(id: string): Promise<ActionResult>`
  - `mergeApplicantsAction(input: { survivorId: string; absorbedId: string; keepEmail?: string | null }): Promise<ActionResult>`
  - `undoMergeAction(logId: string): Promise<ActionResult>`
  - `dismissDuplicateAction(aId: string, bId: string): Promise<ActionResult>`

- [ ] **Step 1: Add audit labels**

In `src/lib/audit-labels.ts`, before the closing `};` of `AUDIT_ACTION_LABELS`, add:

```ts
  "recruit.applicants_merged": "Merged duplicate applicants",
  "recruit.merge_undone": "Undid an applicant merge",
  "recruit.points_voided": "Voided a recruitment points entry",
  "recruit.category_created": "Created a recruitment points category",
  "recruit.category_updated": "Edited a recruitment points category",
  "recruit.category_archived": "Archived a recruitment points category",
  "recruit.category_restored": "Restored a recruitment points category",
```

- [ ] **Step 2: Write the actions**

Create `src/actions/recruit.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import { getMatchableApplicants } from "@/lib/data/recruit";
import {
  isPlausibleEmail,
  normalizeApplicantEmail,
  resolveMerge,
  validateAward,
  type RecruitSection,
} from "@/lib/recruit";
import { findMatches, normalizeName, pairKey, type MatchClass } from "@/lib/recruit-matching";

export interface ActionResult {
  error?: string;
}

export interface MatchPreview {
  applicantId: string;
  name: string;
  email: string | null;
  kind: MatchClass;
  score: number;
}

const SECTIONS: RecruitSection[] = ["engagement", "resume", "interview"];

async function requireExec() {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) return { profile: null, error: "Only exec can do that." };
  return { profile, error: undefined };
}

function revalidateAll() {
  revalidatePath("/portal/admin/applicants");
}

function cleanText(v: string | undefined | null): string | null {
  const t = v?.trim();
  return t ? t : null;
}

export async function checkApplicantMatchesAction(input: {
  quarterId: string;
  name: string;
  email?: string;
}): Promise<{ matches: MatchPreview[] }> {
  const { error } = await requireExec();
  if (error) return { matches: [] };

  const existing = await getMatchableApplicants(input.quarterId);
  const byId = new Map(existing.map((a) => [a.id, a]));
  const matches = findMatches({ name: input.name, email: normalizeApplicantEmail(input.email) }, existing).map((m) => ({
    applicantId: m.applicantId,
    name: byId.get(m.applicantId)?.name ?? "Unknown",
    email: byId.get(m.applicantId)?.email ?? null,
    kind: m.kind,
    score: m.score,
  }));
  return { matches };
}

export async function addApplicantAction(input: {
  quarterId: string;
  name: string;
  email?: string;
  major?: string;
  year?: string;
  confirmDuplicate?: boolean;
}): Promise<ActionResult & { needsConfirm?: boolean }> {
  const { error } = await requireExec();
  if (error) return { error };

  const name = input.name.trim();
  if (!name) return { error: "Enter the applicant's name." };
  const email = normalizeApplicantEmail(input.email);
  if (email && !isPlausibleEmail(email)) return { error: "That email doesn't look right." };

  const existing = await getMatchableApplicants(input.quarterId);
  const matches = findMatches({ name, email }, existing);
  if (matches.some((m) => m.kind === "duplicate")) {
    return { error: "Someone with that email is already an applicant this quarter." };
  }
  if (matches.length > 0 && !input.confirmDuplicate) return { needsConfirm: true };

  const supabase = await createClient();

  let previousId: string | null = null;
  if (email) {
    const { data: prev, error: prevError } = await supabase
      .from("recruit_applicants")
      .select("id")
      .eq("email", email)
      .neq("quarter_id", input.quarterId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (prevError) return { error: prevError.message };
    previousId = prev?.[0]?.id ?? null;
  }

  const { error: insertError } = await supabase.from("recruit_applicants").insert({
    quarter_id: input.quarterId,
    name,
    email,
    major: cleanText(input.major),
    year: cleanText(input.year),
    previous_applicant_id: previousId,
  });
  if (insertError) return { error: insertError.message };

  revalidateAll();
  return {};
}

export async function updateApplicantAction(
  id: string,
  input: { name: string; email?: string; major?: string; year?: string; notes: string },
): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const name = input.name.trim();
  if (!name) return { error: "Enter the applicant's name." };
  const email = normalizeApplicantEmail(input.email);
  if (email && !isPlausibleEmail(email)) return { error: "That email doesn't look right." };

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("recruit_applicants")
    .update({ name, email, major: cleanText(input.major), year: cleanText(input.year), notes: input.notes })
    .eq("id", id);
  if (updateError) {
    return {
      error: updateError.code === "23505" ? "Another applicant already has that email." : updateError.message,
    };
  }

  revalidateAll();
  return {};
}

export async function awardPointsAction(input: {
  applicantId: string;
  categoryId: string;
  eventId?: string | null;
  points: number;
  reason?: string;
}): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const problem = validateAward({ points: input.points, reason: input.reason });
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { data: category, error: categoryError } = await supabase
    .from("recruit_categories")
    .select("archived_at")
    .eq("id", input.categoryId)
    .maybeSingle();
  if (categoryError) return { error: categoryError.message };
  if (!category) return { error: "That category no longer exists." };
  if (category.archived_at) return { error: "That category is archived — pick another one." };

  const { error: insertError } = await supabase.from("recruit_points").insert({
    applicant_id: input.applicantId,
    category_id: input.categoryId,
    event_id: input.eventId ?? null,
    points: input.points,
    reason: cleanText(input.reason),
    source: "manual",
    awarded_by: profile.id,
  });
  if (insertError) return { error: insertError.message };

  revalidateAll();
  return {};
}

export async function voidPointsAction(entryId: string, reason: string): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  if (!reason.trim()) return { error: "Say why you're voiding this entry." };

  const supabase = await createClient();
  const { data: entry, error: readError } = await supabase
    .from("recruit_points")
    .select("applicant_id, points, voided_at")
    .eq("id", entryId)
    .maybeSingle();
  if (readError) return { error: readError.message };
  if (!entry) return { error: "That entry no longer exists." };
  if (entry.voided_at) return { error: "That entry was already voided." };

  const { error: updateError } = await supabase
    .from("recruit_points")
    .update({ voided_at: new Date().toISOString(), voided_by: profile.id, void_reason: reason.trim() })
    .eq("id", entryId);
  if (updateError) return { error: updateError.message };

  const { data: applicant } = await supabase
    .from("recruit_applicants")
    .select("name")
    .eq("id", entry.applicant_id)
    .maybeSingle();
  await logAudit(profile.id, "recruit.points_voided", applicant?.name ?? null, `${entry.points} pts — ${reason.trim()}`);

  revalidateAll();
  return {};
}

function validateCategoryInput(input: { name: string; section: RecruitSection; defaultPoints: number }): string | null {
  if (!input.name.trim()) return "Give the category a name.";
  if (!SECTIONS.includes(input.section)) return "Pick a section.";
  if (!Number.isFinite(input.defaultPoints)) return "Enter the default points as a number.";
  return null;
}

export async function createCategoryAction(input: {
  name: string;
  section: RecruitSection;
  defaultPoints: number;
}): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  const problem = validateCategoryInput(input);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("recruit_categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  const sortOrder = (last?.[0]?.sort_order ?? 0) + 10;

  const { error: insertError } = await supabase.from("recruit_categories").insert({
    name: input.name.trim(),
    section: input.section,
    default_points: input.defaultPoints,
    sort_order: sortOrder,
  });
  if (insertError) {
    return {
      error: insertError.code === "23505" ? "A category with that name already exists." : insertError.message,
    };
  }
  await logAudit(profile.id, "recruit.category_created", input.name.trim());
  revalidateAll();
  return {};
}

export async function updateCategoryAction(
  id: string,
  input: { name: string; section: RecruitSection; defaultPoints: number },
): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  const problem = validateCategoryInput(input);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("recruit_categories")
    .update({ name: input.name.trim(), section: input.section, default_points: input.defaultPoints })
    .eq("id", id);
  if (updateError) {
    return {
      error: updateError.code === "23505" ? "A category with that name already exists." : updateError.message,
    };
  }
  await logAudit(profile.id, "recruit.category_updated", input.name.trim(), `default ${input.defaultPoints} pts`);
  revalidateAll();
  return {};
}

export async function setCategoryArchivedAction(id: string, archived: boolean): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const supabase = await createClient();
  const { data: category, error: updateError } = await supabase
    .from("recruit_categories")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .select("name")
    .maybeSingle();
  if (updateError) return { error: updateError.message };

  await logAudit(profile.id, archived ? "recruit.category_archived" : "recruit.category_restored", category?.name ?? null);
  revalidateAll();
  return {};
}

export async function reorderCategoriesAction(orderedIds: string[]): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  for (const [index, id] of orderedIds.entries()) {
    const { error: updateError } = await supabase
      .from("recruit_categories")
      .update({ sort_order: (index + 1) * 10 })
      .eq("id", id);
    if (updateError) return { error: updateError.message };
  }
  revalidateAll();
  return {};
}

export async function createEventAction(input: {
  quarterId: string;
  categoryId: string;
  name: string;
  date: string;
}): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };
  if (!input.name.trim()) return { error: "Give the event a name." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Pick the event's date." };

  const supabase = await createClient();
  const { error: insertError } = await supabase.from("recruit_events").insert({
    quarter_id: input.quarterId,
    category_id: input.categoryId,
    name: input.name.trim(),
    date: input.date,
  });
  if (insertError) return { error: insertError.message };

  revalidateAll();
  return {};
}

export async function deleteEventAction(id: string): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from("recruit_points")
    .select("id", { count: "exact", head: true })
    .eq("event_id", id);
  if (countError) return { error: countError.message };
  if ((count ?? 0) > 0) {
    return { error: "This event already has points attached, so it can't be deleted. Void those entries first." };
  }

  const { error: deleteError } = await supabase.from("recruit_events").delete().eq("id", id);
  if (deleteError) return { error: deleteError.message };

  revalidateAll();
  return {};
}

export async function mergeApplicantsAction(input: {
  survivorId: string;
  absorbedId: string;
  keepEmail?: string | null;
}): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const supabase = await createClient();
  const { data: people, error: readError } = await supabase
    .from("recruit_applicants")
    .select("id, name, email, major, year, notes")
    .in("id", [input.survivorId, input.absorbedId]);
  if (readError) return { error: readError.message };
  const survivor = people?.find((p) => p.id === input.survivorId);
  const absorbed = people?.find((p) => p.id === input.absorbedId);
  if (!survivor || !absorbed) return { error: "One of those applicants no longer exists." };

  const check = resolveMerge(survivor, absorbed, input.keepEmail);
  if (!check.ok) return { error: check.error };

  const { error: rpcError } = await supabase.rpc("merge_recruit_applicants", {
    p_survivor: input.survivorId,
    p_absorbed: input.absorbedId,
    p_absorbed_alias: normalizeName(absorbed.name) || null,
    p_keep_email: input.keepEmail ?? null,
  });
  if (rpcError) return { error: rpcError.message };

  await logAudit(profile.id, "recruit.applicants_merged", survivor.name, `absorbed ${absorbed.name}`);
  revalidateAll();
  return {};
}

export async function undoMergeAction(logId: string): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const supabase = await createClient();
  const { error: rpcError } = await supabase.rpc("undo_merge_recruit_applicants", { p_log_id: logId });
  if (rpcError) return { error: rpcError.message };

  await logAudit(profile.id, "recruit.merge_undone");
  revalidateAll();
  return {};
}

export async function dismissDuplicateAction(aId: string, bId: string): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const [a, b] = pairKey(aId, bId).split(":");
  const supabase = await createClient();
  const { error: upsertError } = await supabase
    .from("recruit_not_duplicates")
    .upsert({ applicant_a: a, applicant_b: b }, { onConflict: "applicant_a,applicant_b" });
  if (upsertError) return { error: upsertError.message };

  revalidateAll();
  return {};
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (`pairKey` sorts with default string sort; Postgres compares uuids bytewise, and for lowercase hex uuid strings both orderings agree, so the `applicant_a < applicant_b` check holds.)

- [ ] **Step 4: Commit**

```bash
git add src/actions/recruit.ts src/lib/audit-labels.ts
git commit -m "Add recruitment points server actions"
```

---

### Task 6: Page shell, nav link, and Applicants leaderboard

**Files:**
- Create: `src/app/portal/(app)/admin/applicants/page.tsx`
- Create: `src/app/portal/(app)/admin/applicants/applicants-workspace.tsx`
- Create: `src/app/portal/(app)/admin/applicants/applicants-view.tsx`
- Create: `src/app/portal/(app)/admin/applicants/score-ring.tsx`
- Create: `src/app/portal/(app)/admin/applicants/how-it-works.tsx`
- Modify: `src/components/layout/nav-links.ts` (add sidebar entry)

**Interfaces:**
- Consumes: Task 4 data (`ApplicantRow`, `RecruitCategory`, `RecruitEvent`, `MergeLogRow`), `findDuplicatePairs`/`DuplicatePair`, `rankByTotal`, `ringFraction`, `formatPoints`.
- Produces: `ApplicantsWorkspace` props `{ quarterId: string; quarterName: string; rows: ApplicantRow[]; categories: RecruitCategory[]; events: RecruitEvent[]; pairs: DuplicatePair[]; merges: MergeLogRow[] }`; `ApplicantsView` props `{ quarterId: string; rows: ApplicantRow[]; categories: RecruitCategory[]; events: RecruitEvent[]; duplicateCount: number; onReviewDuplicates: () => void }`; `ScoreRing` props `{ value: number; fraction: number }`; `HowItWorks` (no props). Tasks 7–9 add `AddApplicantDialog`, `ApplicantPanel`, `SetupView`, `DuplicatesView`; this task renders placeholders-free minimal stand-ins only through real components added later, so **Task 6's workspace imports only components that exist after this task** and Tasks 7–9 each edit the workspace to mount theirs.

- [ ] **Step 1: Add the sidebar link**

In `src/components/layout/nav-links.ts` add `ListOrdered` to the lucide import list, then insert as the first entry of the `admin-recruitment` group (before the `Coffee Chats` entry):

```ts
  {
    href: "/portal/admin/applicants",
    label: "Applicants",
    icon: ListOrdered,
    execOnly: true,
    quarterScoped: true,
    keywords: "recruitment applicants points leaderboard ranking scores attendance info session",
    group: "admin-recruitment",
  },
```

- [ ] **Step 2: Score ring and how-it-works popover**

Create `src/app/portal/(app)/admin/applicants/score-ring.tsx`:

```tsx
const SIZE = 40;
const STROKE = 4;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

function tone(fraction: number): string {
  if (fraction >= 0.66) return "stroke-emerald-600";
  if (fraction >= 0.33) return "stroke-amber-500";
  return "stroke-slate-400";
}

export function ScoreRing({ value, fraction }: { value: number; fraction: number }) {
  return (
    <div className="relative size-10 shrink-0" aria-label={`${value} points`}>
      <svg width={SIZE} height={SIZE} className="-rotate-90">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" strokeWidth={STROKE} className="stroke-muted" />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - fraction)}
          className={tone(fraction)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums">
        {value}
      </span>
    </div>
  );
}
```

Create `src/app/portal/(app)/admin/applicants/how-it-works.tsx`:

```tsx
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function HowItWorks() {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="sm" />}>
        <CircleHelp />
        How this works
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-2 text-sm">
        <p className="font-medium">Applicant points, in 30 seconds</p>
        <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
          <li>Every applicant has a running total built from point entries (info sessions, coffee chats, and so on).</li>
          <li>Click an applicant to see their history, give points, or void a mistake. Nothing is ever deleted.</li>
          <li>Add applicants by hand with <b>Add applicant</b>. If a name looks like someone already here, you&apos;ll be warned.</li>
          <li><b>Setup</b> is where you add or change point categories and events. <b>Duplicates</b> lists people who may be entered twice.</li>
          <li>Points are per quarter. Use the quarter picker at the top to look at a past cycle.</li>
        </ul>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 3: Applicants list view**

Create `src/app/portal/(app)/admin/applicants/applicants-view.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import type { ApplicantRow, RecruitCategory, RecruitEvent } from "@/lib/data/recruit";
import { rankByTotal, ringFraction } from "@/lib/recruit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScoreRing } from "./score-ring";

type Filter = "all" | "engaged" | "none";
type Sort = "points" | "name";

export function ApplicantsView({
  rows,
  duplicateCount,
  onReviewDuplicates,
  onSelect,
  addButton,
}: {
  quarterId: string;
  rows: ApplicantRow[];
  categories: RecruitCategory[];
  events: RecruitEvent[];
  duplicateCount: number;
  onReviewDuplicates: () => void;
  onSelect: (id: string) => void;
  addButton: React.ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("points");

  const engagedCount = rows.filter((r) => r.entries.some((e) => !e.voidedAt && e.points > 0)).length;
  const counts: Record<Filter, number> = { all: rows.length, engaged: engagedCount, none: rows.length - engagedCount };
  const max = Math.max(0, ...rows.map((r) => r.total));

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      const engaged = r.entries.some((e) => !e.voidedAt && e.points > 0);
      if (filter === "engaged" && !engaged) return false;
      if (filter === "none" && engaged) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || (r.email ?? "").includes(q) || r.aliases.some((a) => a.includes(q));
    });
    return sort === "points"
      ? rankByTotal(filtered)
      : [...filtered].sort((a, b) => a.name.localeCompare(b.name)).map((r) => ({ ...r, rank: 0 }));
  }, [rows, search, filter, sort]);

  if (rows.length === 0) {
    return (
      <Card className="mt-4">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <UserPlus className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">No applicants yet this quarter</p>
            <p className="text-sm text-muted-foreground">
              Add the first one by hand. Applicants are also created automatically as you give points or import lists.
            </p>
          </div>
          {addButton}
        </CardContent>
      </Card>
    );
  }

  const funnel: { key: Filter; label: string }[] = [
    { key: "all", label: "All applicants" },
    { key: "engaged", label: "Engaged" },
    { key: "none", label: "No points yet" },
  ];

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {funnel.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-xl border p-3 text-left transition-colors ${
              filter === f.key ? "border-foreground" : "border-border hover:bg-muted/50"
            }`}
          >
            <div className="text-xl font-semibold tabular-nums">{counts[f.key]}</div>
            <div className="text-xs text-muted-foreground">{f.label}</div>
          </button>
        ))}
      </div>

      {duplicateCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
          <span>
            <b>To do:</b> {duplicateCount} possible duplicate{duplicateCount === 1 ? "" : "s"} to check
          </span>
          <Button size="sm" variant="outline" onClick={onReviewDuplicates}>
            Review
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search applicants"
            placeholder="Search name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={sort} onValueChange={(v) => v && setSort(v as Sort)}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue>{(value: string) => (value === "name" ? "Sort: Name A–Z" : "Sort: Most points")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="points">Sort: Most points</SelectItem>
            <SelectItem value="name">Sort: Name A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No one matches that search.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {visible.map((r) => {
            const categoriesSeen = [...new Set(r.entries.filter((e) => !e.voidedAt).map((e) => e.categoryName))];
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onSelect(r.id)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50"
                >
                  <span className="w-6 text-sm tabular-nums text-muted-foreground">{sort === "points" ? r.rank : ""}</span>
                  <ScoreRing value={r.total} fraction={ringFraction(r.total, max)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{r.name}</span>
                      {r.hasPrevious && <Badge variant="secondary">Previously applied</Badge>}
                      {!r.email && <Badge variant="outline">No email yet</Badge>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {categoriesSeen.length > 0 ? categoriesSeen.join(" · ") : "No points yet"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Workspace and page**

Create `src/app/portal/(app)/admin/applicants/applicants-workspace.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { ApplicantRow, MergeLogRow, RecruitCategory, RecruitEvent } from "@/lib/data/recruit";
import type { DuplicatePair } from "@/lib/recruit-matching";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApplicantsView } from "./applicants-view";
import { HowItWorks } from "./how-it-works";

export function ApplicantsWorkspace({
  quarterId,
  quarterName,
  rows,
  categories,
  events,
  pairs,
}: {
  quarterId: string;
  quarterName: string;
  rows: ApplicantRow[];
  categories: RecruitCategory[];
  events: RecruitEvent[];
  pairs: DuplicatePair[];
  merges: MergeLogRow[];
}) {
  const [tab, setTab] = useState("applicants");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Applicants</h1>
          <p className="text-sm text-muted-foreground">
            {quarterName} · {rows.length} applicant{rows.length === 1 ? "" : "s"}. Track points from info sessions, coffee
            chats and more, then compare everyone in one place.
          </p>
        </div>
        <HowItWorks />
      </div>

      <Tabs value={tab} onValueChange={(v) => v && setTab(String(v))}>
        <TabsList>
          <TabsTrigger value="applicants">Applicants</TabsTrigger>
          <TabsTrigger value="setup">Setup</TabsTrigger>
          <TabsTrigger value="duplicates">
            Duplicates
            {pairs.length > 0 && <Badge variant="secondary">{pairs.length}</Badge>}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="applicants">
          <ApplicantsView
            quarterId={quarterId}
            rows={rows}
            categories={categories}
            events={events}
            duplicateCount={pairs.length}
            onReviewDuplicates={() => setTab("duplicates")}
            onSelect={setSelectedId}
            addButton={null}
          />
        </TabsContent>
        <TabsContent value="setup">
          <p className="mt-4 text-sm text-muted-foreground">Setup arrives in a later task.</p>
        </TabsContent>
        <TabsContent value="duplicates">
          <p className="mt-4 text-sm text-muted-foreground">Duplicates arrive in a later task.</p>
        </TabsContent>
      </Tabs>
      <span hidden>{selectedId}</span>
    </div>
  );
}
```

(The two "arrive in a later task" lines and the hidden span are deliberate scaffolding that Tasks 7–9 replace; they must not survive past Task 9.)

Create `src/app/portal/(app)/admin/applicants/page.tsx`:

```tsx
import type { Metadata } from "next";
import { getQuarters } from "@/lib/data/quarters";
import { defaultQuarterId, resolveQuarterId } from "@/lib/admin-nav";
import {
  getApplicantRows,
  getDismissedPairKeys,
  getRecentMerges,
  getRecruitCategories,
  getRecruitEvents,
} from "@/lib/data/recruit";
import { findDuplicatePairs } from "@/lib/recruit-matching";
import { Card, CardContent } from "@/components/ui/card";
import { ApplicantsWorkspace } from "./applicants-workspace";

export const metadata: Metadata = { title: "Admin · Applicants" };

export default async function ApplicantsPage({ searchParams }: { searchParams: Promise<{ quarter?: string }> }) {
  const [{ quarter }, quarters] = await Promise.all([searchParams, getQuarters()]);
  const quarterId = resolveQuarterId(quarter, quarters, defaultQuarterId(quarters));

  if (!quarterId) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="font-medium">There&apos;s no quarter yet</p>
          <p className="text-sm text-muted-foreground">
            Applicants belong to a quarter. Create one under Admin → Quarters, then come back.
          </p>
        </CardContent>
      </Card>
    );
  }

  const [rows, categories, events, dismissed, merges] = await Promise.all([
    getApplicantRows(quarterId),
    getRecruitCategories(),
    getRecruitEvents(quarterId),
    getDismissedPairKeys(),
    getRecentMerges(quarterId),
  ]);
  const pairs = findDuplicatePairs(
    rows.map((r) => ({ id: r.id, name: r.name, email: r.email, aliases: r.aliases })),
    dismissed,
  );
  const quarterName = quarters.find((q) => q.id === quarterId)?.name ?? "This quarter";

  return (
    <ApplicantsWorkspace
      quarterId={quarterId}
      quarterName={quarterName}
      rows={rows}
      categories={categories}
      events={events}
      pairs={pairs}
      merges={merges}
    />
  );
}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all pass (the existing admin-nav/nav-link tests still pass with the new entry).

Then, with a database that has the migration applied, run `npm run dev`, sign in as an exec, open `/portal/admin/applicants`, and confirm: sidebar shows **Applicants** under Recruitment; the empty state reads "No applicants yet this quarter"; the quarter picker appears in the breadcrumb bar; with no quarter selected the "no quarter yet" card shows.

- [ ] **Step 6: Commit**

```bash
git add "src/app/portal/(app)/admin/applicants" src/components/layout/nav-links.ts
git commit -m "Add Applicants page shell, leaderboard list and sidebar link"
```

---

### Task 7: Add applicant, give points, and the side panel

**Files:**
- Create: `src/app/portal/(app)/admin/applicants/add-applicant-dialog.tsx`
- Create: `src/app/portal/(app)/admin/applicants/give-points-dialog.tsx`
- Create: `src/app/portal/(app)/admin/applicants/applicant-panel.tsx`
- Modify: `src/app/portal/(app)/admin/applicants/applicants-workspace.tsx` (mount all three, remove the hidden-span scaffold)

**Interfaces:**
- Consumes: Task 5 actions `checkApplicantMatchesAction`, `addApplicantAction`, `updateApplicantAction`, `awardPointsAction`, `voidPointsAction`, type `MatchPreview`; Task 3 `validateAward`, `formatPoints`.
- Produces: `AddApplicantDialog` props `{ quarterId: string; trigger?: React.ReactElement }`; `GivePointsDialog` props `{ applicant: ApplicantRow | null; categories: RecruitCategory[]; events: RecruitEvent[]; onOpenChange: (open: boolean) => void }` (open when `applicant` is non-null); `ApplicantPanel` props `{ applicant: ApplicantRow | null; onClose: () => void; onGivePoints: () => void }`.

- [ ] **Step 1: Add-applicant dialog with live duplicate check**

Create `src/app/portal/(app)/admin/applicants/add-applicant-dialog.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TriangleAlert, UserPlus } from "lucide-react";
import { addApplicantAction, checkApplicantMatchesAction, type MatchPreview } from "@/actions/recruit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";

export function AddApplicantDialog({ quarterId, trigger }: { quarterId: string; trigger?: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [major, setMajor] = useState("");
  const [year, setYear] = useState("");
  const [matches, setMatches] = useState<MatchPreview[]>([]);
  const [isPending, startTransition] = useTransition();
  const requestId = useRef(0);
  const router = useRouter();

  // Live duplicate check, debounced; stale responses are ignored.
  useEffect(() => {
    if (!open || (name.trim().length < 2 && !email.includes("@"))) {
      setMatches([]);
      return;
    }
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      const result = await checkApplicantMatchesAction({ quarterId, name, email });
      if (id === requestId.current) setMatches(result.matches);
    }, 350);
    return () => clearTimeout(timer);
  }, [open, quarterId, name, email]);

  const hardDuplicate = matches.find((m) => m.kind === "duplicate");
  const softMatches = matches.filter((m) => m.kind !== "duplicate");

  function reset() {
    setName("");
    setEmail("");
    setMajor("");
    setYear("");
    setMatches([]);
  }

  function submit() {
    startTransition(async () => {
      const result = await addApplicantAction({
        quarterId,
        name,
        email,
        major,
        year,
        confirmDuplicate: softMatches.length > 0,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${name.trim()} added.`);
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          trigger ?? (
            <Button size="sm">
              <UserPlus />
              Add applicant
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add applicant</DialogTitle>
          <DialogDescription>Only the name is required. You can add the rest later.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="applicant-name">Name</FieldLabel>
            <Input id="applicant-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jessica Kim" />
          </Field>
          <Field>
            <FieldLabel htmlFor="applicant-email">UCSC email (optional)</FieldLabel>
            <Input
              id="applicant-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jkim@ucsc.edu"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="applicant-major">Major (optional)</FieldLabel>
              <Input id="applicant-major" value={major} onChange={(e) => setMajor(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="applicant-year">Year (optional)</FieldLabel>
              <Input id="applicant-year" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2028" />
            </Field>
          </div>
        </FieldGroup>

        {hardDuplicate && (
          <p className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              <b>{hardDuplicate.name}</b> already has that email. Open them from the list instead of adding a second record.
            </span>
          </p>
        )}
        {!hardDuplicate && softMatches.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
            <p className="flex items-center gap-2 font-medium">
              <TriangleAlert className="size-4" /> This might be someone already added:
            </p>
            <ul className="mt-1 list-disc pl-6">
              {softMatches.map((m) => (
                <li key={m.applicantId}>
                  {m.name}
                  {m.email ? ` (${m.email})` : ""}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-muted-foreground">If it&apos;s a different person, go ahead and add them anyway.</p>
          </div>
        )}

        <DialogFooter>
          <Button disabled={isPending || !name.trim() || !!hardDuplicate} onClick={submit}>
            {softMatches.length > 0 ? "Add anyway" : "Add applicant"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Give-points dialog**

Create `src/app/portal/(app)/admin/applicants/give-points-dialog.tsx`:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { awardPointsAction } from "@/actions/recruit";
import type { ApplicantRow, RecruitCategory, RecruitEvent } from "@/lib/data/recruit";
import { validateAward } from "@/lib/recruit";
import { formatDateLong } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NO_EVENT = "none";

export function GivePointsDialog({
  applicant,
  categories,
  events,
  onOpenChange,
}: {
  applicant: ApplicantRow | null;
  categories: RecruitCategory[];
  events: RecruitEvent[];
  onOpenChange: (open: boolean) => void;
}) {
  const choices = categories.filter((c) => !c.archived);
  const [categoryId, setCategoryId] = useState<string>("");
  const [eventId, setEventId] = useState<string>(NO_EVENT);
  const [points, setPoints] = useState("0");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Reset whenever the dialog opens for an applicant.
  useEffect(() => {
    if (!applicant) return;
    const first = choices[0];
    setCategoryId(first?.id ?? "");
    setPoints(String(first?.defaultPoints ?? 0));
    setEventId(NO_EVENT);
    setReason("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicant?.id]);

  const category = choices.find((c) => c.id === categoryId);
  const categoryEvents = events.filter((e) => e.categoryId === categoryId);
  const numeric = Number(points);
  const problem = points.trim() === "" ? "Enter the points." : validateAward({ points: numeric, reason });

  function pickCategory(id: string) {
    setCategoryId(id);
    setEventId(NO_EVENT);
    const next = choices.find((c) => c.id === id);
    if (next) setPoints(String(next.defaultPoints));
  }

  function submit() {
    if (!applicant) return;
    startTransition(async () => {
      const result = await awardPointsAction({
        applicantId: applicant.id,
        categoryId,
        eventId: eventId === NO_EVENT ? null : eventId,
        points: numeric,
        reason,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Gave ${applicant.name} ${numeric > 0 ? "+" : ""}${numeric} point${Math.abs(numeric) === 1 ? "" : "s"}.`);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={!!applicant} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Give points{applicant ? ` to ${applicant.name}` : ""}</DialogTitle>
          <DialogDescription>Pick what it&apos;s for. The usual points fill in, and you can change them for this one entry.</DialogDescription>
        </DialogHeader>

        {choices.length === 0 ? (
          <p className="text-sm text-muted-foreground">There are no active categories yet. Add one in the Setup tab first.</p>
        ) : (
          <FieldGroup>
            <Field>
              <FieldLabel>What for</FieldLabel>
              <Select value={categoryId} onValueChange={(v) => v && pickCategory(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick a category">
                    {(value: string) => choices.find((c) => c.id === value)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {choices.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.defaultPoints > 0 ? "+" : ""}
                      {c.defaultPoints})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {categoryEvents.length > 0 && (
              <Field>
                <FieldLabel>Which event (optional)</FieldLabel>
                <Select value={eventId} onValueChange={(v) => v && setEventId(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(value: string) =>
                        value === NO_EVENT ? "No specific event" : categoryEvents.find((e) => e.id === value)?.name
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_EVENT}>No specific event</SelectItem>
                    {categoryEvents.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name} · {formatDateLong(e.date)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            <Field>
              <FieldLabel htmlFor="points-value">Points</FieldLabel>
              <Input
                id="points-value"
                type="number"
                step="0.5"
                value={points}
                onChange={(e) => setPoints(e.target.value)}
              />
              {category && Number(points) !== category.defaultPoints && (
                <FieldDescription>The usual for {category.name} is {category.defaultPoints}.</FieldDescription>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="points-reason">
                Reason {numeric < 0 ? "(required for negative points)" : "(optional)"}
              </FieldLabel>
              <Textarea
                id="points-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder={numeric < 0 ? "Didn't show up to the coffee chat and didn't let us know" : "Anything worth remembering"}
              />
            </Field>
          </FieldGroup>
        )}

        <DialogFooter>
          {problem && choices.length > 0 && <span className="mr-auto self-center text-sm text-muted-foreground">{problem}</span>}
          <Button disabled={isPending || !!problem || !categoryId} onClick={submit}>
            Give points
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Check `formatDateLong` exists with a `(date: string)` signature in `src/lib/date.ts` (it is imported that way in `invitees-view.tsx`); if its signature differs, adapt the two call sites in this file.

- [ ] **Step 3: Side panel**

Create `src/app/portal/(app)/admin/applicants/applicant-panel.tsx`:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateApplicantAction, voidPointsAction } from "@/actions/recruit";
import type { ApplicantRow } from "@/lib/data/recruit";
import { formatPoints } from "@/lib/recruit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function ApplicantPanel({
  applicant,
  onClose,
  onGivePoints,
}: {
  applicant: ApplicantRow | null;
  onClose: () => void;
  onGivePoints: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [major, setMajor] = useState("");
  const [year, setYear] = useState("");
  const [notes, setNotes] = useState("");
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!applicant) return;
    setName(applicant.name);
    setEmail(applicant.email ?? "");
    setMajor(applicant.major ?? "");
    setYear(applicant.year ?? "");
    setNotes(applicant.notes);
    setVoidingId(null);
    setVoidReason("");
  }, [applicant]);

  const dirty =
    !!applicant &&
    (name !== applicant.name ||
      email !== (applicant.email ?? "") ||
      major !== (applicant.major ?? "") ||
      year !== (applicant.year ?? "") ||
      notes !== applicant.notes);

  function save() {
    if (!applicant) return;
    startTransition(async () => {
      const result = await updateApplicantAction(applicant.id, { name, email, major, year, notes });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Saved.");
      router.refresh();
    });
  }

  function confirmVoid(entryId: string) {
    startTransition(async () => {
      const result = await voidPointsAction(entryId, voidReason);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Entry voided.");
      setVoidingId(null);
      setVoidReason("");
      router.refresh();
    });
  }

  return (
    <Sheet open={!!applicant} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {applicant && (
          <>
            <SheetHeader>
              <SheetTitle>{applicant.name}</SheetTitle>
              <SheetDescription>
                {applicant.total} point{applicant.total === 1 ? "" : "s"}
                {applicant.hasPrevious &&
                  ` · Previously applied${applicant.previousQuarterName ? ` (${applicant.previousQuarterName})` : ""}`}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 px-4 pb-6">
              <Button onClick={onGivePoints}>Give points</Button>

              <section className="space-y-2">
                <h3 className="text-sm font-medium">Details</h3>
                <Input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />
                <Input aria-label="Email" placeholder="UCSC email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <Input aria-label="Major" placeholder="Major" value={major} onChange={(e) => setMajor(e.target.value)} />
                  <Input aria-label="Year" placeholder="Year" value={year} onChange={(e) => setYear(e.target.value)} />
                </div>
                <Textarea
                  aria-label="Notes"
                  placeholder="Notes for the group"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <Button variant="outline" size="sm" disabled={!dirty || isPending} onClick={save}>
                  Save changes
                </Button>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-medium">Points history</h3>
                {applicant.entries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing yet. Use &ldquo;Give points&rdquo; to add the first entry.</p>
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {applicant.entries.map((e) => (
                      <li key={e.id} className="space-y-1 p-2.5 text-sm">
                        <div className={`flex items-start justify-between gap-2 ${e.voidedAt ? "text-muted-foreground line-through" : ""}`}>
                          <span>
                            {e.categoryName}
                            {e.eventName ? ` · ${e.eventName}` : ""}
                          </span>
                          <Badge variant={e.points < 0 ? "destructive" : "secondary"}>{formatPoints(e.points)}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(e.createdAt).toLocaleDateString()}
                          {e.awardedByName ? ` · ${e.awardedByName}` : ""}
                          {e.source !== "manual" ? ` · ${e.source}` : ""}
                        </p>
                        {e.reason && <p className="text-xs">&ldquo;{e.reason}&rdquo;</p>}
                        {e.voidedAt && <p className="text-xs">Voided: {e.voidReason}</p>}
                        {!e.voidedAt &&
                          (voidingId === e.id ? (
                            <div className="space-y-1.5 pt-1">
                              <Input
                                aria-label="Reason for voiding"
                                placeholder="Why are you voiding this?"
                                value={voidReason}
                                onChange={(ev) => setVoidReason(ev.target.value)}
                              />
                              <p className="text-xs text-muted-foreground">
                                The entry stays in the history, crossed out, and stops counting toward the total.
                              </p>
                              <div className="flex gap-2">
                                <Button size="sm" variant="destructive" disabled={isPending || !voidReason.trim()} onClick={() => confirmVoid(e.id)}>
                                  Void entry
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setVoidingId(null)}>
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button size="xs" variant="ghost" onClick={() => setVoidingId(e.id)}>
                              Void
                            </Button>
                          ))}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Mount them in the workspace**

In `applicants-workspace.tsx`: import `AddApplicantDialog`, `GivePointsDialog`, `ApplicantPanel`; add `const [givingId, setGivingId] = useState<string | null>(null);` and derive `const selected = rows.find((r) => r.id === selectedId) ?? null; const giving = rows.find((r) => r.id === givingId) ?? null;`. Replace `addButton={null}` with `addButton={<AddApplicantDialog quarterId={quarterId} />}`, add the same dialog next to `<HowItWorks />` in the header (wrap both in a `flex gap-2` div), delete `<span hidden>{selectedId}</span>`, and render just before the closing `</div>`:

```tsx
      <ApplicantPanel
        applicant={selected}
        onClose={() => setSelectedId(null)}
        onGivePoints={() => setGivingId(selectedId)}
      />
      <GivePointsDialog
        applicant={giving}
        categories={categories}
        events={events}
        onOpenChange={(open) => !open && setGivingId(null)}
      />
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all pass.

Manual (dev server, migration applied): add "Jessica Kim" → appears in list; open **Add applicant**, type "Jess K." → amber "might be someone already added" with Jessica Kim, button reads "Add anyway"; type Jessica's email → red hard-duplicate message, button disabled; give Jessica "Info Session" (+1) → ring and total update; give "Coffee Chat No-show" (−1) → the button stays disabled until a reason is typed; void an entry → it appears crossed out and the total drops; the panel shows "Previously applied" only when set.

- [ ] **Step 6: Commit**

```bash
git add "src/app/portal/(app)/admin/applicants"
git commit -m "Add applicant creation, point awarding and applicant side panel"
```

---

### Task 8: Setup tab (categories and events)

**Files:**
- Create: `src/app/portal/(app)/admin/applicants/setup-view.tsx`
- Create: `src/app/portal/(app)/admin/applicants/category-dialog.tsx`
- Create: `src/app/portal/(app)/admin/applicants/event-dialog.tsx`
- Modify: `src/app/portal/(app)/admin/applicants/applicants-workspace.tsx` (mount `SetupView`)

**Interfaces:**
- Consumes: Task 5 actions `createCategoryAction`, `updateCategoryAction`, `setCategoryArchivedAction`, `reorderCategoriesAction`, `createEventAction`, `deleteEventAction`; `RECRUIT_SECTIONS`.
- Produces: `SetupView` props `{ quarterId: string; categories: RecruitCategory[]; events: RecruitEvent[] }`; `CategoryDialog` props `{ category?: RecruitCategory; trigger: React.ReactElement }`; `EventDialog` props `{ quarterId: string; categories: RecruitCategory[]; trigger: React.ReactElement }`.

- [ ] **Step 1: Category dialog (create and edit)**

Create `src/app/portal/(app)/admin/applicants/category-dialog.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createCategoryAction, updateCategoryAction } from "@/actions/recruit";
import type { RecruitCategory } from "@/lib/data/recruit";
import { RECRUIT_SECTIONS, type RecruitSection } from "@/lib/recruit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CategoryDialog({ category, trigger }: { category?: RecruitCategory; trigger: React.ReactElement }) {
  const isEdit = !!category;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(category?.name ?? "");
  const [section, setSection] = useState<RecruitSection>(category?.section ?? "engagement");
  const [points, setPoints] = useState(String(category?.defaultPoints ?? 1));
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    const input = { name, section, defaultPoints: Number(points) };
    startTransition(async () => {
      const result = isEdit ? await updateCategoryAction(category.id, input) : await createCategoryAction(input);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(isEdit ? "Category updated." : "Category added.");
      setOpen(false);
      if (!isEdit) {
        setName("");
        setPoints("1");
      }
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit category" : "New category"}</DialogTitle>
          <DialogDescription>
            A category is a reason to give points, like &ldquo;Info Session&rdquo;. Changing the usual points only affects
            future entries; past entries keep what they were given.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="category-name">Name</FieldLabel>
            <Input id="category-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Case workshop" />
          </Field>
          <Field>
            <FieldLabel>Section</FieldLabel>
            <Select value={section} onValueChange={(v) => v && setSection(v as RecruitSection)}>
              <SelectTrigger className="w-full">
                <SelectValue>{(value: string) => RECRUIT_SECTIONS.find((s) => s.value === value)?.label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {RECRUIT_SECTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>Sections are how points will roll up into the final ranking later.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="category-points">Usual points</FieldLabel>
            <Input id="category-points" type="number" step="0.5" value={points} onChange={(e) => setPoints(e.target.value)} />
            <FieldDescription>Use a negative number for a penalty, like −1 for a no-show.</FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button disabled={isPending || !name.trim() || points.trim() === ""} onClick={submit}>
            {isEdit ? "Save" : "Add category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Event dialog**

Create `src/app/portal/(app)/admin/applicants/event-dialog.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createEventAction } from "@/actions/recruit";
import type { RecruitCategory } from "@/lib/data/recruit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function EventDialog({
  quarterId,
  categories,
  trigger,
}: {
  quarterId: string;
  categories: RecruitCategory[];
  trigger: React.ReactElement;
}) {
  const choices = categories.filter((c) => !c.archived);
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState(choices[0]?.id ?? "");
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    startTransition(async () => {
      const result = await createEventAction({ quarterId, categoryId, name, date });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Event added.");
      setOpen(false);
      setName("");
      setDate("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New event</DialogTitle>
          <DialogDescription>
            An event is one dated occurrence, like &ldquo;Info Session 1&rdquo; on Oct 14. Attaching points to an event lets
            you see who missed which one.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Category</FieldLabel>
            <Select value={categoryId} onValueChange={(v) => v && setCategoryId(v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick a category">
                  {(value: string) => choices.find((c) => c.id === value)?.name}
                </SelectValue>
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
            <FieldLabel htmlFor="event-name">Name</FieldLabel>
            <Input id="event-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Info Session 1" />
          </Field>
          <Field>
            <FieldLabel htmlFor="event-date">Date</FieldLabel>
            <Input id="event-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button disabled={isPending || !categoryId || !name.trim() || !date} onClick={submit}>
            Add event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Setup view**

Create `src/app/portal/(app)/admin/applicants/setup-view.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import { deleteEventAction, reorderCategoriesAction, setCategoryArchivedAction } from "@/actions/recruit";
import type { RecruitCategory, RecruitEvent } from "@/lib/data/recruit";
import { RECRUIT_SECTIONS, formatPoints } from "@/lib/recruit";
import { formatDateLong } from "@/lib/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryDialog } from "./category-dialog";
import { EventDialog } from "./event-dialog";

export function SetupView({
  quarterId,
  categories,
  events,
}: {
  quarterId: string;
  categories: RecruitCategory[];
  events: RecruitEvent[];
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const active = categories.filter((c) => !c.archived);
  const archived = categories.filter((c) => c.archived);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  function run(action: () => Promise<{ error?: string }>, success?: string) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (success) toast.success(success);
      router.refresh();
    });
  }

  function move(index: number, delta: -1 | 1) {
    const ids = active.map((c) => c.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(() => reorderCategoriesAction(ids));
  }

  return (
    <div className="mt-4 grid items-start gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Point categories</CardTitle>
            <CardDescription>
              The reasons you can give points for. Archived categories keep their history but can&apos;t be picked for new entries.
            </CardDescription>
          </div>
          <CategoryDialog
            trigger={
              <Button size="sm">
                <Plus />
                New category
              </Button>
            }
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="divide-y rounded-lg border">
            {active.map((c, i) => (
              <li key={c.id} className="flex items-center gap-2 p-2.5 text-sm">
                <div className="flex flex-col">
                  <Button size="icon-xs" variant="ghost" aria-label={`Move ${c.name} up`} disabled={isPending || i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label={`Move ${c.name} down`} disabled={isPending || i === active.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown />
                  </Button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {RECRUIT_SECTIONS.find((s) => s.value === c.section)?.label}
                  </div>
                </div>
                <Badge variant={c.defaultPoints < 0 ? "destructive" : "secondary"}>{formatPoints(c.defaultPoints)}</Badge>
                <CategoryDialog
                  category={c}
                  trigger={
                    <Button size="icon-sm" variant="ghost" aria-label={`Edit ${c.name}`}>
                      <Pencil />
                    </Button>
                  }
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Archive ${c.name}`}
                  disabled={isPending}
                  onClick={() => run(() => setCategoryArchivedAction(c.id, true), `${c.name} archived.`)}
                >
                  <Archive />
                </Button>
              </li>
            ))}
            {active.length === 0 && <li className="p-3 text-sm text-muted-foreground">No categories yet. Add the first one.</li>}
          </ul>

          {archived.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Archived</h4>
              <ul className="divide-y rounded-lg border">
                {archived.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 p-2.5 text-sm text-muted-foreground">
                    <span>{c.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => run(() => setCategoryArchivedAction(c.id, false), `${c.name} restored.`)}
                    >
                      <ArchiveRestore />
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Events this quarter</CardTitle>
            <CardDescription>Dated occurrences, like Info Session 1. Attach points to them to track who showed up.</CardDescription>
          </div>
          <EventDialog
            quarterId={quarterId}
            categories={categories}
            trigger={
              <Button size="sm" disabled={active.length === 0}>
                <Plus />
                New event
              </Button>
            }
          />
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events yet. Add one when you schedule an info session or mixer.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {events.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 p-2.5 text-sm">
                  <div>
                    <div className="font-medium">{e.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {categoryName.get(e.categoryId) ?? "Unknown category"} · {formatDateLong(e.date)}
                    </div>
                  </div>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Delete ${e.name}`}
                    disabled={isPending}
                    onClick={() => run(() => deleteEventAction(e.id), "Event deleted.")}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Mount in the workspace**

In `applicants-workspace.tsx` import `SetupView` and replace the Setup placeholder `<p>` with:

```tsx
          <SetupView quarterId={quarterId} categories={categories} events={events} />
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all pass.

Manual: create a category "Case Workshop" +1.5 in Engagement → listed; move it up/down; edit its points; archive it → moves to Archived and disappears from the Give-points picker; restore it; create event "Info Session 1" under Info Session → shows in Give-points event picker; give points with that event, then try deleting the event → friendly error "already has points attached".

- [ ] **Step 6: Commit**

```bash
git add "src/app/portal/(app)/admin/applicants"
git commit -m "Add recruitment Setup tab for categories and events"
```

---

### Task 9: Duplicates tab (merge, dismiss, undo)

**Files:**
- Create: `src/app/portal/(app)/admin/applicants/duplicates-view.tsx`
- Modify: `src/app/portal/(app)/admin/applicants/applicants-workspace.tsx` (mount `DuplicatesView`, remove the last scaffold)

**Interfaces:**
- Consumes: Task 5 actions `mergeApplicantsAction`, `undoMergeAction`, `dismissDuplicateAction`; Task 3 `needsEmailChoice`; Task 2 `DuplicatePair`; Task 4 `ApplicantRow`, `MergeLogRow`.
- Produces: `DuplicatesView` props `{ rows: ApplicantRow[]; pairs: DuplicatePair[]; merges: MergeLogRow[] }`.

- [ ] **Step 1: Duplicates view**

Create `src/app/portal/(app)/admin/applicants/duplicates-view.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { dismissDuplicateAction, mergeApplicantsAction, undoMergeAction } from "@/actions/recruit";
import type { ApplicantRow, MergeLogRow } from "@/lib/data/recruit";
import type { DuplicatePair } from "@/lib/recruit-matching";
import { needsEmailChoice } from "@/lib/recruit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const REASON_TEXT: Record<DuplicatePair["reason"], string> = {
  email: "Same email",
  name: "Same name",
  alias: "Matches a saved display name",
  fuzzy: "Similar names",
};

function PersonCard({ person }: { person: ApplicantRow }) {
  return (
    <div className="flex-1 rounded-lg border p-3 text-sm">
      <div className="font-medium">{person.name}</div>
      <div className="text-muted-foreground">{person.email ?? "No email yet"}</div>
      <div className="text-muted-foreground">{[person.major, person.year].filter(Boolean).join(" · ") || "No major or year"}</div>
      <div className="mt-1">
        {person.total} pt{person.total === 1 ? "" : "s"} · {person.entries.filter((e) => !e.voidedAt).length} entries
      </div>
    </div>
  );
}

function PairCard({ a, b, pair }: { a: ApplicantRow; b: ApplicantRow; pair: DuplicatePair }) {
  const [keepEmail, setKeepEmail] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const emailChoice = needsEmailChoice(a, b);
  const blocked = emailChoice && !keepEmail;

  function merge(survivor: ApplicantRow, absorbed: ApplicantRow) {
    startTransition(async () => {
      const result = await mergeApplicantsAction({
        survivorId: survivor.id,
        absorbedId: absorbed.id,
        keepEmail: emailChoice ? keepEmail : null,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Merged ${absorbed.name} into ${survivor.name}. You can undo this below.`);
      router.refresh();
    });
  }

  function dismiss() {
    startTransition(async () => {
      const result = await dismissDuplicateAction(a.id, b.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Got it — they won't be suggested again.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-center gap-2 text-sm">
          <Badge variant={pair.kind === "maybe" ? "outline" : "secondary"}>{REASON_TEXT[pair.reason]}</Badge>
          <span className="text-muted-foreground">{pair.score}% match</span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <PersonCard person={a} />
          <PersonCard person={b} />
        </div>

        {emailChoice && (
          <fieldset className="space-y-1 text-sm">
            <legend className="font-medium">They have different emails — which one should the merged record keep?</legend>
            {[a.email, b.email].map((email) => (
              <label key={email} className="flex items-center gap-2">
                <input type="radio" name={`email-${a.id}-${b.id}`} checked={keepEmail === email} onChange={() => setKeepEmail(email)} />
                {email}
              </label>
            ))}
          </fieldset>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={isPending || blocked} onClick={() => merge(a, b)}>
            Merge into {a.name}
          </Button>
          <Button size="sm" disabled={isPending || blocked} onClick={() => merge(b, a)}>
            Merge into {b.name}
          </Button>
          <Button size="sm" variant="outline" disabled={isPending} onClick={dismiss}>
            Not the same person
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Merging moves all points and saved names to the record you keep. You can undo a merge from the list below.
        </p>
      </CardContent>
    </Card>
  );
}

export function DuplicatesView({
  rows,
  pairs,
  merges,
}: {
  rows: ApplicantRow[];
  pairs: DuplicatePair[];
  merges: MergeLogRow[];
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const byId = new Map(rows.map((r) => [r.id, r]));

  function undo(id: string) {
    startTransition(async () => {
      const result = await undoMergeAction(id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Merge undone.");
      router.refresh();
    });
  }

  return (
    <div className="mt-4 space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-medium">Possible duplicates</h2>
        {pairs.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No duplicates to check. If someone is entered twice later, they&apos;ll show up here.
          </p>
        ) : (
          pairs.map((p) => {
            const a = byId.get(p.a);
            const b = byId.get(p.b);
            return a && b ? <PairCard key={`${p.a}:${p.b}`} a={a} b={b} pair={p} /> : null;
          })
        )}
      </section>

      {merges.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Recent merges</h2>
          <ul className="divide-y rounded-lg border">
            {merges.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 p-2.5 text-sm">
                <span>
                  <b>{m.absorbedName}</b> merged into <b>{m.survivorName}</b>
                  <span className="text-muted-foreground"> · {new Date(m.createdAt).toLocaleDateString()}</span>
                </span>
                <Button size="sm" variant="outline" disabled={isPending} onClick={() => undo(m.id)}>
                  <Undo2 />
                  Undo
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Mount in the workspace**

In `applicants-workspace.tsx` import `DuplicatesView`, destructure `merges` from props, and replace the Duplicates placeholder `<p>` with:

```tsx
          <DuplicatesView rows={rows} pairs={pairs} merges={merges} />
```

Confirm no "arrive in a later task" text or hidden span remains: `grep -n "later task\|hidden" "src/app/portal/(app)/admin/applicants/applicants-workspace.tsx"` should print nothing.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all pass.

Manual: add "Jessica Kim" (email) and "Jess K." (no email, via "Add anyway") → Duplicates tab shows the pair with "Similar names"; merge Jess K. into Jessica → points and email stay on Jessica, the Duplicates count drops, "Recent merges" lists it; Undo → both records return with their original points; add two people with different emails and similar names, try to merge → buttons disabled until an email radio is chosen; "Not the same person" removes the pair and it stays gone after refresh.

- [ ] **Step 4: Commit**

```bash
git add "src/app/portal/(app)/admin/applicants"
git commit -m "Add duplicates review with merge, dismiss and undo"
```

---

### Task 10: Final verification and spec alignment

**Files:**
- Modify: `docs/superpowers/specs/2026-10-07-recruitment-points-foundation-design.md`

- [ ] **Step 1: Align the spec with what was built**

In the spec, make these edits so it matches the implementation:
- Under "Duplicate detection", delete the sentence "Auto-accept threshold defaults to exact normalized matches only; anything else is surfaced for a human. The threshold is an `org_settings` value (`recruit_match_auto_accept`) so it can be tuned later." and replace it with: "Piece 1 never auto-accepts a match; every suspected duplicate is surfaced for a human. An auto-accept threshold (exact normalized matches only by default) arrives with the bulk importer in piece 2."
- Under `### recruit_merge_log`, add `added_alias_id uuid` to the column list and note the merge function also takes `p_absorbed_alias`.

- [ ] **Step 2: Full verification**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green. If `npm run build` is part of CI for this repo (check `package.json` scripts), also run `npm run build` and confirm it passes.

- [ ] **Step 3: Walk the Review Focus list manually**

With the migration applied, confirm each Review Focus item once in the dev server: Zoom-style name (add "Jessica Kim", then in Add dialog type "Kim, Jessica (she/her)" → warns); same name different email → amber (not red); identical email → red and blocked; −1 without reason blocked; archived category absent from the picker; merge with differing emails blocked until chosen, undo restores; empty quarter and no-quarter states render.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-10-07-recruitment-points-foundation-design.md
git commit -m "Align recruitment points spec with implementation"
```
