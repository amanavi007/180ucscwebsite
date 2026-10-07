# Recruitment Points System — Piece 1: Foundation

Date: 2026-10-07
Status: Design approved in conversation; awaiting written-spec review.

## Context and goal

The portal already schedules recruitment coffee chats and interviews, but there is no record of an
applicant and no way to compare applicants. This project adds a points-based system so execs can look
at every applicant comprehensively and make recruitment decisions. The quarterly spreadsheet it replaces
is the same idea: engagement (info sessions, coffee chats), written-app/resume scores, and interview
scores, rolled into one ranking.

The full system is split into four independently shippable pieces. **This spec covers piece 1 only.**
Pieces 2–4 are summarized under "Roadmap" so the vision is not lost, and each gets its own spec.

### Who uses it
Execs only. Applicants never see any of it. Any exec can do everything (edit categories, award points,
merge duplicates); the audit log records consequential actions.

### Key decisions made with the project owner
- Applicants are **created on the fly** (no mandatory roster import), with duplicate detection and merge.
- Names are the matching key for Zoom/in-person lists (people join Zoom with school accounts).
- Point **categories are editable by any exec at any time**, not hardcoded.
- Events are **named and dated** (e.g. "Info Session 1, Oct 14") under a category.
- Penalties exist but are rare (e.g. −1 for an unexcused coffee chat no-show). **Excused** is a status
  worth 0; cancelling through the booking link counts as excused.
- A coffee chat is one per applicant by nature, so **no per-category point cap**.
- Each quarter has **fresh applicant records**, with a "previously applied" note if the email matches an
  earlier quarter.
- Final ranking will be a **weighted composite** with editable section weights (piece 4). No hard flags
  / auto-disqualifiers for now.
- Resume/interview scoring will use several reviewers, an editable rubric (1–5 default scale) and
  per-reviewer z-score normalization, always showing raw and normalized (piece 3).
- UI must be self-explanatory: this will outlive its author and be used by execs who were never trained.

## Scope of piece 1

In: applicant records, aliases, duplicate detection and merge, editable categories and events, the
append-only points ledger, manual awarding and voiding of points, and the Applicants page (leaderboard
UI) and setup screens.

Out (later pieces): bulk Zoom/name-list import and its review step, linking to coffee chat/interview
bookings, rubrics and reviewer scoring, normalization, weighted composite and decision tooling, CSV export.

## Data model

Exec-only RLS on every table via `public.is_exec()` (same pattern as `interview_*`). No anon policy.
Migration: `supabase/migrations/20261007000001_recruitment_points.sql`. Update
`src/lib/supabase/database.types.ts` the same way earlier features did.

### `recruit_applicants`
- `id uuid pk`, `quarter_id uuid not null → quarters(id) on delete cascade`
- `name text not null`, `email text null` (normalized: `lower(btrim())`, check constraint), `major text`,
  `year text`, `notes text not null default ''`
- `previous_applicant_id uuid null → recruit_applicants(id) on delete set null`
- `merged_into_id uuid null → recruit_applicants(id)`, `archived_at timestamptz null`
- `created_at`, `updated_at` (existing `set_updated_at` trigger)
- Unique index on `(quarter_id, email)` where `email is not null and archived_at is null`.

### `recruit_applicant_aliases`
- `id`, `applicant_id → recruit_applicants on delete cascade`, `quarter_id`, `alias text` (normalized
  display name as it appears in Zoom/lists), `created_at`.
- Unique on `(quarter_id, alias)`. Created when an exec confirms a fuzzy match.

### `recruit_categories` (not quarter-scoped; carries over each cycle)
- `id`, `name text not null`, `section text not null check in ('engagement','resume','interview')`,
  `default_points numeric not null`, `sort_order int not null default 0`, `archived_at timestamptz null`.
- Seeded: Info Session (+1), Coffee Chat Attended (+1), Coffee Chat No-show (−1),
  Coffee Chat Excused (0). Section for all seeds: `engagement`.
- `numeric` (not int) so half points are possible.

### `recruit_events`
- `id`, `quarter_id → quarters on delete cascade`, `category_id → recruit_categories`,
  `name text not null`, `date date not null`, `created_at`.

### `recruit_points` (append-only ledger)
- `id`, `applicant_id → recruit_applicants`, `category_id → recruit_categories`,
  `event_id → recruit_events null`, `points numeric not null`, `reason text null`,
  `source text not null default 'manual' check in ('manual','import','booking')`,
  `batch_id uuid null` (groups one import so it can be undone in one click; unused by piece 1 UI),
  `awarded_by uuid null → profiles on delete set null`, `created_at`,
  `voided_at timestamptz null`, `voided_by uuid null`, `void_reason text null`.
- Index on `(applicant_id)` and `(batch_id)`.
- Entries are never hard-deleted; voiding is the only removal. Totals = sum of `points` where
  `voided_at is null`, computed on read (≈120 applicants, a few thousand rows — no denormalized totals).

