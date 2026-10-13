# Applicant Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the Fall 2026 Form export into the portal, auto-assign each applicant to N blind reviewers, let reviewers score from an in-portal application view, and show progress and unlocked scores on one dashboard.

**Architecture:** New `recruit_*` tables (answers, assignments, exclusions, reveals) sit beside the existing review/rubric tables. Pure, unit-tested libs hold all logic (sheet parsing, classification, assignment, unlock rule, dashboard shaping). The existing `getScoringBundle` is changed so the resume stage only returns what the viewer may see; new server actions and three UI pieces (import dialog, queue + application card, Review progress tab) sit on top. Existing scoring math (weighted mean, z-score normalization, composite ranking) is untouched.

**Tech Stack:** Next.js 16 (breaking-changes build, see AGENTS.md), Supabase Postgres + RLS, TypeScript, Vitest, base-ui shadcn components, sonner, `read-excel-file` (new, browser-side only).

**Spec:** `docs/superpowers/specs/2026-10-12-applicant-review-design.md`

## Global Constraints

- Before writing any Next.js code (Tasks 7–10), read the relevant guides in `node_modules/next/dist/docs/01-app/01-getting-started/` (at least `05-server-and-client-components.md` and `07-mutating-data.md`) and heed deprecation notices.
- Migration filename: `supabase/migrations/20261012000001_applicant_review.sql`. All new tables exec-only RLS via `public.is_exec()`, no anon policy.
- `.env.local` points at a **hosted** Supabase project (no local DB). **Never apply the migration or run any import against it without asking the user first.** Test data must go in a clearly labeled test quarter.
- Defaults: reviewers per applicant = 2; reviewer pool = all non-archived exec-role profiles (empty pool setting means "all execs"); rubric scale 1–5.
- Interview availability columns (Mon–Fri and "other date/time") are ignored on import and never stored.
- Reveal rule: for the resume stage an applicant's other-reviewer scores, aggregate, disagreement flag and decision-view summary stay hidden from everyone (including the viewer after they submit) until every assigned reviewer has submitted, or an exec force-reveals that applicant. Enforced in the server data layer. Interview stage keeps its current "visible after you submit" behavior.
- The sheet's name column is labelled "First, Last Name": `"Vinesh, Balamurugan"` means first = Vinesh, last = Balamurugan. Comma-names become `"First Last"` (NOT flipped). Plain names pass through.
- Do not touch the merge SQL function. Assignments of an applicant merged away are not moved (dashboard only lists live applicants; re-running Assign tops up the survivor). This replaces the spec line "assignments move with the survivor".
- Commit messages: plain, no `Co-Authored-By`/Claude attribution (user's standing rule overrides the harness reminder).
- Tests: `npx vitest run <file>`; full gate at the end: `npx vitest run && npm run lint && npx tsc --noEmit`.
- UI: invoke the `frontend-design:frontend-design` skill before Tasks 8–10. New screens: one primary action per screen, no nested cards, generous spacing, readable at phone width (stack, no horizontal page scroll).

## Review Focus

Most likely to bite a real user, each with a test in the owning task:

1. A form respondent submitted twice (same email, different case/spacing) — keep the latest, count the duplicates (Task 3).
2. CSV export with BOM, CRLF and essays containing commas, quotes and newlines — essay text must survive intact (Task 3).
3. Fewer eligible reviewers than N (pool of 1, or exclusions leave too few) — refuse with a clear message, assign nothing (Task 4).
4. Clicking Assign twice, or after new applicants arrive — idempotent, only fills shortfalls (Task 4).
5. A reviewer opening or submitting for an applicant not assigned to them, and unlock never leaking before all assigned submit (Tasks 4, 6, 7).

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261012000001_applicant_review.sql` | tables, settings keys, default rubric, `commit_application_import`, `undo_application_import` |
| `src/lib/supabase/database.types.ts` | typed tables/functions (modify) |
| `src/lib/csv-parse.ts` | full CSV text → rows (quotes/newlines/BOM) |
| `src/lib/recruit-review-settings.ts` | `ReviewSettings` parse/validate |
| `src/lib/recruit-applications.ts` | sheet → `ParsedApplication`, classify vs existing, commit rows, Drive embed URL |
| `src/lib/recruit-assignment.ts` | assignment algorithm, self-exclusion, `reviewState`, `resumeVisibility` |
| `src/lib/recruit-review-dashboard.ts` | pure dashboard shaping |
| `src/lib/read-spreadsheet.ts` | browser adapter: `.xlsx`/`.csv` File → `unknown[][]` |
| `src/lib/data/recruit-review.ts` | server reads: pool, assignments, exclusions, reveals, answers, settings |
| `src/lib/data/recruit-scoring.ts` | blind rule + dashboard in bundle (modify) |
| `src/actions/recruit-review.ts` | import / assign / reassign / reveal / settings actions |
| `src/actions/recruit.ts` | assignment guard in `saveReviewAction` (modify) |
| `…/applicants/import-applications-dialog.tsx` | upload → review → done flow |
| `…/applicants/application-card.tsx` | readable application + resume preview |
| `…/applicants/review-progress-view.tsx` | dashboard tab + reassign dialog |
| `…/applicants/review-settings-card.tsx` | N + reviewer pool, in Setup |
| `…/applicants/{scoring-view,setup-view,applicants-workspace}.tsx` | wiring (modify) |

(`…/applicants/` = `src/app/portal/(app)/admin/applicants/`)

---

### Task 1: Migration and types

**Files:**
- Create: `supabase/migrations/20261012000001_applicant_review.sql`
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces: tables `recruit_applicant_answers`, `recruit_review_assignments`, `recruit_review_exclusions`, `recruit_review_reveals`; RPCs `commit_application_import(p_quarter uuid, p_rows jsonb) → jsonb {batchId, created, updated, skipped}`, `undo_application_import(p_batch uuid) → integer`; org_settings keys `recruit_reviewers_per_applicant`, `recruit_reviewer_pool`.

- [ ] **Step 1: Write the migration**

```sql
-- Applicant review: imported application answers, blind reviewer assignment. See
-- docs/superpowers/specs/2026-10-12-applicant-review-design.md.

create table public.recruit_applicant_answers (
  applicant_id uuid primary key references public.recruit_applicants (id) on delete cascade,
  submitted_at timestamptz,
  graduation_term text,
  how_heard text,
  essay_why text,
  essay_teamwork text,
  essay_bring text,
  resume_url text,
  import_batch_id uuid,
  updated_at timestamptz not null default now()
);
alter table public.recruit_applicant_answers enable row level security;
create policy recruit_applicant_answers_all on public.recruit_applicant_answers
  for all to authenticated using (public.is_exec()) with check (public.is_exec());
create trigger recruit_applicant_answers_set_updated_at
  before update on public.recruit_applicant_answers
  for each row execute procedure public.set_updated_at();

create table public.recruit_review_assignments (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.recruit_applicants (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  stage text not null default 'resume' check (stage in ('resume', 'interview')),
  assigned_at timestamptz not null default now(),
  constraint recruit_review_assignments_unique unique (applicant_id, reviewer_id, stage)
);
create index recruit_review_assignments_reviewer_idx on public.recruit_review_assignments (reviewer_id);
alter table public.recruit_review_assignments enable row level security;
create policy recruit_review_assignments_all on public.recruit_review_assignments
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create table public.recruit_review_exclusions (
  applicant_id uuid not null references public.recruit_applicants (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  primary key (applicant_id, reviewer_id)
);
alter table public.recruit_review_exclusions enable row level security;
create policy recruit_review_exclusions_all on public.recruit_review_exclusions
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create table public.recruit_review_reveals (
  applicant_id uuid not null references public.recruit_applicants (id) on delete cascade,
  stage text not null default 'resume' check (stage in ('resume', 'interview')),
  revealed_by uuid references public.profiles (id) on delete set null,
  revealed_at timestamptz not null default now(),
  primary key (applicant_id, stage)
);
alter table public.recruit_review_reveals enable row level security;
create policy recruit_review_reveals_all on public.recruit_review_reveals
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

insert into public.org_settings (key, value) values
  ('recruit_reviewers_per_applicant', '2'),
  ('recruit_reviewer_pool', '')
on conflict (key) do nothing;

-- Replace the three starter resume criteria with the generic application rubric,
-- but only if nobody has edited them yet.
do $$
declare rid uuid;
begin
  select id into rid from public.recruit_rubrics where stage = 'resume';
  if rid is not null and (
    select array_agg(name order by name) from public.recruit_rubric_criteria
    where rubric_id = rid and archived_at is null
  ) = array['Leadership & impact', 'Relevant experience', 'Written communication'] then
    update public.recruit_rubric_criteria set archived_at = now()
      where rubric_id = rid and archived_at is null;
    insert into public.recruit_rubric_criteria (rubric_id, name, description, weight, sort_order) values
      (rid, 'Motivation and fit', '1 = generic or unclear reason for joining, 5 = specific, genuine motivation that fits what 180DC does', 1, 10),
      (rid, 'Teamwork and collaboration', '1 = vague or no real team example, 5 = clear example with a challenge handled well', 1, 20),
      (rid, 'Problem-solving and communication', '1 = hard to follow, no clear reasoning, 5 = clear, structured, thoughtful writing', 1, 30),
      (rid, 'Breadth of experience and perspective', '1 = little beyond the basics, 5 = distinctive experience or viewpoint that would strengthen a team', 1, 40),
      (rid, 'Resume and professionalism', '1 = incomplete or careless, 5 = polished, relevant and well organized', 1, 50);
  end if;
end $$;

create or replace function public.commit_application_import(p_quarter uuid, p_rows jsonb)
returns jsonb
language plpgsql
as $$
declare
  batch uuid := gen_random_uuid();
  r jsonb;
  a jsonb;
  applicant uuid;
  clean_email text;
  created_n int := 0;
  updated_n int := 0;
  skipped_n int := 0;
begin
  if not public.is_exec() then
    raise exception 'Only exec can import applications.';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    applicant := null;
    a := coalesce(r -> 'answers', '{}'::jsonb);
    clean_email := nullif(lower(btrim(coalesce(r ->> 'email', ''))), '');

    if r ->> 'kind' = 'update' then
      applicant := (r ->> 'applicantId')::uuid;
      if not exists (
        select 1 from public.recruit_applicants
        where id = applicant and quarter_id = p_quarter and archived_at is null
      ) then
        skipped_n := skipped_n + 1;
        continue;
      end if;
    elsif clean_email is not null then
      select id into applicant from public.recruit_applicants
        where quarter_id = p_quarter and email = clean_email and archived_at is null;
    end if;

    if applicant is null then
      insert into public.recruit_applicants (quarter_id, name, email, major, year, application_link, created_by_batch_id)
      values (
        p_quarter, btrim(r ->> 'name'), clean_email,
        nullif(btrim(coalesce(r ->> 'major', '')), ''),
        nullif(btrim(coalesce(r ->> 'year', '')), ''),
        nullif(btrim(coalesce(a ->> 'resumeUrl', '')), ''),
        batch
      ) returning id into applicant;
      created_n := created_n + 1;
    else
      update public.recruit_applicants set
        email = coalesce(email, clean_email),
        major = coalesce(major, nullif(btrim(coalesce(r ->> 'major', '')), '')),
        year = coalesce(year, nullif(btrim(coalesce(r ->> 'year', '')), '')),
        application_link = coalesce(application_link, nullif(btrim(coalesce(a ->> 'resumeUrl', '')), ''))
      where id = applicant;
      updated_n := updated_n + 1;
    end if;

    insert into public.recruit_applicant_answers
      (applicant_id, submitted_at, graduation_term, how_heard, essay_why, essay_teamwork, essay_bring, resume_url, import_batch_id)
    values (
      applicant,
      nullif(a ->> 'submittedAt', '')::timestamptz,
      nullif(a ->> 'graduationTerm', ''), nullif(a ->> 'howHeard', ''),
      nullif(a ->> 'essayWhy', ''), nullif(a ->> 'essayTeamwork', ''), nullif(a ->> 'essayBring', ''),
      nullif(a ->> 'resumeUrl', ''), batch
    )
    on conflict (applicant_id) do update set
      submitted_at = excluded.submitted_at,
      graduation_term = excluded.graduation_term,
      how_heard = excluded.how_heard,
      essay_why = excluded.essay_why,
      essay_teamwork = excluded.essay_teamwork,
      essay_bring = excluded.essay_bring,
      resume_url = excluded.resume_url,
      import_batch_id = excluded.import_batch_id;
  end loop;

  return jsonb_build_object('batchId', batch, 'created', created_n, 'updated', updated_n, 'skipped', skipped_n);
end;
$$;

-- Archives the applicants this import created (unless they already have submitted reviews or live points).
-- Updates made to applicants that already existed are kept.
create or replace function public.undo_application_import(p_batch uuid)
returns integer
language plpgsql
as $$
declare
  ids uuid[];
begin
  if not public.is_exec() then
    raise exception 'Only exec can undo an import.';
  end if;

  with gone as (
    update public.recruit_applicants a set archived_at = now()
    where a.created_by_batch_id = p_batch
      and a.archived_at is null
      and not exists (select 1 from public.recruit_points p where p.applicant_id = a.id and p.voided_at is null)
      and not exists (select 1 from public.recruit_reviews r where r.applicant_id = a.id and r.submitted_at is not null)
    returning a.id
  )
  select coalesce(array_agg(id), '{}') into ids from gone;

  delete from public.recruit_review_assignments where applicant_id = any (ids);
  return coalesce(array_length(ids, 1), 0);
end;
$$;
```

- [ ] **Step 2: Add types.** In `src/lib/supabase/database.types.ts`, next to `recruit_reviews` (same `Row`/`Insert`/`Update`/`Relationships: []` shape), add:

```ts
      recruit_applicant_answers: {
        Row: {
          applicant_id: string;
          submitted_at: string | null;
          graduation_term: string | null;
          how_heard: string | null;
          essay_why: string | null;
          essay_teamwork: string | null;
          essay_bring: string | null;
          resume_url: string | null;
          import_batch_id: string | null;
          updated_at: string;
        };
        Insert: {
          applicant_id: string;
          submitted_at?: string | null;
          graduation_term?: string | null;
          how_heard?: string | null;
          essay_why?: string | null;
          essay_teamwork?: string | null;
          essay_bring?: string | null;
          resume_url?: string | null;
          import_batch_id?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["recruit_applicant_answers"]["Insert"]>;
        Relationships: [];
      };
      recruit_review_assignments: {
        Row: { id: string; applicant_id: string; reviewer_id: string; stage: "resume" | "interview"; assigned_at: string };
        Insert: { id?: string; applicant_id: string; reviewer_id: string; stage?: "resume" | "interview"; assigned_at?: string };
        Update: Partial<Database["public"]["Tables"]["recruit_review_assignments"]["Insert"]>;
        Relationships: [];
      };
      recruit_review_exclusions: {
        Row: { applicant_id: string; reviewer_id: string };
        Insert: { applicant_id: string; reviewer_id: string };
        Update: Partial<Database["public"]["Tables"]["recruit_review_exclusions"]["Insert"]>;
        Relationships: [];
      };
      recruit_review_reveals: {
        Row: { applicant_id: string; stage: "resume" | "interview"; revealed_by: string | null; revealed_at: string };
        Insert: { applicant_id: string; stage?: "resume" | "interview"; revealed_by?: string | null; revealed_at?: string };
        Update: Partial<Database["public"]["Tables"]["recruit_review_reveals"]["Insert"]>;
        Relationships: [];
      };
```

and in `Functions` (next to `merge_recruit_applicants`):

```ts
      commit_application_import: {
        Args: { p_quarter: string; p_rows: unknown };
        Returns: unknown;
      };
      undo_application_import: {
        Args: { p_batch: string };
        Returns: number;
      };
```

- [ ] **Step 3: Typecheck.** Run: `npx tsc --noEmit` — Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261012000001_applicant_review.sql src/lib/supabase/database.types.ts
git commit -m "Applicant review: schema for answers, blind assignments, reveals, default application rubric"
```

- [ ] **Step 5: Ask the user** (do not run the migration yourself): "Migration `20261012000001_applicant_review.sql` is ready. It must be applied to your hosted Supabase before the data layer and UI work in the browser. Want me to apply it, or will you?" Continue with Tasks 2–6 (pure code) while waiting.

---

### Task 2: Review settings

**Files:**
- Create: `src/lib/recruit-review-settings.ts`, `src/lib/recruit-review-settings.test.ts`

**Interfaces:**
- Produces: `ReviewSettings {perApplicant: number; pool: string[]}`, `DEFAULT_REVIEW_SETTINGS`, `REVIEW_SETTING_KEYS`, `validateReviewSettings(partial): string | null`, `parseReviewSettings(rows: {key,value}[]): ReviewSettings`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_REVIEW_SETTINGS, parseReviewSettings, validateReviewSettings } from "./recruit-review-settings";

describe("validateReviewSettings", () => {
  it("accepts whole numbers 1-10", () => {
    expect(validateReviewSettings({ perApplicant: 2 })).toBeNull();
    expect(validateReviewSettings({})).toBeNull();
  });
  it("rejects fractions, zero and too many", () => {
    expect(validateReviewSettings({ perApplicant: 1.5 })).toMatch(/whole number/);
    expect(validateReviewSettings({ perApplicant: 0 })).toMatch(/between 1 and 10/);
    expect(validateReviewSettings({ perApplicant: 11 })).toMatch(/between 1 and 10/);
  });
});

describe("parseReviewSettings", () => {
  it("falls back to defaults when unset or invalid", () => {
    expect(parseReviewSettings([])).toEqual(DEFAULT_REVIEW_SETTINGS);
    expect(parseReviewSettings([{ key: "recruit_reviewers_per_applicant", value: "abc" }])).toEqual(DEFAULT_REVIEW_SETTINGS);
  });
  it("reads N and a comma separated pool", () => {
    expect(
      parseReviewSettings([
        { key: "recruit_reviewers_per_applicant", value: "3" },
        { key: "recruit_reviewer_pool", value: "a, b,,c" },
      ]),
    ).toEqual({ perApplicant: 3, pool: ["a", "b", "c"] });
  });
});
```

- [ ] **Step 2:** Run `npx vitest run src/lib/recruit-review-settings.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
export interface ReviewSettings {
  perApplicant: number;
  /** Profile ids allowed to review; empty means every exec. */
  pool: string[];
}

export const DEFAULT_REVIEW_SETTINGS: ReviewSettings = { perApplicant: 2, pool: [] };

export const REVIEW_SETTING_KEYS = {
  perApplicant: "recruit_reviewers_per_applicant",
  pool: "recruit_reviewer_pool",
} as const;

export function validateReviewSettings(partial: Partial<ReviewSettings>): string | null {
  if (partial.perApplicant !== undefined) {
    if (!Number.isInteger(partial.perApplicant)) return "Reviewers per applicant has to be a whole number.";
    if (partial.perApplicant < 1 || partial.perApplicant > 10) return "Reviewers per applicant has to be between 1 and 10.";
  }
  return null;
}

export function parseReviewSettings(rows: { key: string; value: string }[]): ReviewSettings {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const n = Number(byKey.get(REVIEW_SETTING_KEYS.perApplicant));
  const perApplicant =
    Number.isFinite(n) && validateReviewSettings({ perApplicant: n }) === null ? n : DEFAULT_REVIEW_SETTINGS.perApplicant;
  const pool = (byKey.get(REVIEW_SETTING_KEYS.pool) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { perApplicant, pool };
}
```

- [ ] **Step 4:** Run the test — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/lib/recruit-review-settings*.ts && git commit -m "Applicant review: reviewer settings parsing"`

---

### Task 3: CSV parser and application sheet parser

**Files:**
- Create: `src/lib/csv-parse.ts`, `src/lib/csv-parse.test.ts`, `src/lib/recruit-applications.ts`, `src/lib/recruit-applications.test.ts`

**Interfaces:**
- Produces:
  - `parseCsvText(text: string): string[][]`
  - `ParsedApplication {rowNumber: number; name: string; email: string; submittedAt: string | null; graduationTerm: string | null; major: string | null; howHeard: string | null; essayWhy: string | null; essayTeamwork: string | null; essayBring: string | null; resumeUrl: string | null}`
  - `ParseResult {applications: ParsedApplication[]; skipped: {rowNumber: number; reason: string}[]; unmapped: string[]; duplicatesInFile: number; missingRequired: ("name" | "email")[]}`
  - `cleanApplicantName(raw: string): string`, `parseApplicationSheet(rows: unknown[][]): ParseResult`, `driveEmbedUrl(url: string | null): string | null`

- [ ] **Step 1: Failing tests**

`src/lib/csv-parse.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseCsvText } from "./csv-parse";

describe("parseCsvText", () => {
  it("handles quotes, embedded commas and newlines in cells", () => {
    const text = 'a,b\n"Hello, ""world""","line1\nline2"\n';
    expect(parseCsvText(text)).toEqual([["a", "b"], ['Hello, "world"', "line1\nline2"]]);
  });
  it("tolerates BOM, CRLF and blank lines", () => {
    expect(parseCsvText("﻿a,b\r\n1,2\r\n\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("keeps a final row without a trailing newline", () => {
    expect(parseCsvText("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});
```

`src/lib/recruit-applications.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { cleanApplicantName, driveEmbedUrl, parseApplicationSheet } from "./recruit-applications";

const HEADER = [
  "Timestamp",
  "Email Address",
  "First, Last Name",
  "Please indicate your graduation term. ",
  "Major/Minor",
  "How did you hear about 180 Degrees Consulting UCSC?",
  "Why are you interested in joining 180 Degrees Consulting? (250-word limit)",
  "Describe a time you worked on a project with a team. Highlight any challenges (250-word limit)",
  "We find that we are best able to carry out comprehensive consulting projects when we have a team made up of a diverse group of individuals with broad skills",
  "Please link your resume through Google Drive below.",
  "Please indicate your availability for an interview below. [Monday]",
  "If none of the above times work for you, please indicate a date and time that you are available.",
];

function row(over: Partial<Record<number, unknown>> = {}): unknown[] {
  const base: unknown[] = [
    "2026-09-30T22:31:01.878Z", "vibalamu@ucsc.edu", "Vinesh, Balamurugan", "Spring 2028", "Computer Engineering",
    "Referral", "Why text", "Team text", "Bring text", "https://drive.google.com/file/d/ABC_1-x/view", "1:00 PM", null,
  ];
  for (const [i, v] of Object.entries(over)) base[Number(i)] = v;
  return base;
}

describe("cleanApplicantName", () => {
  it("turns the form's 'First, Last' into 'First Last' without flipping", () => {
    expect(cleanApplicantName("Vinesh, Balamurugan")).toBe("Vinesh Balamurugan");
  });
  it("passes plain names through and collapses spaces", () => {
    expect(cleanApplicantName("  Lucia   Lim ")).toBe("Lucia Lim");
  });
});

describe("parseApplicationSheet", () => {
  it("maps the real headers and ignores availability columns", () => {
    const r = parseApplicationSheet([HEADER, row()]);
    expect(r.missingRequired).toEqual([]);
    expect(r.unmapped).toEqual([]);
    expect(r.applications).toEqual([
      {
        rowNumber: 2, name: "Vinesh Balamurugan", email: "vibalamu@ucsc.edu",
        submittedAt: "2026-09-30T22:31:01.878Z", graduationTerm: "Spring 2028", major: "Computer Engineering",
        howHeard: "Referral", essayWhy: "Why text", essayTeamwork: "Team text", essayBring: "Bring text",
        resumeUrl: "https://drive.google.com/file/d/ABC_1-x/view",
      },
    ]);
  });

  it("accepts Date cells for the timestamp", () => {
    const r = parseApplicationSheet([HEADER, row({ 0: new Date("2026-10-01T13:25:32.368Z") })]);
    expect(r.applications[0].submittedAt).toBe("2026-10-01T13:25:32.368Z");
  });

  it("reports columns it does not recognise instead of dropping them silently", () => {
    const r = parseApplicationSheet([[...HEADER, "Pronouns"], [...row(), "they/them"]]);
    expect(r.unmapped).toEqual(["Pronouns"]);
  });

  it("fails clearly when the name or email column is missing", () => {
    const r = parseApplicationSheet([["Timestamp", "Major"], ["x", "y"]]);
    expect(r.missingRequired).toEqual(["name", "email"]);
    expect(r.applications).toEqual([]);
  });

  it("skips rows without a usable name or email, with the sheet row number", () => {
    const r = parseApplicationSheet([HEADER, row({ 2: "" }), row({ 1: "not-an-email" }), row()]);
    expect(r.skipped).toEqual([
      { rowNumber: 2, reason: "Missing name" },
      { rowNumber: 3, reason: "Missing or invalid email" },
    ]);
    expect(r.applications).toHaveLength(1);
  });

  it("lowercases and trims emails, and keeps the latest of a double submission", () => {
    const r = parseApplicationSheet([
      HEADER,
      row({ 1: " Lucia@UCSC.edu ", 0: "2026-10-01T10:00:00Z", 6: "first" }),
      row({ 1: "lucia@ucsc.edu", 0: "2026-10-02T10:00:00Z", 6: "second" }),
    ]);
    expect(r.applications).toHaveLength(1);
    expect(r.applications[0].email).toBe("lucia@ucsc.edu");
    expect(r.applications[0].essayWhy).toBe("second");
    expect(r.duplicatesInFile).toBe(1);
  });

  it("keeps multi-line essays intact", () => {
    const r = parseApplicationSheet([HEADER, row({ 6: "line1\r\nline2 " })]);
    expect(r.applications[0].essayWhy).toBe("line1\nline2");
  });

  it("ignores fully blank rows without reporting them", () => {
    const r = parseApplicationSheet([HEADER, [], row()]);
    expect(r.skipped).toEqual([]);
  });
});

describe("driveEmbedUrl", () => {
  it("builds a preview url from file links", () => {
    expect(driveEmbedUrl("https://drive.google.com/file/d/ABC_1-x/view?usp=sharing")).toBe(
      "https://drive.google.com/file/d/ABC_1-x/preview",
    );
    expect(driveEmbedUrl("https://drive.google.com/open?id=ABC_1-x")).toBe("https://drive.google.com/file/d/ABC_1-x/preview");
  });
  it("returns null for anything else", () => {
    expect(driveEmbedUrl("https://example.com/resume.pdf")).toBeNull();
    expect(driveEmbedUrl(null)).toBeNull();
  });
});
```

- [ ] **Step 2:** Run `npx vitest run src/lib/csv-parse.test.ts src/lib/recruit-applications.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/csv-parse.ts`**

```ts
/** Parses a whole CSV text (quoted cells may contain commas, quotes and newlines). */
export function parseCsvText(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
```

- [ ] **Step 4: Implement `src/lib/recruit-applications.ts`**

```ts
import { isPlausibleEmail } from "@/lib/recruit";

export interface ParsedApplication {
  rowNumber: number;
  name: string;
  email: string;
  submittedAt: string | null;
  graduationTerm: string | null;
  major: string | null;
  howHeard: string | null;
  essayWhy: string | null;
  essayTeamwork: string | null;
  essayBring: string | null;
  resumeUrl: string | null;
}

export interface ParseResult {
  applications: ParsedApplication[];
  skipped: { rowNumber: number; reason: string }[];
  unmapped: string[];
  duplicatesInFile: number;
  missingRequired: ("name" | "email")[];
}

type Field = Exclude<keyof ParsedApplication, "rowNumber">;

const MATCHERS: { field: Field | "ignored"; test: (h: string) => boolean }[] = [
  { field: "ignored", test: (h) => h.includes("availability for an interview") || h.includes("none of the above times") },
  { field: "submittedAt", test: (h) => h === "timestamp" },
  { field: "email", test: (h) => h.includes("email") },
  { field: "name", test: (h) => /\bname\b/.test(h) },
  { field: "graduationTerm", test: (h) => h.includes("graduation") },
  { field: "major", test: (h) => h.includes("major") },
  { field: "howHeard", test: (h) => h.includes("hear about") },
  { field: "essayWhy", test: (h) => h.includes("why are you interested") },
  { field: "essayTeamwork", test: (h) => h.includes("project with a team") },
  { field: "essayBring", test: (h) => h.includes("diverse group") },
  { field: "resumeUrl", test: (h) => h.includes("resume") },
];

/** The form labels this column "First, Last Name", so a comma means First, Last — join, don't flip. */
export function cleanApplicantName(raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim();
  const m = t.match(/^([^,]+),\s*(.+)$/);
  return m ? `${m[1].trim()} ${m[2].trim()}` : t;
}

function cellText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  const s = String(v).replace(/\r\n?/g, "\n").trim();
  return s === "" ? null : s;
}

function toIso(v: unknown): string | null {
  const t = cellText(v);
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseApplicationSheet(rows: unknown[][]): ParseResult {
  const empty: ParseResult = { applications: [], skipped: [], unmapped: [], duplicatesInFile: 0, missingRequired: [] };
  const [header, ...body] = rows;
  if (!header) return { ...empty, missingRequired: ["name", "email"] };

  const columns = new Map<Field, number>();
  const unmapped: string[] = [];
  header.forEach((cell, index) => {
    const label = cellText(cell);
    if (!label) return;
    const h = label.toLowerCase();
    const hit = MATCHERS.find((m) => m.test(h));
    if (!hit) unmapped.push(label);
    else if (hit.field !== "ignored" && !columns.has(hit.field)) columns.set(hit.field, index);
  });

  const missingRequired = (["name", "email"] as const).filter((f) => !columns.has(f));
  if (missingRequired.length > 0) return { ...empty, unmapped, missingRequired };

  const get = (r: unknown[], f: Field) => (columns.has(f) ? cellText(r[columns.get(f)!]) : null);
  const byEmail = new Map<string, ParsedApplication>();
  const skipped: ParseResult["skipped"] = [];
  let duplicatesInFile = 0;

  body.forEach((r, i) => {
    const rowNumber = i + 2;
    if (!r.some((c) => cellText(c) !== null)) return;
    const name = cleanApplicantName(get(r, "name") ?? "");
    if (!name) return void skipped.push({ rowNumber, reason: "Missing name" });
    const email = (get(r, "email") ?? "").toLowerCase();
    if (!isPlausibleEmail(email)) return void skipped.push({ rowNumber, reason: "Missing or invalid email" });

    const app: ParsedApplication = {
      rowNumber,
      name,
      email,
      submittedAt: toIso(columns.has("submittedAt") ? r[columns.get("submittedAt")!] : null),
      graduationTerm: get(r, "graduationTerm"),
      major: get(r, "major"),
      howHeard: get(r, "howHeard"),
      essayWhy: get(r, "essayWhy"),
      essayTeamwork: get(r, "essayTeamwork"),
      essayBring: get(r, "essayBring"),
      resumeUrl: get(r, "resumeUrl"),
    };
    const prev = byEmail.get(email);
    if (prev) {
      duplicatesInFile++;
      if ((app.submittedAt ?? "") >= (prev.submittedAt ?? "")) byEmail.set(email, app);
    } else byEmail.set(email, app);
  });

  return { applications: [...byEmail.values()], skipped, unmapped, duplicatesInFile, missingRequired: [] };
}

export function driveEmbedUrl(url: string | null): string | null {
  if (!url) return null;
  const m =
    url.match(/drive\.google\.com\/file\/d\/([\w-]+)/) ?? url.match(/drive\.google\.com\/(?:open|uc)\?(?:.*&)?id=([\w-]+)/);
  return m ? `https://drive.google.com/file/d/${m[1]}/preview` : null;
}
```

- [ ] **Step 5:** Run both test files — Expected: PASS.
- [ ] **Step 6: Commit** — `git add src/lib/csv-parse* src/lib/recruit-applications* && git commit -m "Applicant review: parse the application spreadsheet"`

---

### Task 4: Assignment, review state and blind visibility

**Files:**
- Create: `src/lib/recruit-assignment.ts`, `src/lib/recruit-assignment.test.ts`

**Interfaces:**
- Produces:
  - `exclusionKey(applicantId, reviewerId): string`
  - `assignReviewers(input: AssignInput): AssignResult` where `AssignInput {applicantIds: string[]; pool: string[]; perApplicant: number; excluded: Set<string>; existing: Assignment[]; seed: number}`, `Assignment {applicantId: string; reviewerId: string}`, `AssignResult = {ok: true; added: Assignment[]} | {ok: false; applicantId: string; need: number; eligible: number}`
  - `selfExclusions(applicants: {id: string; email: string | null}[], reviewers: {id: string; email: string}[]): Set<string>`
  - `reviewState(assigned: string[], submitted: string[], forceRevealed: boolean): ApplicantReviewState` with `ApplicantReviewState {assigned: number; submitted: number; unlocked: boolean; status: "unassigned" | "not-started" | "in-progress" | "complete" | "revealed"}`
  - `resumeVisibility<T extends {reviewerId: string; submitted: boolean}>(viewerId: string, reviews: T[], unlocked: boolean): {mine: T | null; others: T[]}`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { assignReviewers, exclusionKey, resumeVisibility, reviewState, selfExclusions } from "./recruit-assignment";

const ids = (n: number, p: string) => Array.from({ length: n }, (_, i) => `${p}${i}`);

describe("assignReviewers", () => {
  it("gives every applicant exactly N distinct reviewers, balanced within one", () => {
    const applicantIds = ids(51, "a");
    const pool = ids(6, "r");
    const r = assignReviewers({ applicantIds, pool, perApplicant: 2, excluded: new Set(), existing: [], seed: 7 });
    if (!r.ok) throw new Error("expected ok");
    expect(r.added).toHaveLength(102);
    for (const a of applicantIds) {
      const mine = r.added.filter((x) => x.applicantId === a).map((x) => x.reviewerId);
      expect(new Set(mine).size).toBe(2);
    }
    const loads = pool.map((p) => r.added.filter((x) => x.reviewerId === p).length);
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(1);
  });

  it("is deterministic for a seed", () => {
    const base = { applicantIds: ids(10, "a"), pool: ids(6, "r"), perApplicant: 2, excluded: new Set<string>(), existing: [] };
    expect(assignReviewers({ ...base, seed: 3 })).toEqual(assignReviewers({ ...base, seed: 3 }));
  });

  it("never assigns an excluded reviewer", () => {
    const excluded = new Set([exclusionKey("a0", "r0"), exclusionKey("a0", "r1")]);
    const r = assignReviewers({ applicantIds: ["a0"], pool: ids(4, "r"), perApplicant: 2, excluded, existing: [], seed: 1 });
    if (!r.ok) throw new Error("expected ok");
    expect(r.added.map((x) => x.reviewerId).sort()).toEqual(["r2", "r3"]);
  });

  it("refuses, and assigns nothing, when too few reviewers are eligible", () => {
    const r = assignReviewers({ applicantIds: ["a0", "a1"], pool: ["r0"], perApplicant: 2, excluded: new Set(), existing: [], seed: 1 });
    expect(r).toEqual({ ok: false, applicantId: expect.any(String), need: 2, eligible: 1 });
  });

  it("is idempotent and only tops up shortfalls", () => {
    const base = { applicantIds: ids(8, "a"), pool: ids(6, "r"), perApplicant: 2, excluded: new Set<string>(), seed: 5 };
    const first = assignReviewers({ ...base, existing: [] });
    if (!first.ok) throw new Error("expected ok");
    const again = assignReviewers({ ...base, existing: first.added });
    expect(again).toEqual({ ok: true, added: [] });
    const grown = assignReviewers({ ...base, applicantIds: [...base.applicantIds, "new"], existing: first.added });
    if (!grown.ok) throw new Error("expected ok");
    expect(grown.added.every((x) => x.applicantId === "new")).toBe(true);
    expect(grown.added).toHaveLength(2);
  });

  it("counts existing assignments toward N", () => {
    const r = assignReviewers({
      applicantIds: ["a0"], pool: ids(4, "r"), perApplicant: 2, excluded: new Set(),
      existing: [{ applicantId: "a0", reviewerId: "r0" }], seed: 1,
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.added).toHaveLength(1);
    expect(r.added[0].reviewerId).not.toBe("r0");
  });
});

describe("selfExclusions", () => {
  it("excludes an exec who is also an applicant (email match, case-insensitive)", () => {
    const s = selfExclusions([{ id: "a1", email: "Sam@ucsc.edu" }, { id: "a2", email: null }], [{ id: "r1", email: "sam@ucsc.edu" }]);
    expect([...s]).toEqual([exclusionKey("a1", "r1")]);
  });
});

describe("reviewState", () => {
  it("is unassigned with no reviewers", () => {
    expect(reviewState([], [], false)).toMatchObject({ status: "unassigned", unlocked: false });
  });
  it("tracks progress and unlocks only when every assigned reviewer has submitted", () => {
    expect(reviewState(["a", "b"], [], false)).toMatchObject({ status: "not-started", unlocked: false, submitted: 0 });
    expect(reviewState(["a", "b"], ["a"], false)).toMatchObject({ status: "in-progress", unlocked: false, submitted: 1 });
    expect(reviewState(["a", "b"], ["a", "b"], false)).toMatchObject({ status: "complete", unlocked: true });
  });
  it("ignores submissions from people who are not assigned", () => {
    expect(reviewState(["a", "b"], ["a", "x", "y"], false)).toMatchObject({ unlocked: false, submitted: 1 });
  });
  it("force reveal unlocks early", () => {
    expect(reviewState(["a", "b"], ["a"], true)).toMatchObject({ status: "revealed", unlocked: true });
  });
});

describe("resumeVisibility", () => {
  const reviews = [
    { reviewerId: "me", submitted: true },
    { reviewerId: "x", submitted: true },
    { reviewerId: "y", submitted: false },
  ];
  it("hides everyone else, even after I submitted, while locked", () => {
    const v = resumeVisibility("me", reviews, false);
    expect(v.mine).toBe(reviews[0]);
    expect(v.others).toEqual([]);
  });
  it("shows other submitted reviews once unlocked", () => {
    expect(resumeVisibility("me", reviews, true).others).toEqual([reviews[1]]);
  });
  it("returns no review for me when I have none", () => {
    expect(resumeVisibility("zzz", reviews, false).mine).toBeNull();
  });
});
```

- [ ] **Step 2:** Run `npx vitest run src/lib/recruit-assignment.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
export interface Assignment {
  applicantId: string;
  reviewerId: string;
}

export interface AssignInput {
  applicantIds: string[];
  pool: string[];
  perApplicant: number;
  excluded: Set<string>;
  existing: Assignment[];
  seed: number;
}

export type AssignResult =
  | { ok: true; added: Assignment[] }
  | { ok: false; applicantId: string; need: number; eligible: number };

export const exclusionKey = (applicantId: string, reviewerId: string) => `${applicantId}:${reviewerId}`;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Greedy least-loaded assignment with seeded random tie-breaking. Existing assignments count toward N,
 * so running it again only fills shortfalls. All-or-nothing: if any applicant can't be filled, nothing is added.
 */
export function assignReviewers(input: AssignInput): AssignResult {
  const rand = mulberry32(input.seed);
  const load = new Map(input.pool.map((id) => [id, 0]));
  const have = new Map<string, Set<string>>();
  for (const e of input.existing) {
    have.set(e.applicantId, (have.get(e.applicantId) ?? new Set()).add(e.reviewerId));
    if (load.has(e.reviewerId)) load.set(e.reviewerId, load.get(e.reviewerId)! + 1);
  }

  const order = [...input.applicantIds];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const added: Assignment[] = [];
  for (const applicantId of order) {
    const mine = have.get(applicantId) ?? new Set<string>();
    const need = input.perApplicant - mine.size;
    if (need <= 0) continue;
    const eligible = input.pool.filter((id) => !mine.has(id) && !input.excluded.has(exclusionKey(applicantId, id)));
    if (eligible.length < need) return { ok: false, applicantId, need, eligible: eligible.length };
    const ranked = eligible
      .map((id) => ({ id, load: load.get(id)!, tie: rand() }))
      .sort((x, y) => x.load - y.load || x.tie - y.tie);
    for (const pick of ranked.slice(0, need)) {
      added.push({ applicantId, reviewerId: pick.id });
      load.set(pick.id, pick.load + 1);
    }
  }
  return { ok: true, added };
}

export function selfExclusions(
  applicants: { id: string; email: string | null }[],
  reviewers: { id: string; email: string }[],
): Set<string> {
  const byEmail = new Map(reviewers.map((r) => [r.email.trim().toLowerCase(), r.id]));
  const out = new Set<string>();
  for (const a of applicants) {
    const reviewerId = a.email ? byEmail.get(a.email.trim().toLowerCase()) : undefined;
    if (reviewerId) out.add(exclusionKey(a.id, reviewerId));
  }
  return out;
}

export interface ApplicantReviewState {
  assigned: number;
  submitted: number;
  unlocked: boolean;
  status: "unassigned" | "not-started" | "in-progress" | "complete" | "revealed";
}

export function reviewState(assigned: string[], submitted: string[], forceRevealed: boolean): ApplicantReviewState {
  const done = new Set(submitted);
  const submittedCount = assigned.filter((id) => done.has(id)).length;
  const allDone = assigned.length > 0 && submittedCount === assigned.length;
  const status: ApplicantReviewState["status"] = allDone
    ? "complete"
    : forceRevealed
      ? "revealed"
      : assigned.length === 0
        ? "unassigned"
        : submittedCount === 0
          ? "not-started"
          : "in-progress";
  return { assigned: assigned.length, submitted: submittedCount, unlocked: allDone || forceRevealed, status };
}

/** Resume-stage blindness: my own review always; others' submitted reviews only once unlocked. */
export function resumeVisibility<T extends { reviewerId: string; submitted: boolean }>(
  viewerId: string,
  reviews: T[],
  unlocked: boolean,
): { mine: T | null; others: T[] } {
  return {
    mine: reviews.find((r) => r.reviewerId === viewerId) ?? null,
    others: unlocked ? reviews.filter((r) => r.reviewerId !== viewerId && r.submitted) : [],
  };
}
```

- [ ] **Step 4:** Run the test — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/lib/recruit-assignment* && git commit -m "Applicant review: reviewer assignment, unlock rule, blind visibility"`

---

### Task 5: Dashboard shaping

**Files:**
- Create: `src/lib/recruit-review-dashboard.ts`, `src/lib/recruit-review-dashboard.test.ts`

**Interfaces:**
- Consumes: `reviewState`, `ApplicantReviewState` from `recruit-assignment`; `StageSummary`, `isDisagreement` from `recruit-scoring`.
- Produces: `buildReviewDashboard(input: DashboardInput): ReviewDashboard`.

```ts
export interface DashboardInput {
  applicants: { id: string; name: string; email: string | null }[];
  reviewerNames: Map<string, string>;
  assignments: { applicantId: string; reviewerId: string }[];
  submitted: Map<string, Set<string>>; // applicantId -> reviewerIds who submitted
  revealed: Set<string>;
  summaries: Record<string, StageSummary>;
  disagreementThreshold: number;
}
export interface DashboardApplicant {
  id: string; name: string; email: string | null; state: ApplicantReviewState;
  reviewers: { id: string; name: string; submitted: boolean }[];
  raw: number | null; normalized: number | null; disagree: boolean;
}
export interface DashboardReviewer { id: string; name: string; assigned: number; done: number }
export interface ReviewDashboard {
  applicants: DashboardApplicant[]; reviewers: DashboardReviewer[];
  totals: { applicants: number; complete: number; unassigned: number };
}
```

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildReviewDashboard } from "./recruit-review-dashboard";

const summary = { raw: 4, normalized: 3.8, count: 2, spread: 2, anyNormalized: true };
const base = {
  applicants: [
    { id: "a1", name: "Ann", email: null },
    { id: "a2", name: "Bo", email: null },
    { id: "a3", name: "Cy", email: null },
  ],
  reviewerNames: new Map([["r1", "Rae"], ["r2", "Sam"]]),
  assignments: [
    { applicantId: "a1", reviewerId: "r1" }, { applicantId: "a1", reviewerId: "r2" },
    { applicantId: "a2", reviewerId: "r1" }, { applicantId: "a2", reviewerId: "r2" },
  ],
  submitted: new Map([["a1", new Set(["r1", "r2"])], ["a2", new Set(["r1"])]]),
  revealed: new Set<string>(),
  summaries: { a1: summary, a2: summary },
  disagreementThreshold: 1.5,
};

describe("buildReviewDashboard", () => {
  it("exposes scores only for unlocked applicants", () => {
    const d = buildReviewDashboard(base);
    const byId = Object.fromEntries(d.applicants.map((a) => [a.id, a]));
    expect(byId.a1).toMatchObject({ raw: 4, normalized: 3.8, disagree: true, state: { status: "complete" } });
    expect(byId.a2).toMatchObject({ raw: null, normalized: null, disagree: false, state: { status: "in-progress" } });
    expect(byId.a3.state.status).toBe("unassigned");
  });
  it("counts per-reviewer progress and totals", () => {
    const d = buildReviewDashboard(base);
    expect(d.reviewers).toEqual([
      { id: "r1", name: "Rae", assigned: 2, done: 2 },
      { id: "r2", name: "Sam", assigned: 2, done: 1 },
    ]);
    expect(d.totals).toEqual({ applicants: 3, complete: 1, unassigned: 1 });
  });
  it("force reveal exposes scores early", () => {
    const d = buildReviewDashboard({ ...base, revealed: new Set(["a2"]) });
    expect(d.applicants.find((a) => a.id === "a2")).toMatchObject({ raw: 4, state: { status: "revealed" } });
  });
});
```

- [ ] **Step 2:** Run it — Expected: FAIL.
- [ ] **Step 3: Implement**

```ts
import { reviewState, type ApplicantReviewState } from "@/lib/recruit-assignment";
import { isDisagreement, type StageSummary } from "@/lib/recruit-scoring";

// (interfaces from the block above)

export function buildReviewDashboard(input: DashboardInput): ReviewDashboard {
  const assignedBy = new Map<string, string[]>();
  for (const a of input.assignments) assignedBy.set(a.applicantId, [...(assignedBy.get(a.applicantId) ?? []), a.reviewerId]);
  const nameOf = (id: string) => input.reviewerNames.get(id) ?? "Unknown";
  const live = new Set(input.applicants.map((a) => a.id));

  const applicants: DashboardApplicant[] = input.applicants.map((a) => {
    const assigned = assignedBy.get(a.id) ?? [];
    const done = input.submitted.get(a.id) ?? new Set<string>();
    const state = reviewState(assigned, [...done], input.revealed.has(a.id));
    const summary = state.unlocked ? (input.summaries[a.id] ?? null) : null;
    return {
      id: a.id,
      name: a.name,
      email: a.email,
      state,
      reviewers: assigned.map((id) => ({ id, name: nameOf(id), submitted: done.has(id) })),
      raw: summary?.raw ?? null,
      normalized: summary?.normalized ?? null,
      disagree: summary ? isDisagreement(summary, input.disagreementThreshold) : false,
    };
  });

  const progress = new Map<string, { assigned: number; done: number }>();
  for (const a of input.assignments) {
    if (!live.has(a.applicantId)) continue;
    const p = progress.get(a.reviewerId) ?? { assigned: 0, done: 0 };
    p.assigned++;
    if (input.submitted.get(a.applicantId)?.has(a.reviewerId)) p.done++;
    progress.set(a.reviewerId, p);
  }
  const reviewers = [...progress].map(([id, p]) => ({ id, name: nameOf(id), ...p })).sort((x, y) => x.name.localeCompare(y.name));

  return {
    applicants,
    reviewers,
    totals: {
      applicants: applicants.length,
      complete: applicants.filter((a) => a.state.status === "complete").length,
      unassigned: applicants.filter((a) => a.state.status === "unassigned").length,
    },
  };
}
```

- [ ] **Step 4:** Run it — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/lib/recruit-review-dashboard* && git commit -m "Applicant review: dashboard shaping"`

---

### Task 6: Server data layer and blind scoring bundle

**Files:**
- Create: `src/lib/data/recruit-review.ts`
- Modify: `src/lib/data/recruit-scoring.ts`

**Interfaces:**
- Consumes: Tasks 2, 4, 5.
- Produces:
  - `ReviewerProfile {id: string; name: string; email: string}`
  - `ApplicationAnswers {submittedAt: string | null; graduationTerm: string | null; howHeard: string | null; essayWhy: string | null; essayTeamwork: string | null; essayBring: string | null; resumeUrl: string | null}`
  - `ReviewContext {settings: ReviewSettings; pool: ReviewerProfile[]; assignments: Assignment[]; assignedByApplicant: Map<string, string[]>; exclusions: Assignment[]; revealed: Set<string>; answers: Map<string, ApplicationAnswers>}`
  - `getReviewSettings(): Promise<ReviewSettings>`, `getReviewerPool(settings): Promise<ReviewerProfile[]>`, `getReviewContext(applicantIds: string[]): Promise<ReviewContext>`
  - `ScoringApplicant` gains `application: ApplicationAnswers | null`, `unlocked: boolean`; `ScoringBundle` gains `dashboard: ReviewDashboard`, `reviewSetup: {settings: ReviewSettings; pool: ReviewerProfile[]; detail: Record<string, {assigned: string[]; conflicts: string[]}>}`; `summaries.resume` contains only unlocked applicants.

- [ ] **Step 1: Create `src/lib/data/recruit-review.ts`**

```ts
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/paginate";
import { EXEC_ROLES } from "@/lib/auth/roles";
import { parseReviewSettings, REVIEW_SETTING_KEYS, type ReviewSettings } from "@/lib/recruit-review-settings";
import type { Assignment } from "@/lib/recruit-assignment";

export interface ReviewerProfile {
  id: string;
  name: string;
  email: string;
}

export interface ApplicationAnswers {
  submittedAt: string | null;
  graduationTerm: string | null;
  howHeard: string | null;
  essayWhy: string | null;
  essayTeamwork: string | null;
  essayBring: string | null;
  resumeUrl: string | null;
}

export interface ReviewContext {
  settings: ReviewSettings;
  pool: ReviewerProfile[];
  assignments: Assignment[];
  assignedByApplicant: Map<string, string[]>;
  exclusions: Assignment[];
  revealed: Set<string>;
  answers: Map<string, ApplicationAnswers>;
}

const CHUNK = 100;

async function chunked<R>(ids: string[], load: (chunk: string[]) => Promise<R[]>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await load(ids.slice(i, i + CHUNK))));
  return out;
}

export async function getReviewSettings(): Promise<ReviewSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("org_settings")
    .select("key, value")
    .in("key", Object.values(REVIEW_SETTING_KEYS));
  if (error) throw error;
  return parseReviewSettings(data ?? []);
}

