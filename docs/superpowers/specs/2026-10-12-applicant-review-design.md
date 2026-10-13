# Applicant Review — Application Import, Blind Assignment and Review Dashboard

Date: 2026-10-12
Status: Draft for review. Builds on the four recruitment-points specs (2026-10-07).

## Goal

Starting 2026-10-13 execs review Fall 2026 applications entirely inside the portal. The Google Form responses
(exported as a spreadsheet) are imported in one step; every applicant is auto-assigned to N independent
reviewers who score blind against an editable rubric; progress and scores show on one dashboard.

## Decisions carried in

- Reviewers are **auto-assigned**: N per applicant (default 2) from a reviewer pool (default: all 6 execs).
- **Reveal rule**: other reviewers' scores stay hidden, even after you submit your own, until every assigned
  reviewer for that applicant has submitted; then that applicant unlocks for everyone. Admins can force-reveal
  one applicant early. Reveals are per applicant. Enforced server-side, not only in the UI.
- Rubric is generic, seeded with sensible defaults, and editable by any exec in Setup (already built).
- **Interview availability is not imported or stored**; applicants book interviews through the existing
  interview-scheduling flow.
- Scoring first, UI redesign (Setup, Attendance, Applicants) afterwards; new screens use the cleaner design
  from the start.
- Existing scoring math (weighted mean, z-score normalization, disagreement, composite ranking) is reused
  unchanged.

## Source data (the Form export)

Columns used: Timestamp, Email Address, "First, Last Name", graduation term, Major/Minor, how they heard,
three essay questions (why join, teamwork project, what they bring), resume (Google Drive link). Ignored: the
Mon–Fri availability columns and the "other date/time" column. Headers are matched by normalized text so small
wording changes still map; unmapped columns are reported in the preview, not silently dropped.

## Data

Migration `supabase/migrations/20261012000001_applicant_review.sql`; update `database.types.ts`. Exec-only RLS
via `public.is_exec()`, like the other `recruit_*` tables.

- `recruit_applicant_answers`: `applicant_id` pk → `recruit_applicants`, `submitted_at timestamptz`,
  `graduation_term`, `how_heard`, `essay_why text`, `essay_teamwork text`, `essay_bring text`, `resume_url`,
  `extras jsonb` (unmapped columns). Existing `major` and `year` on the applicant are filled from the sheet.
- `recruit_review_assignments`: `id`, `applicant_id`, `reviewer_id → profiles`, `stage` (`resume`),
  `assigned_at`, unique `(applicant_id, reviewer_id, stage)`.
- `recruit_review_exclusions`: `applicant_id`, `reviewer_id` (conflict of interest), unique pair.
- `recruit_review_reveals`: `applicant_id`, `stage`, `revealed_by`, `revealed_at` (admin force-reveal).
- `org_settings`: `recruit_reviewers_per_applicant` (default 2), `recruit_reviewer_pool` (profile ids; empty =
  all execs).
- Import batches reuse the existing `batch_id` pattern so a whole import can be undone.

## Import (Applicants → Import applications)

1. Upload `.xlsx` or `.csv`; parsed in the browser. Header mapping and the first rows shown in a preview.
2. Review reuses the existing matcher: same email in the quarter → update the existing applicant's answers
   (re-import is safe); "Last, First" names are flipped; fuzzy name matches go to "needs a look"; the rest are
   new applicants.
3. Commit is atomic (SQL function, one transaction) and returns counts; **Undo import** archives applicants
   the batch created and removes answers it wrote.
4. After commit the screen offers **Assign reviewers**.

## Assignment

Pure function `assignReviewers(applicants, pool, perApplicant, exclusions, existing, seed)` in
`src/lib/recruit-assignment.ts`: greedy least-loaded with seeded random tie-breaking, so loads differ by at
most one, an applicant never gets the same reviewer twice, and exclusions are honored. If the pool is smaller
than N it fails with a clear message. Newly added applicants and removed reviewers are topped up the same way.
Execs can manually reassign any applicant. Assigning is idempotent: existing assignments are kept and only
shortfalls are filled.

## Reviewing

- **My queue** replaces the open Resume list: only applicants assigned to the signed-in reviewer, with
  "x of y done" and **Submit & next**.
- Applicant shown as readable cards: essays, major, term, how heard, and the resume in an inline Drive preview
  (`/preview` URL) with an open-in-new-tab fallback.
- Rubric criteria with 1–5 buttons beside it; stacked on phone widths.
- Server query excludes other reviewers' reviews/scores for an applicant until it is unlocked
  (all assigned submitted, or force-revealed). Submitting for an applicant you are not assigned to is rejected.
  Interview stage keeps its current behaviour.

## Review progress dashboard (new tab)

- Per reviewer: assigned / done / remaining.
- Per applicant: state (not started, 1 of N, complete, revealed), raw and normalized scores once unlocked,
  disagreement flag, force-reveal and reassign actions.
- Sortable and filterable (state, reviewer), CSV export via `src/lib/csv.ts`. Unlocked scores feed the
  existing ranked decision view unchanged.

## Default rubric

Replace the seeded resume criteria with: Motivation and fit; Teamwork and collaboration; Problem-solving and
communication; Breadth of experience and perspective; Resume and professionalism. Scale 1–5, equal weights,
each with a one-line "what a 1 / what a 5 looks like". Editable by any exec in Setup.

## Errors and edge cases

- Missing/blank name or email row: listed in the preview as skipped with the reason.
- Resume link not viewable: reviewer sees the open-in-new-tab link; no error.
- Exec is also an applicant: auto-excluded from reviewing themselves.
- Fewer eligible reviewers than N: assignment refuses and says why.
- Reviewer removed from the pool mid-cycle: their unfinished assignments are redistributed; submitted reviews
  stay.
- Merged-away applicant: assignments move with the survivor via the existing merge function.

## Testing

Unit (Vitest, pure): header mapping and sheet parsing (name flipping, blanks, BOM), assignment (balance within
one, no duplicate reviewer per applicant, exclusions, pool smaller than N, top-up idempotence), unlock rule
(`isUnlocked`, force-reveal, N changing), visibility filter. Manual in the browser against a clearly labeled
test quarter using the real sheet: import, undo, re-import, assign, review as two execs, confirm hidden then
revealed, dashboard counts and CSV. Verify `.env.local` target before any real import.

## Out of scope

UI redesign of Setup / Attendance / Applicants (follows as its own spec with mockups reviewed on phone);
interview-stage assignment; emailing applicants; recording final decisions.
