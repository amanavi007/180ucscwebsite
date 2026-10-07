# Recruitment Points — Piece 3: Rubrics, Reviewer Scoring and Normalization

Date: 2026-10-07
Status: Draft for review. Builds on pieces 1 and 2.

## Goal

Let several execs score each applicant's resume / written application and interview against an editable
rubric, then combine the scores fairly even when some reviewers grade high and others low, by normalizing
each reviewer's scores (z-scores). Raw and normalized are always both visible.

## Decisions carried in

- Scores are **1–5** by default (editable per rubric). Any exec can score any applicant.
- **Blind until you submit**: you cannot see other reviewers' scores for an applicant/stage until you have
  submitted your own. After that everyone's scores are visible. (This reduces anchoring; execs all share
  database access, so it is a workflow nudge, not a security boundary.)
- Rubrics and criteria are **editable by any exec at any time**: add, rename, reorder, re-weight, archive.
- Interview scoring lists only applicants whose interview booking is marked *attended* (piece 2).
  The written application lives outside the portal; each applicant gets an optional `application_link`.
- No hard flags or auto-disqualifiers.

## Data

- `recruit_rubrics`: `stage` (`resume` | `interview`) unique, `scale_min` (1), `scale_max` (5), `updated_at`.
  Seeded with one rubric per stage.
- `recruit_rubric_criteria`: `rubric_id`, `name`, `description` (what a 1 and a 5 look like), `weight numeric`
  (default 1), `sort_order`, `archived_at`. Not quarter-scoped, so the rubric carries over each cycle.
- `recruit_reviews`: `applicant_id`, `stage`, `reviewer_id`, `comment`, `submitted_at`, unique
  `(applicant_id, stage, reviewer_id)`. A review without `submitted_at` is a draft.
- `recruit_review_scores`: `review_id`, `criterion_id`, `score numeric`, unique `(review_id, criterion_id)`.
- `recruit_applicants.application_link text null`.
- `org_settings`: `recruit_normalize_min_n` (default 8), `recruit_disagreement_threshold` (default 1.5).

## Scoring math (pure, in `src/lib/recruit-scoring.ts`)

1. **Review score** = weighted mean of the review's criterion scores, using current criterion weights
   (archived criteria still count for reviews that already scored them; new reviews don't show them).
   Computed on read, so a weight edit instantly recalculates everything. Missing criterion scores in a
   submitted review are ignored in the weighted mean.
2. **Reviewer stats** per `(stage, reviewer)` over submitted reviews in the selected quarter:
   `n`, `mean`, `sd` (population SD).
3. **Normalized review score**: if `n >= recruit_normalize_min_n` and `sd > 0`, then
   `z = (score − reviewer.mean) / reviewer.sd` and `adjusted = pool.mean + z × pool.sd`, clamped to the scale,
   where `pool` is the mean/SD of *all* submitted review scores in that stage. Otherwise the review's raw
   score is used unchanged and flagged "not normalized yet (too few scores)". Putting the z back on the
   pooled scale keeps normalized numbers readable as 1–5.
4. **Applicant stage score** = mean across submitted reviews, in two forms: `raw` and `normalized`.
5. **Disagreement** = `max − min` of the applicant's raw review scores for the stage (needs ≥ 2 reviews);
   flagged when ≥ `recruit_disagreement_threshold`.

Known limits, stated in the UI help text: normalization assumes reviewers see broadly comparable pools; with
few reviews per reviewer it falls back to raw; one reviewer scoring everything identically (sd 0) is not
normalized.

## UI

- **Scoring tab** on the Applicants page: stage switcher (Resume / Interview); a queue of applicants you
  haven't scored with progress ("14 of 51 scored by you"); a scoring form with one row per active criterion
  (description visible, 1–5 button group, keyboard 1–5 and Enter to submit, **Submit & next**), a comment box,
  and an **Open application** link. Drafts autosave. You can edit your own score until you change it.
- After you submit, the applicant's other reviews appear (reviewer name, score, comment, a spread bar).
- **Reviewer insight panel** per stage: each reviewer's `n`, mean, SD and whether they are normalized, so it
  is obvious who grades harsh or generous.
- **Setup tab** gains **Rubrics**: per stage, criteria list with add / edit / reorder / re-weight / archive and
  the scale min/max (changing the scale warns: "existing scores are read on the new scale"). Normalization
  threshold and disagreement threshold are editable settings with plain-language help.
- Applicant side panel shows per-stage raw and normalized scores and flags.

## Errors and edge cases
- Scoring an applicant who has since been merged away: the action refuses with a clear message.
- Reviewer submits twice: updates their one review.
- A rubric with no active criteria: scoring tab explains and links to Setup.
- Score outside the scale or non-numeric: rejected server-side.
- Weights that sum to 0: treated as equal weights.

## Testing
Unit (pure): weighted mean incl. missing/archived criteria; reviewer stats; normalization with enough data,
too little data, sd 0, clamping; pooled mean/SD; disagreement; weight edit recalculation; blind-visibility rule
(`visibleReviews(viewerId, reviews)` returns only the viewer's own until they have submitted). Manual: score a
batch as two execs with one generous and one harsh grader and confirm normalization narrows the gap.

## Out of scope
Weighted composite and ranking (piece 4); assigning reviewers; emailing applicants.