export async function getReviewerPool(settings: ReviewSettings): Promise<ReviewerProfile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email")
    .in("role", EXEC_ROLES)
    .is("archived_at", null)
    .order("name");
  if (error) throw error;
  const all = data ?? [];
  return settings.pool.length === 0 ? all : all.filter((p) => settings.pool.includes(p.id));
}

export async function getReviewContext(applicantIds: string[]): Promise<ReviewContext> {
  const supabase = await createClient();
  const settings = await getReviewSettings();
  const [pool, assignmentRows, exclusionRows, revealRows, answerRows] = await Promise.all([
    getReviewerPool(settings),
    chunked(applicantIds, (c) =>
      fetchAllPages((from, to) =>
        supabase
          .from("recruit_review_assignments")
          .select("id, applicant_id, reviewer_id")
          .eq("stage", "resume")
          .in("applicant_id", c)
          .order("id")
          .range(from, to),
      ),
    ),
    chunked(applicantIds, (c) =>
      fetchAllPages((from, to) =>
        supabase
          .from("recruit_review_exclusions")
          .select("applicant_id, reviewer_id")
          .in("applicant_id", c)
          .order("applicant_id")
          .order("reviewer_id")
          .range(from, to),
      ),
    ),
    chunked(applicantIds, (c) =>
      fetchAllPages((from, to) =>
        supabase
          .from("recruit_review_reveals")
          .select("applicant_id")
          .eq("stage", "resume")
          .in("applicant_id", c)
          .order("applicant_id")
          .range(from, to),
      ),
    ),
    chunked(applicantIds, (c) =>
      fetchAllPages((from, to) =>
        supabase.from("recruit_applicant_answers").select("*").in("applicant_id", c).order("applicant_id").range(from, to),
      ),
    ),
  ]);

  const assignedByApplicant = new Map<string, string[]>();
  for (const a of assignmentRows) {
    assignedByApplicant.set(a.applicant_id, [...(assignedByApplicant.get(a.applicant_id) ?? []), a.reviewer_id]);
  }
  return {
    settings,
    pool,
    assignments: assignmentRows.map((a) => ({ applicantId: a.applicant_id, reviewerId: a.reviewer_id })),
    assignedByApplicant,
    exclusions: exclusionRows.map((e) => ({ applicantId: e.applicant_id, reviewerId: e.reviewer_id })),
    revealed: new Set(revealRows.map((r) => r.applicant_id)),
    answers: new Map(
      answerRows.map((a) => [
        a.applicant_id,
        {
          submittedAt: a.submitted_at,
          graduationTerm: a.graduation_term,
          howHeard: a.how_heard,
          essayWhy: a.essay_why,
          essayTeamwork: a.essay_teamwork,
          essayBring: a.essay_bring,
          resumeUrl: a.resume_url,
        },
      ]),
    ),
  };
}
```

- [ ] **Step 2: Modify `src/lib/data/recruit-scoring.ts`.**

(a) Imports — add:
```ts
import { getReviewContext, type ApplicationAnswers, type ReviewerProfile } from "@/lib/data/recruit-review";
import { resumeVisibility, reviewState } from "@/lib/recruit-assignment";
import { buildReviewDashboard, type ReviewDashboard } from "@/lib/recruit-review-dashboard";
import type { ReviewSettings } from "@/lib/recruit-review-settings";
```

(b) `ScoringApplicant` — add fields:
```ts
  application: ApplicationAnswers | null;
  /** True when the viewer may see other reviewers' scores for this applicant. */
  unlocked: boolean;