### Merge function
`public.merge_recruit_applicants(p_survivor uuid, p_absorbed uuid, p_absorbed_alias text default null,
p_keep_email text default null)` — a SQL function that checks `public.is_exec()` and runs in a single
transaction: re-points `recruit_points` and aliases to the survivor, fills the survivor's empty fields
(email, major, year; notes appended) from the absorbed record, archives the absorbed record with
`merged_into_id = survivor`, and adds `p_absorbed_alias` (the app passes the absorbed record's normalized
name, since SQL can't replicate the JS normalization) as an alias of the survivor. If both have different
non-null emails, `p_keep_email` is required, otherwise the function raises.

### `recruit_merge_log`
`id`, `survivor_id`, `absorbed_id`, `moved_point_ids uuid[]`, `moved_alias_ids uuid[]`,
`added_alias_id uuid` (the alias the merge created, so undo can remove it),
`survivor_before jsonb` (the survivor's fields before filling), `created_at`, `undone_at`. The merge
function writes one row. **Undo merge** (a second SQL function) restores the absorbed record, moves back
exactly the recorded rows, restores the survivor's prior fields, and sets `undone_at`. Undo is refused if
the survivor has since been merged into another record.

## Duplicate detection (app code, `src/lib/recruit-matching.ts`)

Pure functions, no DB extension. `normalizeName` lowercases, strips punctuation, collapses whitespace,
handles `Last, First` ordering and strips a trailing Zoom suffix such as `(he/him)` or ` - iPhone`.

`matchApplicant(input: {name, email?}, existing[])` returns candidates with a 0–100 score and a class:
1. **exact email** → `duplicate` (block; offer "use existing").
2. **exact normalized name or alias** → `likely` (warn; default "use existing").
3. **fuzzy** → `maybe` (flag), using token similarity that handles initials ("Jess K." ~ "Jessica Kim"),
   nickname-prefix matches ("Jess" ~ "Jessica"), reordering, and small edit distance. Must keep
   "Jessica Kim" and "Jessica Kimball" apart.

Piece 1 never auto-accepts a match; every suspected duplicate is surfaced for a human. An auto-accept
threshold (exact normalized matches only by default) arrives with the bulk importer in piece 2.

Detection runs (a) live in the Add-applicant dialog, (b) as the "possible duplicates" count and list on the
Applicants page (recomputed on load across the quarter's applicants), and (c) later in the import review.

## UI (route `/portal/admin/applicants`, `admin-recruitment` sidebar group, `quarterScoped: true`)

Follows the approved "Leaderboard v2" mockup, scaled to what exists in piece 1.
Mockups: `.superpowers/brainstorm/*/content/applicants-home-v2.html` (local, not committed).

- **Applicants page**: funnel strip (counts per stage that exist), to-do banner (possible duplicates;
  later pieces add coffee chats to mark and unscored resumes), search, filter chips, sort, ranked rows
  with score ring and breakdown bar. In piece 1 the ring shows engagement points. Rows carry a
  "Previously applied" chip when `previous_applicant_id` is set. Clicking a row opens a **side panel**:
  contact info, points history (with void), notes, "Give points".
- **Add applicant** dialog: name (required), email/major/year optional; duplicate check shows live matches
  before save.
- **Give points** dialog: category (default value pre-filled, editable per entry), optional event, optional
  reason; a negative total requires a reason.
- **Setup** tab: Categories (add, rename, reorder, edit default, archive) and Events (create named dated
  events under a category). Archived categories keep their history but cannot be chosen for new entries.
- **Duplicates** view: side-by-side cards per suspected pair with **Merge** (choose survivor) and
  **Not the same** (remembered so the pair isn't suggested again).
- Every empty state says what to do first; buttons use plain verbs; destructive actions state what will
  happen and whether it can be undone; each page has a short "How this works" popover.

"Not the same" is stored in `recruit_not_duplicates (applicant_a, applicant_b)` with a unique,
ordered pair.

## Server layer

- `src/lib/recruit.ts` — pure logic (totals, merge field resolution, validation) with unit tests.
- `src/lib/recruit-matching.ts` — matcher, with unit tests.
- `src/lib/data/recruit.ts` — reads (`server-only`, exec client, RLS enforces access).
- `src/actions/recruit.ts` — Server Actions: add/edit applicant, award points, void points,
  category and event CRUD, merge, mark not-duplicate. Each starts with `requireExec()`, returns
  `{ error?: string }` instead of throwing, calls `revalidatePath`, and writes `logAudit` for merges,
  category changes, and voids.

## Error handling

- DB constraints are the enforcement: email uniqueness per quarter, non-null points, archived-category
  check in the action plus a trigger or check at insert time.
- Merge is transactional. A failed merge leaves both records untouched.
- No active quarter: the page explains and links to Quarters settings.

## Testing

Unit tests (Vitest, matching existing `*.test.ts` files): name normalization, matcher table (positive and
negative cases), duplicate classification, ledger totals (voided and negative entries), merge field
resolution. Manual browser verification against the mockups: empty state, add with duplicate warning,
merge, −1 with reason, void, category archive.

## Roadmap (separate specs)

2. **Bulk entry and linking** — paste/upload Zoom CSV or name list, review step grouped by "what needs
   you" (matched collapsed; uncertain rows with one action each; new people listed), alias learning,
   one-click undo by `batch_id`; attendance marking on coffee chat/interview bookings (attended / no-show /
   excused; link-cancel = excused) auto-creating ledger rows, linked by email in the active quarter, one
   booking → at most one points row.
3. **Scoring** — editable rubrics (criteria, 1–5 default scale, weights), several reviewers per
   resume/interview, per-reviewer z-score normalization with minimum-sample fallback to raw, always
   showing raw and normalized, optional blind scoring, reviewer-disagreement signal.
4. **Decision view** — weighted composite with editable section weights, cutoff line with "on the
   bubble" highlight, detail side panel with full breakdown and notes, CSV export.
