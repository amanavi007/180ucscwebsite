# Recruitment Points — Piece 4: Decision View

Date: 2026-10-07
Status: Draft for review. Builds on pieces 1–3.

## Goal

Turn engagement points, resume scores and interview scores into one weighted composite per applicant and
present a ranked view built for making accept/decline decisions: where the cutoff falls, who is on the
bubble, and why someone ranks where they do.

## Decisions carried in

- **Weighted composite**, section weights editable by any exec. Defaults: engagement 30, resume 30,
  interview 40 (percent, must total 100).
- **Engagement full marks**: an editable number of points that equals 100% engagement (default 5);
  more than that is capped at 100%, negative totals floor at 0%.
- No hard flags or auto-disqualifiers. No separate "decision" status is stored in this piece.
- Raw vs normalized scores is a visible toggle; default is normalized.
- Approved UI direction: "Leaderboard v2" — funnel strip, per-row breakdown bar and stage dots, a dashed
  cutoff line with "on the bubble" highlight, signals (reviewers disagree, normalization moved them), and a
  side panel with the full breakdown and notes.

## Math (pure, in `src/lib/recruit-composite.ts`)

Section percentages (0–100):
- `engagement = clamp(totalEngagementPoints / fullMarks, 0, 1) × 100`, where total counts live ledger points
  in categories whose section is `engagement`.
- `resume` / `interview = (stageScore − scale_min) / (scale_max − scale_min) × 100`, using the normalized or
  raw stage score per the toggle. A section with no submitted reviews is *missing*.

`composite = Σ (weight_s × pct_s) / Σ weight_s` over the sections that are **present** (so weights are
renormalized over what exists). An applicant with any missing section is marked **Incomplete** (chip and
hollow stage dot). The ranking includes everyone; a filter chip shows **Complete only**. Applicants with no
data at all rank last.

`rankApplicants(rows, toggle)` returns rank (ties share a rank), composite, the three section percentages,
completeness, and a `normalizationDelta` (normalized − raw composite). Cutoff helpers:
`bubble(rows, acceptingCount, width)` returns ids within `width` places of the cutoff.

## Settings (`org_settings`, editable in a new "Scoring settings" card in Setup)

`recruit_weight_engagement`, `recruit_weight_resume`, `recruit_weight_interview`,
`recruit_engagement_full_marks`, `recruit_accepting_count` (default 30), `recruit_bubble_width` (default 3).
The weights editor shows a live total and refuses to save unless it equals 100; changing any value
recalculates the view immediately.

## UI

- **Applicants page** (replaces the piece 1 list): funnel strip counts (All / Engaged / Resume scored /
  Interviewed / Complete), the to-do banner (duplicates, coffee chats to mark, resumes you haven't scored),
  search, filter chips, sort (composite, name, engagement, resume, interview), the **Raw ↔ Normalized**
  toggle, and ranked rows: rank, composite ring, name, chips (Previously applied, Incomplete, On the
  bubble), three-segment breakdown bar, stage dots, signals.
- **Cutoff line**: after `recruit_accepting_count` ranked rows a dashed line labelled "Cutoff · accepting ~N";
  rows within `bubble_width` places either side get an "on the bubble" tint. Editing N is inline.
- **Side panel**: Engagement (entries with categories/events), Resume and Interview (stage score raw and
  normalized with weights, per-reviewer scores and comments for reviewers who have submitted themselves,
  criterion breakdown), composite explanation ("30% × 88 + 30% × 76 + 40% × 90 = 85"), notes, history.
- **Export CSV**: current filtered/sorted view with section percentages, stage scores raw and normalized,
  engagement points, composite, rank, completeness (uses `src/lib/csv.ts`).
- Help popover text updated to explain composite, normalization and the cutoff in plain language.

## Errors and edge cases
- Weights not totalling 100 or non-numeric: rejected; settings fall back to defaults if unset.
- `accepting_count` larger than the number of applicants: line sits at the end; 0 hides it.
- Full marks 0 or negative: rejected (would divide by zero).
- Quarter with no applicants / no scores: friendly empty states already in place.
- Rubric scale edited after scoring: percentages read the current scale (warned in piece 3).

## Testing
Unit (pure): engagement percent (cap, floor, full marks edits), stage percent mapping, composite with all /
some / no sections present, weight renormalization, tie ranking, raw vs normalized delta, bubble selection at
the edges, CSV row shape. Manual: seed a few applicants across all sections, change weights and full marks and
watch ranking and the cutoff line move; export and open the CSV.

## Out of scope
Recording final decisions, emailing applicants, cross-quarter comparisons.