```

(c) `ScoringBundle` — add:
```ts
  dashboard: ReviewDashboard;
  reviewSetup: {
    settings: ReviewSettings;
    pool: ReviewerProfile[];
    detail: Record<string, { assigned: string[]; conflicts: string[] }>;
  };
```

(d) In `getScoringBundle`, right after `const applicantIds = ...`, add:
```ts
  const review = await getReviewContext(applicantIds);
```
and after `reviews`/`scoreRows`/`names` are loaded add the submitted map (resume stage):
```ts
  const submittedResume = new Map<string, Set<string>>();
  for (const r of reviews) {
    if (r.stage !== "resume" || r.submitted_at === null) continue;
    submittedResume.set(r.applicant_id, (submittedResume.get(r.applicant_id) ?? new Set()).add(r.reviewer_id));
  }
  const stateOf = (applicantId: string) =>
    reviewState(
      review.assignedByApplicant.get(applicantId) ?? [],
      [...(submittedResume.get(applicantId) ?? [])],
      review.revealed.has(applicantId),
    );
```
Also extend the `names` lookup to include pool and assigned reviewers (so dashboard names resolve): change the `profileNames` call to
```ts
  const names = await profileNames(supabase, [
    ...new Set([...reviews.map((r) => r.reviewer_id), ...review.pool.map((p) => p.id), ...review.assignments.map((a) => a.reviewerId)]),
  ]);
```

(e) In `build(stage)`, replace the `eligible` / `rows` block with:
```ts
    const eligible =
      stage === "interview"
        ? applicants.filter((a) => interviewed.has(a.id))
        : applicants.filter((a) => (review.assignedByApplicant.get(a.id) ?? []).includes(viewerId));

    const rows: ScoringApplicant[] = eligible.map((a) => {
      const views = stageReviews.filter((r) => r.applicant_id === a.id).map(toView);
      const aggregate = summary[a.id] ?? null;
      const application = review.answers.get(a.id) ?? null;
      const base = { id: a.id, name: a.name, email: a.email, applicationLink: a.application_link, application };
      if (stage === "interview") {
        const visible = visibleReviews(viewerId, views);
        const iSubmitted = views.some((v) => v.mine && v.submitted);
        return {
          ...base,
          mine: visible.find((v) => v.mine) ?? null,
          others: visible.filter((v) => !v.mine),
          visibleSummary: iSubmitted ? aggregate : null,
          disagree: iSubmitted && aggregate ? isDisagreement(aggregate, settings.disagreementThreshold) : false,
          unlocked: iSubmitted,
        };
      }
      const unlocked = stateOf(a.id).unlocked;
      const { mine, others } = resumeVisibility(viewerId, views, unlocked);
      return {
        ...base,
        mine,
        others,
        visibleSummary: unlocked ? aggregate : null,
        disagree: unlocked && aggregate ? isDisagreement(aggregate, settings.disagreementThreshold) : false,
        unlocked,
      };
    });
```

(f) Replace the return of `getScoringBundle` with:
```ts
  const resume = build("resume");
  const interview = build("interview");

  // Blind resume scoring: the decision view and side panel only ever see unlocked applicants.
  const unlockedResume = Object.fromEntries(
    Object.entries(resume.summary).filter(([applicantId]) => stateOf(applicantId).unlocked),
  );

  const detail: Record<string, { assigned: string[]; conflicts: string[] }> = {};
  for (const a of applicants) detail[a.id] = { assigned: review.assignedByApplicant.get(a.id) ?? [], conflicts: [] };
  for (const e of review.exclusions) detail[e.applicantId]?.conflicts.push(e.reviewerId);

  return {
    stages: { resume: resume.data, interview: interview.data },
    summaries: { resume: unlockedResume, interview: interview.summary },
    settings,
    dashboard: buildReviewDashboard({
      applicants: applicants.map((a) => ({ id: a.id, name: a.name, email: a.email })),
      reviewerNames: names,
      assignments: review.assignments,
      submitted: submittedResume,
      revealed: review.revealed,
      summaries: resume.summary,
      disagreementThreshold: settings.disagreementThreshold,
    }),
    reviewSetup: { settings: review.settings, pool: review.pool, detail },
  };
```

- [ ] **Step 3: Typecheck.** Run `npx tsc --noEmit`. Expected: errors only in files that construct `ScoringBundle`/`ScoringApplicant` elsewhere (none expected) — fix any.
- [ ] **Step 4: Run all tests** `npx vitest run` — Expected: PASS (no test touches this file; the logic it relies on is covered in Tasks 4–5).
- [ ] **Step 5: Commit** — `git add src/lib/data && git commit -m "Applicant review: blind resume scoring in the data layer, dashboard in the bundle"`

---

### Task 7: Server actions

**Files:**
- Create: `src/actions/recruit-review.ts`
- Modify: `src/actions/recruit.ts` (assignment guard in `saveReviewAction`)
- Modify: `src/lib/recruit-applications.ts`, `src/lib/recruit-applications.test.ts` (classify + commit rows)

**Interfaces:**
- Consumes: Tasks 1–6; `findMatches`, `MatchableApplicant`, `MatchClass` from `recruit-matching`; `getMatchableApplicants(quarterId)` from `data/recruit`; `logAudit`.
- Produces (pure, in `recruit-applications.ts`):
  - `PreviewGroup = "new" | "update" | "needs-look"`
  - `PreviewRow {application: ParsedApplication; group: PreviewGroup; matchId: string | null; candidates: {id: string; name: string; kind: MatchClass}[]}`
  - `classifyApplications(apps: ParsedApplication[], existing: MatchableApplicant[]): PreviewRow[]`
  - `ApplicationChoice = {kind: "new"} | {kind: "update"; applicantId: string} | {kind: "skip"}`
  - `defaultChoices(rows: PreviewRow[]): Record<number, ApplicationChoice>` (keyed by `application.rowNumber`; needs-look rows get no default)
  - `ApplicationCommitRow {kind: "new" | "update"; applicantId?: string; name: string; email: string; major: string | null; year: string | null; answers: {...}}`
  - `buildApplicationCommitRows(rows: PreviewRow[], choices: Record<number, ApplicationChoice>): ApplicationCommitRow[]`
- Produces (actions, all `Promise<ActionResult & …>`): `previewApplicationImportAction`, `commitApplicationImportAction`, `undoApplicationImportAction`, `assignReviewersAction`, `setApplicantReviewersAction`, `setRevealAction`, `updateReviewSettingsAction`.

- [ ] **Step 1: Failing tests** — append to `recruit-applications.test.ts`:

```ts
import { buildApplicationCommitRows, classifyApplications, defaultChoices } from "./recruit-applications";

const app = (over: Partial<import("./recruit-applications").ParsedApplication> = {}) => ({
  rowNumber: 2, name: "Lucia Lim", email: "lumlim@ucsc.edu", submittedAt: null, graduationTerm: "Spring 2029",
  major: "BME", howHeard: null, essayWhy: "w", essayTeamwork: "t", essayBring: "b", resumeUrl: "https://drive.google.com/file/d/X/view", ...over,
});

describe("classifyApplications", () => {
  const existing = [
    { id: "e1", name: "Lucia Lim", email: "lumlim@ucsc.edu", aliases: [] },
    { id: "e2", name: "Jessica Kim", email: null, aliases: [] },
  ];
  it("same email means update", () => {
    const [r] = classifyApplications([app()], existing);
    expect(r).toMatchObject({ group: "update", matchId: "e1" });
  });
  it("same name but different email needs a look", () => {
    const [r] = classifyApplications([app({ email: "other@ucsc.edu" })], existing);
    expect(r.group).toBe("needs-look");
    expect(r.candidates[0]).toMatchObject({ id: "e1" });
  });
  it("no match is new, and Jessica Kim does not match Jessica Kimball", () => {
    const [r] = classifyApplications([app({ name: "Jessica Kimball", email: "jk@ucsc.edu" })], existing);
    expect(r.group).toBe("new");
  });
});

describe("buildApplicationCommitRows", () => {
  const rows = classifyApplications(
    [app(), app({ rowNumber: 3, name: "New Person", email: "np@ucsc.edu" }), app({ rowNumber: 4, name: "Lucia Lim", email: "x@ucsc.edu" })],
    [{ id: "e1", name: "Lucia Lim", email: "lumlim@ucsc.edu", aliases: [] }],
  );
  it("defaults: update for matches, new for new, nothing for needs-look", () => {
    expect(defaultChoices(rows)).toEqual({ 2: { kind: "update", applicantId: "e1" }, 3: { kind: "new" } });
  });
  it("builds commit rows from choices and drops skips and undecided rows", () => {
    const out = buildApplicationCommitRows(rows, { ...defaultChoices(rows), 4: { kind: "skip" } });
    expect(out.map((r) => [r.kind, r.applicantId ?? null, r.email])).toEqual([
      ["update", "e1", "lumlim@ucsc.edu"],
      ["new", null, "np@ucsc.edu"],
    ]);
    expect(out[0]).toMatchObject({ year: "Spring 2029", major: "BME", answers: { essayWhy: "w", resumeUrl: "https://drive.google.com/file/d/X/view" } });
  });
});
```

- [ ] **Step 2:** Run `npx vitest run src/lib/recruit-applications.test.ts` — Expected: FAIL (new exports missing).

- [ ] **Step 3: Implement** — append to `src/lib/recruit-applications.ts`:

```ts
import { findMatches, type MatchableApplicant, type MatchClass } from "@/lib/recruit-matching";

export type PreviewGroup = "new" | "update" | "needs-look";

export interface PreviewRow {
  application: ParsedApplication;
  group: PreviewGroup;
  matchId: string | null;
  candidates: { id: string; name: string; kind: MatchClass }[];
}

export function classifyApplications(apps: ParsedApplication[], existing: MatchableApplicant[]): PreviewRow[] {
  const nameOf = new Map(existing.map((e) => [e.id, e.name]));
  return apps.map((application) => {
    const matches = findMatches({ name: application.name, email: application.email }, existing);
    const best = matches[0];
    if (!best) return { application, group: "new", matchId: null, candidates: [] };
    if (best.kind === "duplicate") return { application, group: "update", matchId: best.applicantId, candidates: [] };
    return {
      application,
      group: "needs-look",
      matchId: null,
      candidates: matches.slice(0, 3).map((m) => ({ id: m.applicantId, name: nameOf.get(m.applicantId) ?? "Unknown", kind: m.kind })),
    };
  });
}

export type ApplicationChoice = { kind: "new" } | { kind: "update"; applicantId: string } | { kind: "skip" };

export function defaultChoices(rows: PreviewRow[]): Record<number, ApplicationChoice> {
  const out: Record<number, ApplicationChoice> = {};
  for (const r of rows) {
    if (r.group === "new") out[r.application.rowNumber] = { kind: "new" };
    else if (r.group === "update" && r.matchId) out[r.application.rowNumber] = { kind: "update", applicantId: r.matchId };
  }
  return out;
}

export interface ApplicationCommitRow {
  kind: "new" | "update";
  applicantId?: string;
  name: string;
  email: string;
  major: string | null;
  year: string | null;
  answers: {
    submittedAt: string | null;
    graduationTerm: string | null;
    howHeard: string | null;
    essayWhy: string | null;
    essayTeamwork: string | null;
    essayBring: string | null;
    resumeUrl: string | null;
  };
}

export function buildApplicationCommitRows(rows: PreviewRow[], choices: Record<number, ApplicationChoice>): ApplicationCommitRow[] {
  const out: ApplicationCommitRow[] = [];
  for (const { application: a } of rows) {
    const choice = choices[a.rowNumber];
    if (!choice || choice.kind === "skip") continue;
    out.push({
      kind: choice.kind,
      ...(choice.kind === "update" ? { applicantId: choice.applicantId } : {}),
      name: a.name,
      email: a.email,
      major: a.major,
      year: a.graduationTerm,
      answers: {
        submittedAt: a.submittedAt,
        graduationTerm: a.graduationTerm,
        howHeard: a.howHeard,
        essayWhy: a.essayWhy,
        essayTeamwork: a.essayTeamwork,
        essayBring: a.essayBring,
        resumeUrl: a.resumeUrl,
      },
    });
  }
  return out;
}
```
(Move the new `import` line to the top of the file with the other import.)

- [ ] **Step 4:** Run the test — Expected: PASS.

- [ ] **Step 5: Create `src/actions/recruit-review.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import { fetchAllPages } from "@/lib/paginate";
import { getMatchableApplicants } from "@/lib/data/recruit";
import { getReviewContext, getReviewSettings, getReviewerPool } from "@/lib/data/recruit-review";
import {
  classifyApplications,
  type ApplicationCommitRow,
  type ParsedApplication,
  type PreviewRow,
} from "@/lib/recruit-applications";
import { assignReviewers, exclusionKey, selfExclusions } from "@/lib/recruit-assignment";
import { REVIEW_SETTING_KEYS, validateReviewSettings, type ReviewSettings } from "@/lib/recruit-review-settings";

export interface ActionResult {
  error?: string;
}

async function requireExec() {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) return { profile: null, error: "Only exec can do that." };
  return { profile, error: undefined };
}

function revalidateAll() {
  revalidatePath("/portal/admin/applicants");
}

async function liveApplicants(quarterId: string) {
  const supabase = await createClient();
  return fetchAllPages((from, to) =>
    supabase
      .from("recruit_applicants")
      .select("id, name, email")
      .eq("quarter_id", quarterId)
      .is("archived_at", null)
      .order("id")
      .range(from, to),
  );
}

export async function previewApplicationImportAction(input: {
  quarterId: string;
  applications: ParsedApplication[];
}): Promise<ActionResult & { rows?: PreviewRow[] }> {
  const { error } = await requireExec();
  if (error) return { error };
  if (input.applications.length === 0) return { error: "There are no applications to import." };
  const existing = await getMatchableApplicants(input.quarterId);
  return { rows: classifyApplications(input.applications, existing) };
}

export async function commitApplicationImportAction(input: {
  quarterId: string;
  rows: ApplicationCommitRow[];
}): Promise<ActionResult & { batchId?: string; created?: number; updated?: number; skipped?: number }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  if (input.rows.length === 0) return { error: "Nothing to import — every row was skipped." };

  const supabase = await createClient();
  const { data, error: rpcError } = await supabase.rpc("commit_application_import", {
    p_quarter: input.quarterId,
    p_rows: input.rows,
  });
  if (rpcError) return { error: rpcError.message };

  const result = data as { batchId: string; created: number; updated: number; skipped: number };
  await logAudit(
    profile.id,
    "recruit.applications_imported",
    null,
    `${result.created} new, ${result.updated} updated, ${result.skipped} skipped`,
  );
  revalidateAll();
  return result;
}

export async function undoApplicationImportAction(batchId: string): Promise<ActionResult & { archived?: number }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  const supabase = await createClient();
  const { data, error: rpcError } = await supabase.rpc("undo_application_import", { p_batch: batchId });
  if (rpcError) return { error: rpcError.message };
  await logAudit(profile.id, "recruit.applications_import_undone", null, `${data} applicants removed`);
  revalidateAll();
  return { archived: data as number };
}

export async function assignReviewersAction(input: { quarterId: string }): Promise<ActionResult & { added?: number }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const applicants = await liveApplicants(input.quarterId);
  const ctx = await getReviewContext(applicants.map((a) => a.id));
  const poolIds = ctx.pool.map((p) => p.id);
  if (poolIds.length === 0) return { error: "There are no reviewers in the pool. Check Setup → Reviewers." };

  const supabase = await createClient();

  // Reviewers who left the pool lose their unfinished assignments; submitted reviews stay.
  const stale = ctx.assignments.filter((a) => !poolIds.includes(a.reviewerId));
  let kept = ctx.assignments;
  if (stale.length > 0) {
    const submitted = new Set<string>();
    const rows = await fetchAllPages((from, to) =>
      supabase
        .from("recruit_reviews")
        .select("applicant_id, reviewer_id")
        .eq("stage", "resume")
        .not("submitted_at", "is", null)
        .in("reviewer_id", [...new Set(stale.map((s) => s.reviewerId))])
        .order("id")
        .range(from, to),
    );
    for (const r of rows) submitted.add(exclusionKey(r.applicant_id, r.reviewer_id));
    const removable = stale.filter((s) => !submitted.has(exclusionKey(s.applicantId, s.reviewerId)));
    for (const r of removable) {
      const { error: delError } = await supabase
        .from("recruit_review_assignments")
        .delete()
        .eq("applicant_id", r.applicantId)
        .eq("reviewer_id", r.reviewerId)
        .eq("stage", "resume");
      if (delError) return { error: delError.message };
    }
    const gone = new Set(removable.map((r) => exclusionKey(r.applicantId, r.reviewerId)));
    kept = ctx.assignments.filter((a) => !gone.has(exclusionKey(a.applicantId, a.reviewerId)));
  }

  const excluded = new Set([
    ...ctx.exclusions.map((e) => exclusionKey(e.applicantId, e.reviewerId)),
    ...selfExclusions(applicants, ctx.pool),
  ]);
  const result = assignReviewers({
    applicantIds: applicants.map((a) => a.id),
    pool: poolIds,
    perApplicant: ctx.settings.perApplicant,
    excluded,
    existing: kept,
    seed: Math.floor(Math.random() * 2 ** 31),
  });
  if (!result.ok) {
    const name = applicants.find((a) => a.id === result.applicantId)?.name ?? "an applicant";
    return {
      error: `Couldn't assign ${name}: ${result.need} more reviewer${result.need === 1 ? "" : "s"} needed but only ${result.eligible} eligible. Add reviewers to the pool or lower reviewers per applicant.`,
    };
  }
  if (result.added.length > 0) {
    const { error: insertError } = await supabase.from("recruit_review_assignments").insert(
      result.added.map((a) => ({ applicant_id: a.applicantId, reviewer_id: a.reviewerId, stage: "resume" as const })),
    );
    if (insertError) return { error: insertError.message };
  }

  await logAudit(profile.id, "recruit.reviewers_assigned", null, `${result.added.length} assignments added`);
  revalidateAll();
  return { added: result.added.length };
}

export async function setApplicantReviewersAction(input: {
  applicantId: string;
  assigned: string[];
  conflicts: string[];
}): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  if (input.assigned.some((id) => input.conflicts.includes(id))) {
    return { error: "A reviewer can't be both assigned and marked as a conflict." };
  }

  const supabase = await createClient();
  const [{ data: current, error: curError }, { data: submitted, error: subError }] = await Promise.all([
    supabase.from("recruit_review_assignments").select("reviewer_id").eq("applicant_id", input.applicantId).eq("stage", "resume"),
    supabase
      .from("recruit_reviews")
      .select("reviewer_id")
      .eq("applicant_id", input.applicantId)
      .eq("stage", "resume")
      .not("submitted_at", "is", null),
  ]);
  if (curError || subError) return { error: (curError ?? subError)!.message };

  const done = new Set((submitted ?? []).map((s) => s.reviewer_id));
  const have = new Set((current ?? []).map((c) => c.reviewer_id));
  const removing = [...have].filter((id) => !input.assigned.includes(id));
  if (removing.some((id) => done.has(id))) {
    return { error: "A reviewer who already submitted can't be unassigned." };
  }
  const adding = input.assigned.filter((id) => !have.has(id));

  if (removing.length > 0) {
    const { error: delError } = await supabase
      .from("recruit_review_assignments")
      .delete()
      .eq("applicant_id", input.applicantId)
      .eq("stage", "resume")
      .in("reviewer_id", removing);
    if (delError) return { error: delError.message };
  }
  if (adding.length > 0) {
    const { error: addError } = await supabase.from("recruit_review_assignments").insert(
      adding.map((reviewer_id) => ({ applicant_id: input.applicantId, reviewer_id, stage: "resume" as const })),
    );
    if (addError) return { error: addError.message };
  }

  const { error: clearError } = await supabase.from("recruit_review_exclusions").delete().eq("applicant_id", input.applicantId);
  if (clearError) return { error: clearError.message };
  if (input.conflicts.length > 0) {
    const { error: conflictError } = await supabase
      .from("recruit_review_exclusions")
      .insert(input.conflicts.map((reviewer_id) => ({ applicant_id: input.applicantId, reviewer_id })));
    if (conflictError) return { error: conflictError.message };
  }

  await logAudit(profile.id, "recruit.reviewers_changed", null, `applicant ${input.applicantId}`);
  revalidateAll();
  return {};
}

export async function setRevealAction(input: { applicantId: string; revealed: boolean }): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  const supabase = await createClient();
  const { error: dbError } = input.revealed
    ? await supabase
        .from("recruit_review_reveals")
        .upsert({ applicant_id: input.applicantId, stage: "resume", revealed_by: profile.id }, { onConflict: "applicant_id,stage" })
    : await supabase.from("recruit_review_reveals").delete().eq("applicant_id", input.applicantId).eq("stage", "resume");
  if (dbError) return { error: dbError.message };
  await logAudit(profile.id, input.revealed ? "recruit.scores_revealed" : "recruit.scores_hidden", null, `applicant ${input.applicantId}`);
  revalidateAll();
  return {};
}

export async function updateReviewSettingsAction(partial: Partial<ReviewSettings>): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  const problem = validateReviewSettings(partial);
  if (problem) return { error: problem };

  const rows: { key: string; value: string }[] = [];
  if (partial.perApplicant !== undefined) rows.push({ key: REVIEW_SETTING_KEYS.perApplicant, value: String(partial.perApplicant) });
  if (partial.pool !== undefined) {
    const valid = new Set((await getReviewerPool({ perApplicant: 0, pool: [] })).map((p) => p.id));
    if (partial.pool.some((id) => !valid.has(id))) return { error: "One of those reviewers isn't an active exec." };
    rows.push({ key: REVIEW_SETTING_KEYS.pool, value: partial.pool.join(",") });
  }
  if (rows.length === 0) return {};

  const supabase = await createClient();
  const { error: upsertError } = await supabase.from("org_settings").upsert(rows, { onConflict: "key" });
  if (upsertError) return { error: upsertError.message };
  await logAudit(profile.id, "recruit.settings_changed", null, rows.map((r) => `${r.key}=${r.value}`).join(", "));
  revalidateAll();
  return {};
}
```
(Remove the unused `getReviewSettings` import if lint flags it.)

- [ ] **Step 6: Guard `saveReviewAction`** in `src/actions/recruit.ts`: directly after the `if (input.stage === "interview") { … }` block (before `const { data: rubric…`), add:

```ts
  if (input.stage === "resume") {
    const { count, error: assignError } = await supabase
      .from("recruit_review_assignments")
      .select("id", { count: "exact", head: true })
      .eq("applicant_id", input.applicantId)
      .eq("reviewer_id", profile.id)
      .eq("stage", "resume");
    if (assignError) return { error: assignError.message };
    if ((count ?? 0) === 0) return { error: "That applicant isn't assigned to you." };
  }
```

- [ ] **Step 7:** `npx tsc --noEmit && npx vitest run` — Expected: clean / PASS.
- [ ] **Step 8: Commit** — `git add src && git commit -m "Applicant review: import, assignment and reveal actions; guard resume scoring to assigned reviewers"`

---

### Task 8: Import applications dialog

**Files:**
- Create: `src/lib/read-spreadsheet.ts`, `src/app/portal/(app)/admin/applicants/import-applications-dialog.tsx`
- Modify: `…/applicants/applicants-workspace.tsx`, `package.json`

**Interfaces:**
- Consumes: `parseApplicationSheet`, `parseCsvText`, `PreviewRow`, `defaultChoices`, `buildApplicationCommitRows`, actions from Task 7.
- Produces: `readSpreadsheet(file: File): Promise<unknown[][]>`; `<ImportApplicationsDialog quarterId={string} />`.

- [ ] **Step 1:** Invoke `frontend-design:frontend-design`; read the Next docs named in Global Constraints.
- [ ] **Step 2: Install** `npm install read-excel-file`. Then open `node_modules/read-excel-file/README.md` and confirm the browser import and call shape (v5 style is `import readXlsxFile from "read-excel-file"; const rows = await readXlsxFile(file)`; newer versions may export from `read-excel-file/browser` or return sheet objects). Adapt only the xlsx branch below to what the installed version documents.
- [ ] **Step 3: `src/lib/read-spreadsheet.ts`**

```ts
import { parseCsvText } from "@/lib/csv-parse";

/** Browser only. Reads the first sheet of an .xlsx, or a .csv, into rows of cells (header row first). */
export async function readSpreadsheet(file: File): Promise<unknown[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return parseCsvText(await file.text());
  if (name.endsWith(".xlsx")) {
    const { default: readXlsxFile } = await import("read-excel-file");
    return (await readXlsxFile(file)) as unknown[][];
  }
  throw new Error("Upload an .xlsx or .csv file.");
}
```

- [ ] **Step 4: Dialog.** Create `import-applications-dialog.tsx` following `import-dialog.tsx`'s structure (Dialog + remount-on-open `Flow`, `useTransition`, `toast`, `router.refresh()`). Steps and behavior:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSpreadsheet, Undo2 } from "lucide-react";
import {
  assignReviewersAction,
  commitApplicationImportAction,
  previewApplicationImportAction,
  undoApplicationImportAction,
} from "@/actions/recruit-review";
import { readSpreadsheet } from "@/lib/read-spreadsheet";
import {
  buildApplicationCommitRows,
  defaultChoices,
  parseApplicationSheet,
  type ApplicationChoice,
  type ParseResult,
  type PreviewRow,
} from "@/lib/recruit-applications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type Step = "upload" | "review" | "done";

export function ImportApplicationsDialog({ quarterId }: { quarterId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <FileSpreadsheet />
            Import applications
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {open && <Flow quarterId={quarterId} onClose={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Flow({ quarterId, onClose }: { quarterId: string; onClose: () => void }) {
  const [step, setStep] = useState<Step>("upload");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [choices, setChoices] = useState<Record<number, ApplicationChoice>>({});
  const [result, setResult] = useState<{ batchId: string; created: number; updated: number; skipped: number } | null>(null);
  const [assigned, setAssigned] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const undecided = rows.filter((r) => r.group === "needs-look" && !choices[r.application.rowNumber]);
  const importing = buildApplicationCommitRows(rows, choices);

  function onFile(file: File | undefined) {
    if (!file) return;
    startTransition(async () => {
      try {
        const sheet = parseApplicationSheet(await readSpreadsheet(file));
        if (sheet.missingRequired.length > 0) {
          toast.error(`Couldn't find the ${sheet.missingRequired.join(" and ")} column. Is this the application export?`);
          return;
        }
        const preview = await previewApplicationImportAction({ quarterId, applications: sheet.applications });
        if (preview.error || !preview.rows) {
          toast.error(preview.error ?? "Couldn't read that file.");
          return;
        }
        setParsed(sheet);
        setRows(preview.rows);
        setChoices(defaultChoices(preview.rows));
        setStep("review");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't read that file.");
      }
    });
  }

  function commit() {
    startTransition(async () => {
      const out = await commitApplicationImportAction({ quarterId, rows: importing });
      if (out.error || !out.batchId) {
        toast.error(out.error ?? "Import failed.");
        return;
      }
      setResult({ batchId: out.batchId, created: out.created ?? 0, updated: out.updated ?? 0, skipped: out.skipped ?? 0 });
      setStep("done");
      router.refresh();
    });
  }

  function assign() {
    startTransition(async () => {
      const out = await assignReviewersAction({ quarterId });
      if (out.error) {
        toast.error(out.error);
        return;
      }
      setAssigned(out.added ?? 0);
      router.refresh();
    });
  }

  function undo() {
    if (!result) return;
    startTransition(async () => {
      const out = await undoApplicationImportAction(result.batchId);
      if (out.error) {
        toast.error(out.error);
        return;
      }
      toast.success(`Removed ${out.archived} applicants this import created.`);
      router.refresh();
      onClose();
    });
  }

  // Render per step (see below).
  return null;
}
```

Replace the final `return null;` with the three step renderings:
- **upload:** `DialogHeader` (title "Import applications", description "Upload the Google Form export (.xlsx or .csv). Interview availability columns are ignored."), a single `<Input type="file" accept=".xlsx,.csv" onChange={(e) => onFile(e.target.files?.[0])} disabled={isPending} />`.
- **review:** one summary line — `{rows.length} applications · {new} new · {update} already in the portal (will be updated) · {needs-look} need a look`; if `parsed.duplicatesInFile > 0` a muted line "{n} people submitted twice — kept their latest"; if `parsed.skipped.length > 0` a `<details>` listing "Row {rowNumber}: {reason}"; if `parsed.unmapped.length > 0` a muted line "Ignored columns: …". Then, only for `needs-look` rows, a list (name, email, candidates) where each row has buttons: one per candidate "Same as {candidate.name}" → `{kind:"update", applicantId}`, "New person" → `{kind:"new"}`, "Skip" → `{kind:"skip"}`; the selected button uses `variant="default"`, others `variant="outline"`, with `aria-pressed`. Footer: `<Button disabled={isPending || undecided.length > 0 || importing.length === 0} onClick={commit}>Import {importing.length} applicants</Button>` plus a muted "{undecided.length} still need a decision" when blocked.
- **done:** "{created} added, {updated} updated{skipped ? `, ${skipped} skipped` : ""}." Primary button **Assign reviewers** (calls `assign`; after success replace with "{assigned} assignments made — reviewers can start scoring."), secondary `Undo this import` (`<Undo2 />`, calls `undo`), and `Close`. Under the buttons a muted note: "Undo removes applicants this import created. Updates to existing applicants are kept."

- [ ] **Step 5: Wire it.** In `applicants-workspace.tsx` import `ImportApplicationsDialog` and render `<ImportApplicationsDialog quarterId={quarterId} />` first inside the header button group; change the existing `ImportDialog` trigger label (in `import-dialog.tsx`) from "Import list" to "Import attendance".
- [ ] **Step 6:** `npx tsc --noEmit && npm run lint` — Expected: clean.
- [ ] **Step 7: Commit** — `git add -A && git commit -m "Applicant review: import applications dialog"`
- [ ] **Step 8 (needs the migration applied and a test quarter, ask first):** in Chrome (see `claude-in-chrome` skill) create a quarter named "TEST – applicant review", open Applicants → Import applications with the real `.xlsx`, confirm counts match the sheet (rows minus blanks), a needs-look row blocks the button until decided, import, check an applicant opens with data, then **Undo this import** and confirm they vanish. Re-import and keep the data for later tasks.

---

### Task 9: Reviewer queue and application view

**Files:**
- Create: `…/applicants/application-card.tsx`
- Modify: `…/applicants/scoring-view.tsx`

**Interfaces:**
- Consumes: `ScoringApplicant.application`, `.unlocked`; `driveEmbedUrl`.
- Produces: `<ApplicationCard name={string} email={string | null} major={string | null} application={ApplicationAnswers | null} applicationLink={string | null} />`.

- [ ] **Step 1:** Invoke `frontend-design:frontend-design`.
- [ ] **Step 2: Create `application-card.tsx`** — a client component: header (name, email, term · how heard), a **Resume** section with a collapsible inline preview and an "Open in new tab" link, then the three essays as plain headed paragraphs. Layout rules: no nested cards, essays use `whitespace-pre-wrap`, body text `text-sm leading-relaxed`, max readable width.

```tsx
"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { ApplicationAnswers } from "@/lib/data/recruit-review";
import { driveEmbedUrl } from "@/lib/recruit-applications";
import { Button } from "@/components/ui/button";

const ESSAYS: { key: "essayWhy" | "essayTeamwork" | "essayBring"; title: string }[] = [
  { key: "essayWhy", title: "Why join 180 Degrees Consulting?" },
  { key: "essayTeamwork", title: "A time you worked on a team" },
  { key: "essayBring", title: "What they would bring to a diverse team" },
];

export function ApplicationCard({
  name,
  email,
  application,
  applicationLink,
}: {
  name: string;
  email: string | null;
  application: ApplicationAnswers | null;
  applicationLink: string | null;
}) {
  const [showResume, setShowResume] = useState(false);
  const resumeUrl = application?.resumeUrl ?? applicationLink;
  const embed = driveEmbedUrl(resumeUrl);

  return (
    <article className="space-y-6">
      <header className="space-y-1">
        <h3 className="text-lg font-semibold">{name}</h3>
        <p className="text-sm text-muted-foreground">
          {[email, application?.graduationTerm, application?.howHeard && `Heard via ${application.howHeard}`].filter(Boolean).join(" · ")}
        </p>
      </header>

      {resumeUrl && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {embed && (
              <Button size="sm" variant="outline" onClick={() => setShowResume((v) => !v)}>
                {showResume ? "Hide resume" : "Show resume"}
              </Button>
            )}
            <a
              href={resumeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
            >
              Open resume <ExternalLink className="size-3.5" />
            </a>
          </div>
          {embed && showResume && (
            <iframe src={embed} title={`${name} resume`} className="h-[32rem] w-full rounded-lg border" />
          )}
        </section>
      )}

      {application ? (
        ESSAYS.map(({ key, title }) => (
          <section key={key} className="space-y-1">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h4>
            <p className="max-w-prose whitespace-pre-wrap text-sm leading-relaxed">{application[key] ?? "No answer"}</p>
          </section>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">No application answers were imported for this applicant.</p>
      )}
    </article>
  );
}
```

- [ ] **Step 3: Modify `scoring-view.tsx`.**
  - `OthersPanel`: take `stage` and replace the first early-return with `if (!applicant.unlocked)` and stage-specific copy: resume → "Other reviewers' scores stay hidden until everyone assigned to this applicant has submitted."; interview → the existing "hidden until you submit yours" text. Replace `applicant.mine?.submitted` gating of the rest with `applicant.unlocked`.
  - Empty state for `stage === "resume"`: title "No applicants are assigned to you yet", body "Import applications, then use Assign reviewers in the Review progress tab."
  - In `StagePanel`'s right column for resume, wrap content in `<div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">` with `<ApplicationCard …/>` in the left cell and, in the right cell (`xl:sticky xl:top-4 space-y-5`), `ScoreForm` + `OthersPanel`. Interview keeps the current stacked layout.
  - Progress text for resume: "**{mineCount}** of {n} assigned to you scored".
  - Keep the `ReviewerInsights` block.
- [ ] **Step 4:** `npx tsc --noEmit && npm run lint` — Expected: clean.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "Applicant review: assigned queue with in-portal application view"`
- [ ] **Step 6 (needs migration + test data):** In Chrome, sign in as an exec, click **Assign reviewers**, open Scoring → Resume: confirm only assigned applicants listed, essays render, resume preview loads (or fallback link shows), score and Submit & next work, and the "hidden until everyone submits" copy shows. Check the iframe isn't blocked (browser console / `next.config.ts` headers); if a CSP header blocks `drive.google.com` framing, add it to `frame-src` in `next.config.ts`.

---

### Task 10: Review progress tab, reviewer settings, wiring

**Files:**
- Create: `…/applicants/review-progress-view.tsx`, `…/applicants/review-settings-card.tsx`
- Modify: `…/applicants/applicants-workspace.tsx`, `…/applicants/setup-view.tsx`

**Interfaces:**
- Consumes: `ScoringBundle.dashboard`, `.reviewSetup`; actions `assignReviewersAction`, `setApplicantReviewersAction`, `setRevealAction`, `updateReviewSettingsAction`; `toCsv`/`downloadCsv` from `@/lib/csv`.
- Produces: `<ReviewProgressView quarterId dashboard setup />`, `<ReviewSettingsCard settings pool />`.

- [ ] **Step 1:** Invoke `frontend-design:frontend-design`.
- [ ] **Step 2: `review-progress-view.tsx`.** Client component. Layout, top to bottom:
  1. Three plain stats in a row (stack on phone): *Applicants*, *Fully reviewed*, *Need reviewers* — from `dashboard.totals`. Beside them the primary **Assign reviewers** button (`assignReviewersAction({quarterId})`; toast "{n} assignments made" or the returned error) and a secondary **Export CSV**.
  2. **Reviewers** list: name, `done / assigned`, thin progress bar (`done/assigned`).
  3. **Applicants** table with a status filter (`<Select>`: All / Needs reviewers / In progress / Complete) and a name search `<Input>`. Columns: Applicant · Reviewers (each reviewer's name with a ✓ when submitted) · Status badge (`unassigned` → "Needs reviewers", `not-started` → "Not started", `in-progress` → "{submitted}/{assigned}", `complete` → "Complete", `revealed` → "Revealed") · Raw · Adjusted (– when locked) · a "Reviewers disagree" badge · row actions: **Reviewers** (opens the reassign dialog) and, for locked rows with assignments, **Reveal now** (`setRevealAction({applicantId, revealed:true})`; for `revealed` rows **Hide again**). Wrap the table in `overflow-x-auto` so the page itself never scrolls horizontally on a phone.
  4. **Reassign dialog** (state: `editingId`): one row per pool reviewer with a `<Select>` of `Assigned` / `Not assigned` / `Conflict (never assign)` initialised from `setup.detail[applicantId]` (assigned → Assigned, conflicts → Conflict). Save calls `setApplicantReviewersAction({applicantId, assigned, conflicts})`, toasts errors (e.g. the "already submitted can't be unassigned" message), `router.refresh()` on success.
  CSV: headers `["Applicant","Email","Status","Reviewers submitted","Reviewers assigned","Raw","Adjusted","Disagree"]`; raw/adjusted rendered with `toFixed(2)` or `""` when locked.
- [ ] **Step 3: `review-settings-card.tsx`.** A section titled **Reviewers**: a numeric `<Input>` "Reviewers per applicant" (default from settings) and a checkbox list of exec reviewers ("Who reviews applications"), all checked when `settings.pool` is empty. **Save** calls `updateReviewSettingsAction({perApplicant, pool})` where `pool` is `[]` if every exec is checked, else the checked ids; helper text: "Changes apply the next time you press Assign reviewers. People removed here keep their finished reviews." Disable Save when no reviewers are checked.
- [ ] **Step 4: Wire.** In `applicants-workspace.tsx` add a tab `<TabsTrigger value="review">Review progress {scoring.dashboard.totals.unassigned > 0 && <Badge variant="secondary">{unassigned}</Badge>}</TabsTrigger>` placed right after **Scoring**, with `<TabsContent value="review"><ReviewProgressView quarterId={quarterId} dashboard={scoring.dashboard} setup={scoring.reviewSetup} /></TabsContent>`. In `SetupView` add an optional prop `reviewSetup` and render `<ReviewSettingsCard …/>` above the rubric editor (pass `scoring.reviewSetup` from the workspace). Update the Scoring empty-state link text to mention the Review progress tab.
- [ ] **Step 5:** `npx tsc --noEmit && npm run lint && npx vitest run` — Expected: clean / PASS.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "Applicant review: review progress dashboard, reviewer settings, reassign and reveal"`

---

### Task 11: End-to-end verification

**Files:** none (fixes found here go in a follow-up commit).

- [ ] **Step 1: Confirm the target.** Re-check with the user that the migration is applied and that testing happens in the "TEST – applicant review" quarter only.
- [ ] **Step 2: Full gate.** `npx vitest run && npm run lint && npx tsc --noEmit && npm run build` — Expected: all pass.
- [ ] **Step 3: Browser walkthrough (claude-in-chrome skill; load tools in one ToolSearch call).** In the test quarter, with the real spreadsheet:
  1. Import → counts match; a double submission is reported once; availability columns not stored.
  2. Assign reviewers → every applicant has exactly 2; per-reviewer counts differ by at most 1; run it again → "0 assignments made".
  3. Sign in as two different assigned execs (or use two sessions): each sees only their queue; submit both reviews for one applicant → after the first submit the other score is still hidden; after the second, the applicant unlocks and scores appear in Review progress.
  4. As a non-assigned exec, call the save path for an unassigned applicant (via the UI is impossible) — confirm `saveReviewAction` returns "That applicant isn't assigned to you." using a quick one-off check or a temporary console call; remove any temporary code.
  5. Force-reveal one locked applicant → scores appear; Hide again → they disappear. Reassign dialog: try to unassign a reviewer who already submitted → error toast.
  6. Applicants tab ranked view shows resume scores only for unlocked applicants.
  7. Resize to 390px width: no horizontal page scroll on Scoring and Review progress; tap targets usable.
  8. Export CSV opens and matches the table.
- [ ] **Step 4:** Archive or delete the test quarter data only if the user asks. Report results with the commands run and their output.

---

## Self-Review Notes

- **Spec coverage:** import (T3, T7, T8), data model (T1), assignment + exclusions + self-exclusion + idempotence (T4, T7), reveal rule server-enforced (T4, T6, T7), queue + application view (T9), dashboard + CSV (T5, T6, T10), default rubric (T1), settings (T2, T10), errors/edge cases (T3, T4, T7), verification (T11). Deviations from the spec, all intentional: merged-away assignments are not moved (Global Constraints); unmapped columns are reported instead of stored in `extras jsonb`; the "force-reveal by admins" is any exec (the app has no separate admin tier beyond exec roles); undo only removes applicants the import created.
- **Type consistency:** `Assignment`, `ReviewSettings`, `ApplicationAnswers`, `PreviewRow`, `ApplicationCommitRow`, `ReviewDashboard` are defined once and imported by the tasks that use them.
