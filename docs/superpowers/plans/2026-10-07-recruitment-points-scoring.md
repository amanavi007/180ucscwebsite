# Recruitment Points — Rubrics, Reviewer Scoring and Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any exec score each applicant's resume / written application and interview against an editable rubric, blind until they submit, then combine reviewers fairly with per-reviewer z-score normalization (raw and normalized always both visible).

**Architecture:** New rubric / criteria / review / score tables. All scoring math is pure and unit-tested in `src/lib/recruit-scoring.ts` and computed on read from stored raw criterion scores, so weight edits recalculate everything. A data bundle (`getScoringBundle`) loads reviews once and produces per-stage queues (blind-filtered for the viewer) and un-blinded summaries for the decision view. UI adds a Scoring tab and rubric/settings editors in Setup.

**Tech Stack:** Next.js (breaking-changes build), Supabase Postgres + RLS, TypeScript, Vitest, base-ui shadcn components, sonner.

**Spec:** `docs/superpowers/specs/2026-10-07-recruitment-points-scoring-design.md` (builds on pieces 1 and 2, already merged)

## Global Constraints

- `AGENTS.md`: this Next.js version has breaking changes; copy patterns from `src/actions/recruit.ts` and `src/app/portal/(app)/admin/applicants/*`.
- All new tables exec-only RLS via `public.is_exec()`. Migration filename: `supabase/migrations/20261009000001_recruitment_scoring.sql`.
- Server Actions return `{ error?: string }` instead of throwing; start with `requireExec()`; call `revalidatePath("/portal/admin/applicants")`.
- Scale default **1–5**; stored scores are raw criterion scores; stage scores are computed on read; criterion weights default 1.
- **Blind until you submit**: a viewer sees other reviewers' reviews/aggregates for an applicant+stage only after submitting their own. This is a workflow nudge, not a security boundary (all execs share DB access). The decision view's un-blinded summaries are intentionally separate.
- Normalization: needs `n >= recruit_normalize_min_n` (default 8) reviews from that reviewer in the stage/quarter and non-zero SDs; otherwise the raw score is used and flagged. Population SD. Normalized score = `poolMean + z × poolSd`, clamped to the scale.
- Disagreement flag: spread (max − min of raw review scores) ≥ `recruit_disagreement_threshold` (default 1.5) with ≥ 2 reviews.
- Interview scoring lists only applicants whose interview booking link is `attended` (piece 2's `recruit_booking_links`).
- React lint rule `react-hooks/set-state-in-effect` is enforced: use `key`-remounted components / derived values, not synchronous `setState` in effects.
- Never apply the migration to a hosted Supabase without asking the user.
- Commit messages: plain, **no `Co-Authored-By` / Claude attribution lines** (saved user preference).
- Before the final commit run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## Review Focus

1. **Few or constant scores** — a reviewer with fewer than `minN` scores, or who gave every applicant the same score (SD 0), is *not* normalized and the UI says so; a pool with SD 0 never divides by zero (Task 2 tests).
2. **Blindness** — a viewer who hasn't submitted cannot see other reviewers' reviews, comments, or aggregates; drafts are never visible to others (Task 2 `visibleReviews` tests, Task 4 data layer).
3. **Rubric edits after scoring** — changing weights recomputes everything; archiving a criterion hides it from new reviews but existing scores still count; changing the scale warns (Task 2 tests, Task 5 UI).
4. **Submitting an incomplete review** — submit requires a score for every active criterion and each score inside the scale; drafts may be partial; non-numeric/out-of-range scores are rejected server-side (Task 4 action, Task 2 validation tests).
5. **Scoring a merged-away or ineligible applicant** — refused with a clear message (interview stage requires an attended interview) (Task 4 action).

---

### Task 1: Migration — rubrics, criteria, reviews, scores, settings

**Files:**
- Create: `supabase/migrations/20261009000001_recruitment_scoring.sql`
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces: tables `recruit_rubrics`, `recruit_rubric_criteria`, `recruit_reviews`, `recruit_review_scores`; column `recruit_applicants.application_link`; `org_settings` keys `recruit_normalize_min_n`, `recruit_disagreement_threshold`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20261009000001_recruitment_scoring.sql`:

```sql
-- Recruitment points piece 3: rubrics, reviewer scoring. See
-- docs/superpowers/specs/2026-10-07-recruitment-points-scoring-design.md.

alter table public.recruit_applicants
  add column if not exists application_link text;

create table public.recruit_rubrics (
  id uuid primary key default gen_random_uuid(),
  stage text not null unique check (stage in ('resume', 'interview')),
  scale_min numeric not null default 1,
  scale_max numeric not null default 5,
  updated_at timestamptz not null default now(),
  constraint recruit_rubrics_scale_check check (scale_max > scale_min)
);

alter table public.recruit_rubrics enable row level security;
create policy recruit_rubrics_all on public.recruit_rubrics
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create trigger recruit_rubrics_set_updated_at
  before update on public.recruit_rubrics
  for each row execute procedure public.set_updated_at();

create table public.recruit_rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  rubric_id uuid not null references public.recruit_rubrics (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  description text not null default '',
  weight numeric not null default 1 check (weight >= 0),
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index recruit_rubric_criteria_rubric_idx on public.recruit_rubric_criteria (rubric_id);

alter table public.recruit_rubric_criteria enable row level security;
create policy recruit_rubric_criteria_all on public.recruit_rubric_criteria
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create table public.recruit_reviews (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.recruit_applicants (id) on delete cascade,
  stage text not null check (stage in ('resume', 'interview')),
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  comment text not null default '',
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recruit_reviews_unique unique (applicant_id, stage, reviewer_id)
);
create index recruit_reviews_applicant_idx on public.recruit_reviews (applicant_id);
create index recruit_reviews_reviewer_idx on public.recruit_reviews (reviewer_id);

alter table public.recruit_reviews enable row level security;
create policy recruit_reviews_all on public.recruit_reviews
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create trigger recruit_reviews_set_updated_at
  before update on public.recruit_reviews
  for each row execute procedure public.set_updated_at();

create table public.recruit_review_scores (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.recruit_reviews (id) on delete cascade,
  criterion_id uuid not null references public.recruit_rubric_criteria (id) on delete cascade,
  score numeric not null,
  constraint recruit_review_scores_unique unique (review_id, criterion_id)
);

alter table public.recruit_review_scores enable row level security;
create policy recruit_review_scores_all on public.recruit_review_scores
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

-- One rubric per stage, with starter criteria any exec can edit.
insert into public.recruit_rubrics (stage) values ('resume'), ('interview')
on conflict (stage) do nothing;

insert into public.recruit_rubric_criteria (rubric_id, name, description, weight, sort_order)
select r.id, c.name, c.description, 1, c.sort_order
from public.recruit_rubrics r
join (values
  ('resume', 'Relevant experience', '1 = nothing relevant, 5 = clearly strong, directly relevant experience', 10),
  ('resume', 'Leadership & impact', '1 = no evidence, 5 = led others and delivered measurable results', 20),
  ('resume', 'Written communication', '1 = unclear or careless, 5 = clear, concise and thoughtful', 30),
  ('interview', 'Problem solving', '1 = struggled to structure the problem, 5 = clear, creative, well-structured thinking', 10),
  ('interview', 'Communication', '1 = hard to follow, 5 = articulate, concise and engaging', 20),
  ('interview', 'Culture fit', '1 = unlikely to thrive in the team, 5 = great team member and motivated by our mission', 30)
) as c(stage, name, description, sort_order) on c.stage = r.stage
where not exists (select 1 from public.recruit_rubric_criteria x where x.rubric_id = r.id);

insert into public.org_settings (key, value) values
  ('recruit_normalize_min_n', '8'),
  ('recruit_disagreement_threshold', '1.5')
on conflict (key) do nothing;
```

- [ ] **Step 2: Add the types**

In `src/lib/supabase/database.types.ts`:
- In `recruit_applicants` `Row`/`Insert` add `application_link: string | null` / `application_link?: string | null`.
- Add next to the other `recruit_*` tables:

```ts
      recruit_rubrics: {
        Row: { id: string; stage: "resume" | "interview"; scale_min: number; scale_max: number; updated_at: string };
        Insert: { id?: string; stage: "resume" | "interview"; scale_min?: number; scale_max?: number; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["recruit_rubrics"]["Insert"]>;
        Relationships: [];
      };
      recruit_rubric_criteria: {
        Row: {
          id: string;
          rubric_id: string;
          name: string;
          description: string;
          weight: number;
          sort_order: number;
          archived_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          rubric_id: string;
          name: string;
          description?: string;
          weight?: number;
          sort_order?: number;
          archived_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["recruit_rubric_criteria"]["Insert"]>;
        Relationships: [];
      };
      recruit_reviews: {
        Row: {
          id: string;
          applicant_id: string;
          stage: "resume" | "interview";
          reviewer_id: string;
          comment: string;
          submitted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          applicant_id: string;
          stage: "resume" | "interview";
          reviewer_id: string;
          comment?: string;
          submitted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["recruit_reviews"]["Insert"]>;
        Relationships: [];
      };
      recruit_review_scores: {
        Row: { id: string; review_id: string; criterion_id: string; score: number };
        Insert: { id?: string; review_id: string; criterion_id: string; score: number };
        Update: Partial<Database["public"]["Tables"]["recruit_review_scores"]["Insert"]>;
        Relationships: [];
      };
```

- [ ] **Step 3: Verify and commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

```bash
git add supabase/migrations/20261009000001_recruitment_scoring.sql src/lib/supabase/database.types.ts
git commit -m "Add recruitment scoring schema"
```

---

### Task 2: Scoring math (pure logic, TDD)

**Files:**
- Create: `src/lib/recruit-scoring.ts`
- Test: `src/lib/recruit-scoring.test.ts`

**Interfaces:**
- Produces (exported from `src/lib/recruit-scoring.ts`):
  - `type Stage = "resume" | "interview"`; `STAGES: { value: Stage; label: string }[]`
  - `interface WeightedCriterion { id: string; weight: number }`
  - `mean(xs: number[]): number`, `populationSd(xs: number[]): number`
  - `reviewScore(scores: { criterionId: string; score: number }[], criteria: WeightedCriterion[]): number | null`
  - `validateScore(score: unknown, scaleMin: number, scaleMax: number): string | null`
  - `interface ReviewInput { id: string; applicantId: string; reviewerId: string; raw: number }`
  - `interface NormalizedReview extends ReviewInput { normalized: number; wasNormalized: boolean }`
  - `normalizeReviews(reviews: ReviewInput[], opts: { minN: number; scaleMin: number; scaleMax: number }): NormalizedReview[]`
  - `interface ReviewerInsight { reviewerId: string; n: number; mean: number; sd: number; normalized: boolean }`
  - `reviewerInsights(reviews: ReviewInput[], minN: number): ReviewerInsight[]`
  - `interface StageSummary { raw: number; normalized: number; count: number; spread: number; anyNormalized: boolean }`
  - `summarizeApplicants(reviews: NormalizedReview[]): Record<string, StageSummary>` (keyed by applicantId)
  - `isDisagreement(summary: { spread: number; count: number }, threshold: number): boolean`
  - `visibleReviews<T extends { reviewerId: string; submitted: boolean }>(viewerId: string, reviews: T[]): T[]`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/recruit-scoring.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  isDisagreement,
  mean,
  normalizeReviews,
  populationSd,
  reviewerInsights,
  reviewScore,
  summarizeApplicants,
  validateScore,
  visibleReviews,
  type ReviewInput,
} from "./recruit-scoring";

describe("mean / populationSd", () => {
  it("computes basics", () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(populationSd([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
  });
  it("handles empty and single values", () => {
    expect(mean([])).toBe(0);
    expect(populationSd([])).toBe(0);
    expect(populationSd([3])).toBe(0);
  });
});

describe("reviewScore", () => {
  const criteria = [
    { id: "a", weight: 1 },
    { id: "b", weight: 3 },
  ];
  it("is the weighted mean of scored criteria", () => {
    expect(
      reviewScore(
        [
          { criterionId: "a", score: 5 },
          { criterionId: "b", score: 1 },
        ],
        criteria,
      ),
    ).toBe(2); // (5*1 + 1*3) / 4
  });
  it("ignores criteria with no score and scores for unknown criteria", () => {
    expect(
      reviewScore(
        [
          { criterionId: "a", score: 4 },
          { criterionId: "zzz", score: 1 },
        ],
        criteria,
      ),
    ).toBe(4);
  });
  it("recalculates when weights change", () => {
    const scores = [
      { criterionId: "a", score: 5 },
      { criterionId: "b", score: 1 },
    ];
    expect(reviewScore(scores, [{ id: "a", weight: 1 }, { id: "b", weight: 1 }])).toBe(3);
  });
  it("uses equal weights when every weight is 0", () => {
    const scores = [
      { criterionId: "a", score: 5 },
      { criterionId: "b", score: 1 },
    ];
    expect(reviewScore(scores, [{ id: "a", weight: 0 }, { id: "b", weight: 0 }])).toBe(3);
  });
  it("is null when nothing is scored", () => {
    expect(reviewScore([], criteria)).toBeNull();
  });
});

describe("validateScore", () => {
  it("accepts numbers inside the scale", () => {
    expect(validateScore(3, 1, 5)).toBeNull();
    expect(validateScore(1, 1, 5)).toBeNull();
    expect(validateScore(5, 1, 5)).toBeNull();
    expect(validateScore(4.5, 1, 5)).toBeNull();
  });
  it("rejects out-of-range, non-numeric and non-finite", () => {
    expect(validateScore(0, 1, 5)).toMatch(/between/i);
    expect(validateScore(6, 1, 5)).toMatch(/between/i);
    expect(validateScore("3", 1, 5)).toMatch(/number/i);
    expect(validateScore(Number.NaN, 1, 5)).toMatch(/number/i);
  });
});

const G = [5, 5, 4, 5, 4, 5, 5, 4]; // generous grader
const H = [3, 2, 3, 3, 2, 3, 2, 3]; // harsh grader
const reviews: ReviewInput[] = [
  ...G.map((raw, i) => ({ id: `g${i}`, applicantId: `a${i}`, reviewerId: "G", raw })),
  ...H.map((raw, i) => ({ id: `h${i}`, applicantId: `a${i}`, reviewerId: "H", raw })),
];
const opts = { minN: 8, scaleMin: 1, scaleMax: 5 };

describe("normalizeReviews", () => {
  const out = normalizeReviews(reviews, opts);
  const byId = new Map(out.map((r) => [r.id, r]));

  it("puts a generous and a harsh grader on the same footing", () => {
    const gMean = mean(out.filter((r) => r.reviewerId === "G").map((r) => r.normalized));
    const hMean = mean(out.filter((r) => r.reviewerId === "H").map((r) => r.normalized));
    expect(gMean).toBeCloseTo(hMean, 9);
  });
  it("maps each reviewer's top score to the same normalized value", () => {
    expect(byId.get("g0")!.normalized).toBeCloseTo(byId.get("h0")!.normalized, 9); // 5 from G, 3 from H
    expect(byId.get("g0")!.normalized).toBeCloseTo(4.486, 2);
  });
  it("flags normalized reviews", () => {
    expect(out.every((r) => r.wasNormalized)).toBe(true);
  });
  it("keeps raw scores when the reviewer has too few reviews", () => {
    const few = normalizeReviews(reviews, { ...opts, minN: 9 });
    expect(few.every((r) => !r.wasNormalized && r.normalized === r.raw)).toBe(true);
  });
  it("keeps raw scores for a reviewer whose scores never vary", () => {
    const flat: ReviewInput[] = [
      ...reviews.filter((r) => r.reviewerId === "G"),
      ...Array.from({ length: 8 }, (_, i) => ({ id: `f${i}`, applicantId: `a${i}`, reviewerId: "F", raw: 3 })),
    ];
    const result = normalizeReviews(flat, opts);
    expect(result.filter((r) => r.reviewerId === "F").every((r) => !r.wasNormalized && r.normalized === 3)).toBe(true);
    expect(result.filter((r) => r.reviewerId === "G").every((r) => r.wasNormalized)).toBe(true);
  });
  it("does not divide by zero when every score in the pool is identical", () => {
    const same = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, applicantId: `a${i}`, reviewerId: "S", raw: 4 }));
    const result = normalizeReviews(same, opts);
    expect(result.every((r) => r.normalized === 4 && !r.wasNormalized)).toBe(true);
  });
  it("clamps to the scale", () => {
    const spread: ReviewInput[] = [
      ...Array.from({ length: 8 }, (_, i) => ({ id: `x${i}`, applicantId: `a${i}`, reviewerId: "X", raw: i === 0 ? 5 : 1 })),
      ...Array.from({ length: 8 }, (_, i) => ({ id: `y${i}`, applicantId: `a${i}`, reviewerId: "Y", raw: 3 + (i % 2) * 0.1 })),
    ];
    const result = normalizeReviews(spread, opts);
    expect(result.every((r) => r.normalized >= 1 && r.normalized <= 5)).toBe(true);
  });
  it("handles an empty list", () => {
    expect(normalizeReviews([], opts)).toEqual([]);
  });
});

describe("reviewerInsights", () => {
  it("reports n, mean, sd and whether the reviewer is normalized", () => {
    const [g, h] = reviewerInsights(reviews, 8).sort((a, b) => a.reviewerId.localeCompare(b.reviewerId));
    expect(g).toMatchObject({ reviewerId: "G", n: 8, normalized: true });
    expect(g.mean).toBeCloseTo(4.625, 9);
    expect(h.mean).toBeCloseTo(2.625, 9);
  });
  it("marks reviewers under the minimum as not normalized", () => {
    expect(reviewerInsights(reviews, 9).every((r) => !r.normalized)).toBe(true);
  });
});

describe("summarizeApplicants", () => {
  const out = normalizeReviews(reviews, opts);
  const summary = summarizeApplicants(out);

  it("averages raw and normalized scores per applicant", () => {
    expect(summary.a0.raw).toBe(4); // (5 + 3) / 2
    expect(summary.a0.normalized).toBeCloseTo(4.486, 2);
    expect(summary.a0.count).toBe(2);
    expect(summary.a0.anyNormalized).toBe(true);
  });
  it("computes raw spread", () => {
    expect(summary.a0.spread).toBe(2);
  });
  it("shows the spread disappearing after normalization is visible via normalized equal scores", () => {
    const [first] = out.filter((r) => r.applicantId === "a0");
    const second = out.filter((r) => r.applicantId === "a0")[1];
    expect(first.normalized).toBeCloseTo(second.normalized, 9);
  });
  it("covers every applicant", () => {
    expect(Object.keys(summary)).toHaveLength(8);
  });
});

describe("isDisagreement", () => {
  it("needs at least two reviews and a spread at or above the threshold", () => {
    expect(isDisagreement({ spread: 2, count: 2 }, 1.5)).toBe(true);
    expect(isDisagreement({ spread: 1.5, count: 2 }, 1.5)).toBe(true);
    expect(isDisagreement({ spread: 1, count: 2 }, 1.5)).toBe(false);
    expect(isDisagreement({ spread: 4, count: 1 }, 1.5)).toBe(false);
  });
});

describe("visibleReviews", () => {
  const mine = { reviewerId: "me", submitted: false };
  const mineSubmitted = { reviewerId: "me", submitted: true };
  const otherSubmitted = { reviewerId: "o1", submitted: true };
  const otherDraft = { reviewerId: "o2", submitted: false };

  it("shows only your own review until you have submitted", () => {
    expect(visibleReviews("me", [mine, otherSubmitted, otherDraft])).toEqual([mine]);
  });
  it("shows others' submitted reviews once you have submitted, never their drafts", () => {
    expect(visibleReviews("me", [mineSubmitted, otherSubmitted, otherDraft])).toEqual([mineSubmitted, otherSubmitted]);
  });
  it("shows nothing when you have no review and others do", () => {
    expect(visibleReviews("me", [otherSubmitted])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/recruit-scoring.test.ts`
Expected: FAIL — cannot resolve `./recruit-scoring`.

- [ ] **Step 3: Implement**

Create `src/lib/recruit-scoring.ts`:

```ts
export type Stage = "resume" | "interview";

export const STAGES: { value: Stage; label: string }[] = [
  { value: "resume", label: "Resume" },
  { value: "interview", label: "Interview" },
];

export interface WeightedCriterion {
  id: string;
  weight: number;
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Population standard deviation. */
export function populationSd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/**
 * Weighted mean of the criteria that have a score. Pass every criterion the review may have scored,
 * archived ones included, so old reviews keep counting. All-zero weights fall back to equal weights.
 */
export function reviewScore(
  scores: { criterionId: string; score: number }[],
  criteria: WeightedCriterion[],
): number | null {
  const weightById = new Map(criteria.map((c) => [c.id, c.weight]));
  const scored = scores.filter((s) => weightById.has(s.criterionId));
  if (scored.length === 0) return null;
  const totalWeight = scored.reduce((sum, s) => sum + (weightById.get(s.criterionId) ?? 0), 0);
  if (totalWeight <= 0) return mean(scored.map((s) => s.score));
  return scored.reduce((sum, s) => sum + s.score * (weightById.get(s.criterionId) ?? 0), 0) / totalWeight;
}

export function validateScore(score: unknown, scaleMin: number, scaleMax: number): string | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return "Scores have to be numbers.";
  if (score < scaleMin || score > scaleMax) return `Scores have to be between ${scaleMin} and ${scaleMax}.`;
  return null;
}

export interface ReviewInput {
  id: string;
  applicantId: string;
  reviewerId: string;
  raw: number;
}

export interface NormalizedReview extends ReviewInput {
  normalized: number;
  wasNormalized: boolean;
}

function statsByReviewer(reviews: ReviewInput[]): Map<string, { n: number; mean: number; sd: number }> {
  const grouped = new Map<string, number[]>();
  for (const r of reviews) grouped.set(r.reviewerId, [...(grouped.get(r.reviewerId) ?? []), r.raw]);
  return new Map([...grouped].map(([id, xs]) => [id, { n: xs.length, mean: mean(xs), sd: populationSd(xs) }]));
}

/**
 * Per-reviewer z-score normalization, mapped back onto the pooled scale so numbers stay readable.
 * Reviewers with too few reviews, or who never vary, keep their raw scores.
 */
export function normalizeReviews(
  reviews: ReviewInput[],
  opts: { minN: number; scaleMin: number; scaleMax: number },
): NormalizedReview[] {
  const stats = statsByReviewer(reviews);
  const pool = reviews.map((r) => r.raw);
  const poolMean = mean(pool);
  const poolSd = populationSd(pool);

  return reviews.map((r) => {
    const s = stats.get(r.reviewerId)!;
    if (s.n >= opts.minN && s.sd > 0 && poolSd > 0) {
      const z = (r.raw - s.mean) / s.sd;
      const adjusted = Math.min(opts.scaleMax, Math.max(opts.scaleMin, poolMean + z * poolSd));
      return { ...r, normalized: adjusted, wasNormalized: true };
    }
    return { ...r, normalized: r.raw, wasNormalized: false };
  });
}

export interface ReviewerInsight {
  reviewerId: string;
  n: number;
  mean: number;
  sd: number;
  normalized: boolean;
}

export function reviewerInsights(reviews: ReviewInput[], minN: number): ReviewerInsight[] {
  const pooled = populationSd(reviews.map((r) => r.raw));
  return [...statsByReviewer(reviews)].map(([reviewerId, s]) => ({
    reviewerId,
    ...s,
    normalized: s.n >= minN && s.sd > 0 && pooled > 0,
  }));
}

export interface StageSummary {
  raw: number;
  normalized: number;
  count: number;
  spread: number;
  anyNormalized: boolean;
}

export function summarizeApplicants(reviews: NormalizedReview[]): Record<string, StageSummary> {
  const grouped = new Map<string, NormalizedReview[]>();
  for (const r of reviews) grouped.set(r.applicantId, [...(grouped.get(r.applicantId) ?? []), r]);
  const out: Record<string, StageSummary> = {};
  for (const [applicantId, rs] of grouped) {
    const raws = rs.map((r) => r.raw);
    out[applicantId] = {
      raw: mean(raws),
      normalized: mean(rs.map((r) => r.normalized)),
      count: rs.length,
      spread: Math.max(...raws) - Math.min(...raws),
      anyNormalized: rs.some((r) => r.wasNormalized),
    };
  }
  return out;
}

export function isDisagreement(summary: { spread: number; count: number }, threshold: number): boolean {
  return summary.count >= 2 && summary.spread >= threshold;
}

/**
 * Blind scoring: you always see your own review; others' submitted reviews only after you have submitted yours.
 * Pass the reviews for ONE applicant + stage.
 */
export function visibleReviews<T extends { reviewerId: string; submitted: boolean }>(viewerId: string, reviews: T[]): T[] {
  const iSubmitted = reviews.some((r) => r.reviewerId === viewerId && r.submitted);
  return reviews.filter((r) => r.reviewerId === viewerId || (iSubmitted && r.submitted));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/recruit-scoring.test.ts`
Expected: all PASS. If the `clamps to the scale` test is flaky in intent (it asserts bounds only), leave it; if `toBeCloseTo(4.486, 2)` fails, recompute with the pooled SD of the fixture (pool mean 3.625, population SD √1.234375) before changing code.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recruit-scoring.ts src/lib/recruit-scoring.test.ts
git commit -m "Add scoring math, normalization and blind-visibility logic"
```

---

### Task 3: Settings parsing (pure logic, TDD)

**Files:**
- Create: `src/lib/recruit-settings.ts`
- Test: `src/lib/recruit-settings.test.ts`

**Interfaces:**
- Produces (exported from `src/lib/recruit-settings.ts`):
  - `interface RecruitSettings { normalizeMinN: number; disagreementThreshold: number }`
  - `DEFAULT_RECRUIT_SETTINGS: RecruitSettings`
  - `RECRUIT_SETTING_KEYS: Record<keyof RecruitSettings, string>`
  - `parseRecruitSettings(rows: { key: string; value: string }[]): RecruitSettings`
  - `validateRecruitSettings(partial: Partial<RecruitSettings>): string | null`

(Piece 4 extends this module with weight / full-marks / cutoff keys.)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/recruit-settings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_RECRUIT_SETTINGS, RECRUIT_SETTING_KEYS, parseRecruitSettings, validateRecruitSettings } from "./recruit-settings";

describe("parseRecruitSettings", () => {
  it("falls back to defaults when nothing is stored", () => {
    expect(parseRecruitSettings([])).toEqual(DEFAULT_RECRUIT_SETTINGS);
  });
  it("reads stored values", () => {
    const rows = [
      { key: RECRUIT_SETTING_KEYS.normalizeMinN, value: "12" },
      { key: RECRUIT_SETTING_KEYS.disagreementThreshold, value: "2" },
    ];
    expect(parseRecruitSettings(rows)).toEqual({ normalizeMinN: 12, disagreementThreshold: 2 });
  });
  it("ignores garbage and out-of-range values", () => {
    const rows = [
      { key: RECRUIT_SETTING_KEYS.normalizeMinN, value: "abc" },
      { key: RECRUIT_SETTING_KEYS.disagreementThreshold, value: "-3" },
    ];
    expect(parseRecruitSettings(rows)).toEqual(DEFAULT_RECRUIT_SETTINGS);
  });
});

describe("validateRecruitSettings", () => {
  it("accepts sensible values", () => {
    expect(validateRecruitSettings({ normalizeMinN: 8, disagreementThreshold: 1.5 })).toBeNull();
  });
  it("requires a whole minimum of at least 2", () => {
    expect(validateRecruitSettings({ normalizeMinN: 1 })).toMatch(/at least 2/i);
    expect(validateRecruitSettings({ normalizeMinN: 3.5 })).toMatch(/whole/i);
  });
  it("requires a positive disagreement threshold", () => {
    expect(validateRecruitSettings({ disagreementThreshold: 0 })).toMatch(/greater than 0/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/recruit-settings.test.ts`
Expected: FAIL — cannot resolve `./recruit-settings`.

- [ ] **Step 3: Implement**

Create `src/lib/recruit-settings.ts`:

```ts
export interface RecruitSettings {
  normalizeMinN: number;
  disagreementThreshold: number;
}

export const DEFAULT_RECRUIT_SETTINGS: RecruitSettings = {
  normalizeMinN: 8,
  disagreementThreshold: 1.5,
};

export const RECRUIT_SETTING_KEYS: Record<keyof RecruitSettings, string> = {
  normalizeMinN: "recruit_normalize_min_n",
  disagreementThreshold: "recruit_disagreement_threshold",
};

/** Errors for the fields present in `partial`; null when everything given is fine. */
export function validateRecruitSettings(partial: Partial<RecruitSettings>): string | null {
  if (partial.normalizeMinN !== undefined) {
    if (!Number.isFinite(partial.normalizeMinN)) return "Enter the minimum number of scores as a number.";
    if (!Number.isInteger(partial.normalizeMinN)) return "The minimum number of scores has to be a whole number.";
    if (partial.normalizeMinN < 2) return "Normalizing needs at least 2 scores per reviewer.";
  }
  if (partial.disagreementThreshold !== undefined) {
    if (!Number.isFinite(partial.disagreementThreshold) || partial.disagreementThreshold <= 0) {
      return "The disagreement threshold has to be greater than 0.";
    }
  }
  return null;
}

export function parseRecruitSettings(rows: { key: string; value: string }[]): RecruitSettings {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const read = (field: keyof RecruitSettings): number => {
    const parsed = Number(byKey.get(RECRUIT_SETTING_KEYS[field]));
    const candidate = { [field]: parsed } as Partial<RecruitSettings>;
    return Number.isFinite(parsed) && validateRecruitSettings(candidate) === null
      ? parsed
      : DEFAULT_RECRUIT_SETTINGS[field];
  };
  return {
    normalizeMinN: read("normalizeMinN"),
    disagreementThreshold: read("disagreementThreshold"),
  };
}
```

- [ ] **Step 4: Run to verify pass and commit**

Run: `npx vitest run src/lib/recruit-settings.test.ts`
Expected: all PASS.

```bash
git add src/lib/recruit-settings.ts src/lib/recruit-settings.test.ts
git commit -m "Add recruitment settings parsing and validation"
```

---

### Task 4: Data layer and Server Actions

**Files:**
- Create: `src/lib/data/recruit-scoring.ts`
- Create: `src/lib/data/recruit-settings.ts`
- Modify: `src/actions/recruit.ts` (append review / rubric / settings actions; extend `updateApplicantAction` with `applicationLink`)
- Modify: `src/lib/data/recruit.ts` (`ApplicantRow.applicationLink`)
- Modify: `src/lib/audit-labels.ts`

**Interfaces:**
- Consumes: Task 2 math, Task 3 settings, piece 1 `fetchAllPages`.
- Produces (data layer, `src/lib/data/recruit-scoring.ts`):
  - `interface CriterionRow { id: string; stage: Stage; name: string; description: string; weight: number; sortOrder: number; archived: boolean }`
  - `interface RubricRow { id: string; stage: Stage; scaleMin: number; scaleMax: number; criteria: CriterionRow[] }`
  - `getRubrics(): Promise<Record<Stage, RubricRow>>`
  - `interface ReviewView { id: string; reviewerId: string; reviewerName: string; submitted: boolean; raw: number | null; normalized: number | null; wasNormalized: boolean; comment: string; scores: Record<string, number>; mine: boolean }`
  - `interface ScoringApplicant { id: string; name: string; email: string | null; applicationLink: string | null; mine: ReviewView | null; others: ReviewView[]; visibleSummary: StageSummary | null; disagree: boolean }`
  - `interface ReviewerInsightRow extends ReviewerInsight { name: string }`
  - `interface StageData { stage: Stage; rubric: RubricRow; applicants: ScoringApplicant[]; reviewers: ReviewerInsightRow[] }`
  - `interface ScoringBundle { stages: Record<Stage, StageData>; summaries: Record<Stage, Record<string, StageSummary>>; settings: RecruitSettings }`
  - `getScoringBundle(quarterId: string, viewerId: string): Promise<ScoringBundle>`
  - `src/lib/data/recruit-settings.ts`: `getRecruitSettings(): Promise<RecruitSettings>`
  - Actions: `saveReviewAction(input: { applicantId: string; stage: Stage; scores: Record<string, number>; comment: string; submit: boolean }): Promise<ActionResult>`; `createCriterionAction(input: { stage: Stage; name: string; description: string; weight: number }): Promise<ActionResult>`; `updateCriterionAction(id: string, input: { name: string; description: string; weight: number }): Promise<ActionResult>`; `setCriterionArchivedAction(id: string, archived: boolean): Promise<ActionResult>`; `reorderCriteriaAction(orderedIds: string[]): Promise<ActionResult>`; `updateRubricScaleAction(stage: Stage, input: { scaleMin: number; scaleMax: number }): Promise<ActionResult>`; `updateRecruitSettingsAction(partial: Partial<RecruitSettings>): Promise<ActionResult>`.
  - `updateApplicantAction`'s input gains `applicationLink?: string`; `ApplicantRow` gains `applicationLink: string | null`.

- [ ] **Step 1: Settings reader**

Create `src/lib/data/recruit-settings.ts`:

```ts
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { RECRUIT_SETTING_KEYS, parseRecruitSettings, type RecruitSettings } from "@/lib/recruit-settings";

export async function getRecruitSettings(): Promise<RecruitSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("org_settings")
    .select("key, value")
    .in("key", Object.values(RECRUIT_SETTING_KEYS));
  if (error) throw error;
  return parseRecruitSettings(data ?? []);
}
```

- [ ] **Step 2: Scoring data layer**

Create `src/lib/data/recruit-scoring.ts`:

```ts
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/paginate";
import { getRecruitSettings } from "@/lib/data/recruit-settings";
import type { RecruitSettings } from "@/lib/recruit-settings";
import {
  isDisagreement,
  normalizeReviews,
  reviewerInsights,
  reviewScore,
  summarizeApplicants,
  visibleReviews,
  type ReviewerInsight,
  type ReviewInput,
  type Stage,
  type StageSummary,
} from "@/lib/recruit-scoring";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface CriterionRow {
  id: string;
  stage: Stage;
  name: string;
  description: string;
  weight: number;
  sortOrder: number;
  archived: boolean;
}

export interface RubricRow {
  id: string;
  stage: Stage;
  scaleMin: number;
  scaleMax: number;
  criteria: CriterionRow[];
}

export async function getRubrics(): Promise<Record<Stage, RubricRow>> {
  const supabase = await createClient();
  const [{ data: rubrics, error }, { data: criteria, error: criteriaError }] = await Promise.all([
    supabase.from("recruit_rubrics").select("*"),
    supabase.from("recruit_rubric_criteria").select("*").order("sort_order").order("created_at"),
  ]);
  if (error) throw error;
  if (criteriaError) throw criteriaError;

  const build = (stage: Stage): RubricRow => {
    const rubric = (rubrics ?? []).find((r) => r.stage === stage);
    if (!rubric) throw new Error(`Missing ${stage} rubric — has the scoring migration been applied?`);
    return {
      id: rubric.id,
      stage,
      scaleMin: Number(rubric.scale_min),
      scaleMax: Number(rubric.scale_max),
      criteria: (criteria ?? [])
        .filter((c) => c.rubric_id === rubric.id)
        .map((c) => ({
          id: c.id,
          stage,
          name: c.name,
          description: c.description,
          weight: Number(c.weight),
          sortOrder: c.sort_order,
          archived: c.archived_at !== null,
        })),
    };
  };
  return { resume: build("resume"), interview: build("interview") };
}

export interface ReviewView {
  id: string;
  reviewerId: string;
  reviewerName: string;
  submitted: boolean;
  raw: number | null;
  normalized: number | null;
  wasNormalized: boolean;
  comment: string;
  scores: Record<string, number>;
  mine: boolean;
}

export interface ScoringApplicant {
  id: string;
  name: string;
  email: string | null;
  applicationLink: string | null;
  mine: ReviewView | null;
  others: ReviewView[];
  /** Aggregate shown only after the viewer has submitted their own review (blind scoring). */
  visibleSummary: StageSummary | null;
  disagree: boolean;
}

export interface ReviewerInsightRow extends ReviewerInsight {
  name: string;
}

export interface StageData {
  stage: Stage;
  rubric: RubricRow;
  applicants: ScoringApplicant[];
  reviewers: ReviewerInsightRow[];
}

export interface ScoringBundle {
  stages: Record<Stage, StageData>;
  /** Un-blinded aggregates for the decision view and the side panel. */
  summaries: Record<Stage, Record<string, StageSummary>>;
  settings: RecruitSettings;
}

const CHUNK = 100;

async function chunked<T, R>(ids: string[], load: (chunk: string[]) => Promise<R[]>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await load(ids.slice(i, i + CHUNK))));
  return out;
}

async function profileNames(supabase: Supabase, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from("profiles").select("id, name").in("id", ids);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id, p.name]));
}

export async function getScoringBundle(quarterId: string, viewerId: string): Promise<ScoringBundle> {
  const supabase = await createClient();
  const [rubrics, settings, applicants, links] = await Promise.all([
    getRubrics(),
    getRecruitSettings(),
    fetchAllPages((from, to) =>
      supabase
        .from("recruit_applicants")
        .select("id, name, email, application_link")
        .eq("quarter_id", quarterId)
        .is("archived_at", null)
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("recruit_booking_links")
        .select("applicant_id")
        .eq("booking_kind", "interview")
        .eq("status", "attended")
        .order("id")
        .range(from, to),
    ),
  ]);

  const applicantIds = applicants.map((a) => a.id);
  const interviewed = new Set(links.map((l) => l.applicant_id));

  const reviews = await chunked(applicantIds, (chunk) =>
    fetchAllPages((from, to) =>
      supabase.from("recruit_reviews").select("*").in("applicant_id", chunk).order("id").range(from, to),
    ),
  );
  const scoreRows = await chunked(
    reviews.map((r) => r.id),
    (chunk) =>
      fetchAllPages((from, to) =>
        supabase.from("recruit_review_scores").select("*").in("review_id", chunk).order("id").range(from, to),
      ),
  );
  const names = await profileNames(supabase, [...new Set(reviews.map((r) => r.reviewer_id))]);

  const scoresByReview = new Map<string, { criterionId: string; score: number }[]>();
  for (const s of scoreRows) {
    scoresByReview.set(s.review_id, [
      ...(scoresByReview.get(s.review_id) ?? []),
      { criterionId: s.criterion_id, score: Number(s.score) },
    ]);
  }

  const build = (stage: Stage): { data: StageData; summary: Record<string, StageSummary> } => {
    const rubric = rubrics[stage];
    const weighted = rubric.criteria.map((c) => ({ id: c.id, weight: c.weight }));
    const stageReviews = reviews.filter((r) => r.stage === stage);

    const rawById = new Map<string, number | null>(
      stageReviews.map((r) => [r.id, reviewScore(scoresByReview.get(r.id) ?? [], weighted)]),
    );
    const submittedInputs: ReviewInput[] = stageReviews
      .filter((r) => r.submitted_at !== null && rawById.get(r.id) !== null)
      .map((r) => ({ id: r.id, applicantId: r.applicant_id, reviewerId: r.reviewer_id, raw: rawById.get(r.id)! }));

    const normalized = normalizeReviews(submittedInputs, {
      minN: settings.normalizeMinN,
      scaleMin: rubric.scaleMin,
      scaleMax: rubric.scaleMax,
    });
    const normById = new Map(normalized.map((n) => [n.id, n]));
    const summary = summarizeApplicants(normalized);

    const toView = (r: (typeof stageReviews)[number]): ReviewView => {
      const n = normById.get(r.id);
      return {
        id: r.id,
        reviewerId: r.reviewer_id,
        reviewerName: names.get(r.reviewer_id) ?? "Unknown",
        submitted: r.submitted_at !== null,
        raw: rawById.get(r.id) ?? null,
        normalized: n?.normalized ?? null,
        wasNormalized: n?.wasNormalized ?? false,
        comment: r.comment,
        scores: Object.fromEntries((scoresByReview.get(r.id) ?? []).map((s) => [s.criterionId, s.score])),
        mine: r.reviewer_id === viewerId,
      };
    };

    const eligible = stage === "interview" ? applicants.filter((a) => interviewed.has(a.id)) : applicants;

    const rows: ScoringApplicant[] = eligible.map((a) => {
      const views = stageReviews.filter((r) => r.applicant_id === a.id).map(toView);
      const visible = visibleReviews(viewerId, views);
      const iSubmitted = views.some((v) => v.mine && v.submitted);
      const aggregate = summary[a.id] ?? null;
      return {
        id: a.id,
        name: a.name,
        email: a.email,
        applicationLink: a.application_link,
        mine: visible.find((v) => v.mine) ?? null,
        others: visible.filter((v) => !v.mine),
        visibleSummary: iSubmitted ? aggregate : null,
        disagree: iSubmitted && aggregate ? isDisagreement(aggregate, settings.disagreementThreshold) : false,
      };
    });

    const reviewers = reviewerInsights(submittedInputs, settings.normalizeMinN).map((i) => ({
      ...i,
      name: names.get(i.reviewerId) ?? "Unknown",
    }));

    return { data: { stage, rubric, applicants: rows, reviewers }, summary };
  };

  const resume = build("resume");
  const interview = build("interview");
  return {
    stages: { resume: resume.data, interview: interview.data },
    summaries: { resume: resume.summary, interview: interview.summary },
    settings,
  };
}
```

- [ ] **Step 3: Applicant link plumbing**

In `src/lib/data/recruit.ts` add `applicationLink: string | null;` to `ApplicantRow` and `applicationLink: a.application_link,` in `getApplicantRows`' mapping.

In `src/actions/recruit.ts`'s `updateApplicantAction`, add `applicationLink?: string` to the input type; after the email check add:

```ts
  const applicationLink = cleanText(input.applicationLink);
  if (applicationLink && !/^https?:\/\//i.test(applicationLink)) {
    return { error: "The application link should start with http:// or https://." };
  }
```

and include `application_link: applicationLink` in the `.update({...})` object.

- [ ] **Step 4: Actions**

Append to `src/actions/recruit.ts` (add imports `validateScore` and `type Stage` from `@/lib/recruit-scoring`, `validateRecruitSettings`, `RECRUIT_SETTING_KEYS`, `type RecruitSettings` from `@/lib/recruit-settings`):

```ts
const STAGE_VALUES: Stage[] = ["resume", "interview"];

export async function saveReviewAction(input: {
  applicantId: string;
  stage: Stage;
  scores: Record<string, number>;
  comment: string;
  submit: boolean;
}): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  if (!STAGE_VALUES.includes(input.stage)) return { error: "Unknown stage." };

  const supabase = await createClient();
  const { data: applicant, error: applicantError } = await supabase
    .from("recruit_applicants")
    .select("id, archived_at")
    .eq("id", input.applicantId)
    .maybeSingle();
  if (applicantError) return { error: applicantError.message };
  if (!applicant || applicant.archived_at) {
    return { error: "That applicant was merged or removed — refresh the page." };
  }

  if (input.stage === "interview") {
    const { count, error: linkError } = await supabase
      .from("recruit_booking_links")
      .select("id", { count: "exact", head: true })
      .eq("booking_kind", "interview")
      .eq("status", "attended")
      .eq("applicant_id", input.applicantId);
    if (linkError) return { error: linkError.message };
    if ((count ?? 0) === 0) return { error: "Only applicants marked as having attended their interview can be scored." };
  }

  const { data: rubric, error: rubricError } = await supabase
    .from("recruit_rubrics")
    .select("id, scale_min, scale_max")
    .eq("stage", input.stage)
    .maybeSingle();
  if (rubricError) return { error: rubricError.message };
  if (!rubric) return { error: "The rubric for this stage is missing." };

  const { data: criteria, error: criteriaError } = await supabase
    .from("recruit_rubric_criteria")
    .select("id, archived_at")
    .eq("rubric_id", rubric.id);
  if (criteriaError) return { error: criteriaError.message };
  const active = new Set((criteria ?? []).filter((c) => !c.archived_at).map((c) => c.id));

  const entries = Object.entries(input.scores);
  for (const [criterionId, score] of entries) {
    if (!active.has(criterionId)) return { error: "One of those criteria was archived or removed — refresh the page." };
    const problem = validateScore(score, Number(rubric.scale_min), Number(rubric.scale_max));
    if (problem) return { error: problem };
  }
  if (input.submit && entries.length < active.size) {
    return { error: "Score every criterion before submitting, or save a draft." };
  }

  const { data: review, error: reviewError } = await supabase
    .from("recruit_reviews")
    .upsert(
      {
        applicant_id: input.applicantId,
        stage: input.stage,
        reviewer_id: profile.id,
        comment: input.comment,
        ...(input.submit ? { submitted_at: new Date().toISOString() } : {}),
      },
      { onConflict: "applicant_id,stage,reviewer_id" },
    )
    .select("id")
    .single();
  if (reviewError) return { error: reviewError.message };

  if (entries.length > 0) {
    const { error: scoreError } = await supabase.from("recruit_review_scores").upsert(
      entries.map(([criterionId, score]) => ({ review_id: review.id, criterion_id: criterionId, score })),
      { onConflict: "review_id,criterion_id" },
    );
    if (scoreError) return { error: scoreError.message };
  }

  revalidateAll();
  return {};
}

function validateCriterionInput(input: { name: string; weight: number }): string | null {
  if (!input.name.trim()) return "Give the criterion a name.";
  if (!Number.isFinite(input.weight) || input.weight < 0) return "The weight has to be 0 or more.";
  return null;
}

export async function createCriterionAction(input: {
  stage: Stage;
  name: string;
  description: string;
  weight: number;
}): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };
  const problem = validateCriterionInput(input);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { data: rubric } = await supabase.from("recruit_rubrics").select("id").eq("stage", input.stage).maybeSingle();
  if (!rubric) return { error: "The rubric for this stage is missing." };
  const { data: last } = await supabase
    .from("recruit_rubric_criteria")
    .select("sort_order")
    .eq("rubric_id", rubric.id)
    .order("sort_order", { ascending: false })
    .limit(1);

  const { error: insertError } = await supabase.from("recruit_rubric_criteria").insert({
    rubric_id: rubric.id,
    name: input.name.trim(),
    description: input.description.trim(),
    weight: input.weight,
    sort_order: (last?.[0]?.sort_order ?? 0) + 10,
  });
  if (insertError) return { error: insertError.message };
  revalidateAll();
  return {};
}

export async function updateCriterionAction(
  id: string,
  input: { name: string; description: string; weight: number },
): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };
  const problem = validateCriterionInput(input);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("recruit_rubric_criteria")
    .update({ name: input.name.trim(), description: input.description.trim(), weight: input.weight })
    .eq("id", id);
  if (updateError) return { error: updateError.message };
  revalidateAll();
  return {};
}

export async function setCriterionArchivedAction(id: string, archived: boolean): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("recruit_rubric_criteria")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  if (updateError) return { error: updateError.message };
  revalidateAll();
  return {};
}

export async function reorderCriteriaAction(orderedIds: string[]): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  for (const [index, id] of orderedIds.entries()) {
    const { error: updateError } = await supabase
      .from("recruit_rubric_criteria")
      .update({ sort_order: (index + 1) * 10 })
      .eq("id", id);
    if (updateError) return { error: updateError.message };
  }
  revalidateAll();
  return {};
}

export async function updateRubricScaleAction(
  stage: Stage,
  input: { scaleMin: number; scaleMax: number },
): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  if (!Number.isFinite(input.scaleMin) || !Number.isFinite(input.scaleMax)) return { error: "Enter the scale as numbers." };
  if (input.scaleMax <= input.scaleMin) return { error: "The top of the scale has to be higher than the bottom." };
  if (input.scaleMax - input.scaleMin > 20) return { error: "Keep the scale to 20 steps or fewer." };

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("recruit_rubrics")
    .update({ scale_min: input.scaleMin, scale_max: input.scaleMax })
    .eq("stage", stage);
  if (updateError) return { error: updateError.message };

  await logAudit(profile.id, "recruit.rubric_scale_changed", stage, `${input.scaleMin}–${input.scaleMax}`);
  revalidateAll();
  return {};
}

export async function updateRecruitSettingsAction(partial: Partial<RecruitSettings>): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  const problem = validateRecruitSettings(partial);
  if (problem) return { error: problem };

  const rows = (Object.keys(partial) as (keyof RecruitSettings)[])
    .filter((k) => partial[k] !== undefined)
    .map((k) => ({ key: RECRUIT_SETTING_KEYS[k], value: String(partial[k]) }));
  if (rows.length === 0) return {};

  const supabase = await createClient();
  const { error: upsertError } = await supabase.from("org_settings").upsert(rows, { onConflict: "key" });
  if (upsertError) return { error: upsertError.message };

  await logAudit(profile.id, "recruit.settings_changed", null, rows.map((r) => `${r.key}=${r.value}`).join(", "));
  revalidateAll();
  return {};
}
```

  Add labels in `src/lib/audit-labels.ts`: `"recruit.rubric_scale_changed": "Changed a rubric scale"`, `"recruit.settings_changed": "Changed recruitment scoring settings"`.

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all pass. (If the typed Supabase client rejects `onConflict` with `ignoreDuplicates`-style options or the upsert payload shapes, adjust to the installed `@supabase/supabase-js` types rather than loosening them.)

```bash
git add src/lib/data/recruit-scoring.ts src/lib/data/recruit-settings.ts src/lib/data/recruit.ts src/actions/recruit.ts src/lib/audit-labels.ts
git commit -m "Add scoring data layer, review and rubric actions"
```

---

### Task 5: Setup — rubric editor and scoring settings

**Files:**
- Create: `src/app/portal/(app)/admin/applicants/rubric-editor.tsx`
- Modify: `src/app/portal/(app)/admin/applicants/setup-view.tsx` (render the editor and settings card)

**Interfaces:**
- Consumes: Task 4 actions and `RubricRow`, `CriterionRow`; Task 3 `RecruitSettings`.
- Produces: `RubricEditor` props `{ rubric: RubricRow }`; `ScoringSettingsCard` props `{ settings: RecruitSettings }`; `SetupView` gains props `rubrics: Record<Stage, RubricRow>` and `settings: RecruitSettings`.

- [ ] **Step 1: Rubric editor and settings card**

Create `src/app/portal/(app)/admin/applicants/rubric-editor.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import {
  createCriterionAction,
  reorderCriteriaAction,
  setCriterionArchivedAction,
  updateCriterionAction,
  updateRecruitSettingsAction,
  updateRubricScaleAction,
} from "@/actions/recruit";
import type { CriterionRow, RubricRow } from "@/lib/data/recruit-scoring";
import type { RecruitSettings } from "@/lib/recruit-settings";
import { STAGES } from "@/lib/recruit-scoring";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";

function CriterionDialog({ rubric, criterion, trigger }: { rubric: RubricRow; criterion?: CriterionRow; trigger: React.ReactElement }) {
  const isEdit = !!criterion;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(criterion?.name ?? "");
  const [description, setDescription] = useState(criterion?.description ?? "");
  const [weight, setWeight] = useState(String(criterion?.weight ?? 1));
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    startTransition(async () => {
      const input = { name, description, weight: Number(weight) };
      const result = isEdit
        ? await updateCriterionAction(criterion.id, input)
        : await createCriterionAction({ stage: rubric.stage, ...input });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(isEdit ? "Criterion updated — scores recalculated." : "Criterion added.");
      setOpen(false);
      if (!isEdit) {
        setName("");
        setDescription("");
        setWeight("1");
      }
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit criterion" : "New criterion"}</DialogTitle>
          <DialogDescription>
            What reviewers rate. Changing the weight recalculates every score right away; past ratings are kept.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="criterion-name">Name</FieldLabel>
            <Input id="criterion-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Problem solving" />
          </Field>
          <Field>
            <FieldLabel htmlFor="criterion-description">What a low and high score look like</FieldLabel>
            <Textarea
              id="criterion-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={`${rubric.scaleMin} = …, ${rubric.scaleMax} = …`}
            />
            <FieldDescription>Shown to reviewers under the criterion so everyone grades the same way.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="criterion-weight">Weight</FieldLabel>
            <Input id="criterion-weight" type="number" min="0" step="0.5" value={weight} onChange={(e) => setWeight(e.target.value)} />
            <FieldDescription>Relative importance. A weight of 2 counts twice as much as 1.</FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button disabled={isPending || !name.trim() || weight.trim() === ""} onClick={submit}>
            {isEdit ? "Save" : "Add criterion"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RubricEditor({ rubric }: { rubric: RubricRow }) {
  const [isPending, startTransition] = useTransition();
  const [min, setMin] = useState(String(rubric.scaleMin));
  const [max, setMax] = useState(String(rubric.scaleMax));
  const router = useRouter();
  const label = STAGES.find((s) => s.value === rubric.stage)?.label ?? rubric.stage;
  const active = rubric.criteria.filter((c) => !c.archived);
  const archived = rubric.criteria.filter((c) => c.archived);
  const scaleChanged = Number(min) !== rubric.scaleMin || Number(max) !== rubric.scaleMax;

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
    run(() => reorderCriteriaAction(ids));
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">{label} rubric</CardTitle>
          <CardDescription>What reviewers rate for the {label.toLowerCase()} stage. Any exec can change it at any time.</CardDescription>
        </div>
        <CriterionDialog
          rubric={rubric}
          trigger={
            <Button size="sm">
              <Plus />
              New criterion
            </Button>
          }
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y rounded-lg border">
          {active.map((c, i) => (
            <li key={c.id} className="flex items-start gap-2 p-2.5 text-sm">
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
                {c.description && <div className="text-xs text-muted-foreground">{c.description}</div>}
              </div>
              <Badge variant="secondary">weight {c.weight}</Badge>
              <CriterionDialog
                rubric={rubric}
                criterion={c}
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
                onClick={() => run(() => setCriterionArchivedAction(c.id, true), `${c.name} archived — old scores still count.`)}
              >
                <Archive />
              </Button>
            </li>
          ))}
          {active.length === 0 && <li className="p-3 text-sm text-muted-foreground">No criteria yet. Add the first one so reviewers have something to score.</li>}
        </ul>

        {archived.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Archived</h4>
            <ul className="divide-y rounded-lg border">
              {archived.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 p-2.5 text-sm text-muted-foreground">
                  <span>{c.name}</span>
                  <Button size="sm" variant="ghost" disabled={isPending} onClick={() => run(() => setCriterionArchivedAction(c.id, false), `${c.name} restored.`)}>
                    <ArchiveRestore />
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2 rounded-lg border p-3">
          <h4 className="text-sm font-medium">Scale</h4>
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label="Lowest score" className="w-20" type="number" value={min} onChange={(e) => setMin(e.target.value)} />
            <span className="text-sm text-muted-foreground">to</span>
            <Input aria-label="Highest score" className="w-20" type="number" value={max} onChange={(e) => setMax(e.target.value)} />
            <Button
              size="sm"
              variant="outline"
              disabled={isPending || !scaleChanged}
              onClick={() => run(() => updateRubricScaleAction(rubric.stage, { scaleMin: Number(min), scaleMax: Number(max) }), "Scale updated.")}
            >
              Save scale
            </Button>
          </div>
          {scaleChanged && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Heads up: scores already given are kept as they are and will be read on the new scale.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ScoringSettingsCard({ settings }: { settings: RecruitSettings }) {
  const [isPending, startTransition] = useTransition();
  const [minN, setMinN] = useState(String(settings.normalizeMinN));
  const [threshold, setThreshold] = useState(String(settings.disagreementThreshold));
  const router = useRouter();
  const dirty = Number(minN) !== settings.normalizeMinN || Number(threshold) !== settings.disagreementThreshold;

  function save() {
    startTransition(async () => {
      const result = await updateRecruitSettingsAction({ normalizeMinN: Number(minN), disagreementThreshold: Number(threshold) });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Scoring settings saved.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Scoring settings</CardTitle>
        <CardDescription>How scores from different reviewers are combined.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="normalize-min">Scores a reviewer needs before they&apos;re evened out</FieldLabel>
            <Input id="normalize-min" type="number" min="2" step="1" className="w-28" value={minN} onChange={(e) => setMinN(e.target.value)} />
            <FieldDescription>
              Some reviewers grade everyone high and others low. Once someone has given this many scores, their scores are adjusted
              to the group&apos;s typical range. Below it, their raw scores are used. Raw and adjusted are always both shown.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="disagreement">Flag reviewers who differ by at least</FieldLabel>
            <Input id="disagreement" type="number" min="0" step="0.5" className="w-28" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            <FieldDescription>When two reviewers&apos; raw scores for the same applicant are this far apart, the applicant gets a &ldquo;reviewers disagree&rdquo; flag.</FieldDescription>
          </Field>
        </FieldGroup>
        <Button size="sm" disabled={isPending || !dirty} onClick={save}>
          Save settings
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Mount in Setup**

In `setup-view.tsx`: add props `rubrics: Record<Stage, RubricRow>` and `settings: RecruitSettings`; after the existing two-card grid render:

```tsx
      <RubricEditor rubric={rubrics.resume} />
      <RubricEditor rubric={rubrics.interview} />
      <ScoringSettingsCard settings={settings} />
```

(inside the same grid container so they flow in the two columns). Import `RubricEditor`, `ScoringSettingsCard`, and the types. Update `applicants-workspace.tsx` to accept `rubrics` and `settings` props and pass them to `SetupView`; update `page.tsx` to load them in Task 7.

- [ ] **Step 3: Verify and commit**

Run: `npx tsc --noEmit && npm run lint` — expected to fail only on the not-yet-passed workspace props; temporarily make `rubrics`/`settings` required in `SetupView` only after Task 7 wires them, or wire `page.tsx` now (preferred): in `page.tsx` add `getRubrics()` and `getRecruitSettings()` to the `Promise.all` and pass `rubrics`/`settings` to `ApplicantsWorkspace`.
Expected after wiring: all pass.

```bash
git add "src/app/portal/(app)/admin/applicants"
git commit -m "Add rubric editor and scoring settings to Setup"
```

---

### Task 6: Scoring tab

**Files:**
- Create: `src/app/portal/(app)/admin/applicants/scoring-view.tsx`
- Create: `src/app/portal/(app)/admin/applicants/score-form.tsx`
- Create: `src/app/portal/(app)/admin/applicants/reviewer-insights.tsx`
- Modify: `src/app/portal/(app)/admin/applicants/applicants-workspace.tsx` (Scoring tab)
- Modify: `src/app/portal/(app)/admin/applicants/page.tsx` (load the bundle)

**Interfaces:**
- Consumes: Task 4 `getScoringBundle`, `ScoringBundle`, `StageData`, `ScoringApplicant`, `saveReviewAction`.
- Produces: `ScoringView` props `{ stages: Record<Stage, StageData>; settings: RecruitSettings }`; `ScoreForm` props `{ stage: Stage; rubric: RubricRow; applicant: ScoringApplicant; onSubmitted: () => void }`; `ReviewerInsights` props `{ reviewers: ReviewerInsightRow[]; minN: number }`; `ApplicantsWorkspace` gains `scoring: ScoringBundle`.

- [ ] **Step 1: Reviewer insights**

Create `src/app/portal/(app)/admin/applicants/reviewer-insights.tsx`:

```tsx
import type { ReviewerInsightRow } from "@/lib/data/recruit-scoring";
import { Badge } from "@/components/ui/badge";

export function ReviewerInsights({ reviewers, minN }: { reviewers: ReviewerInsightRow[]; minN: number }) {
  if (reviewers.length === 0) {
    return <p className="text-sm text-muted-foreground">No submitted scores yet. Reviewer stats show up once people start scoring.</p>;
  }
  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-lg border">
        {reviewers.map((r) => (
          <li key={r.reviewerId} className="flex flex-wrap items-center justify-between gap-2 p-2.5 text-sm">
            <span className="font-medium">{r.name}</span>
            <span className="text-xs text-muted-foreground">
              {r.n} scored · average {r.mean.toFixed(2)} · spread {r.sd.toFixed(2)}
            </span>
            {r.normalized ? (
              <Badge variant="secondary">evened out</Badge>
            ) : (
              <Badge variant="outline">{r.sd === 0 ? "always the same score" : `needs ${Math.max(0, minN - r.n)} more`}</Badge>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        &ldquo;Average&rdquo; shows who grades harsh or generous. Once someone has {minN} scores their ratings are adjusted so a
        tough grader&apos;s 3 and an easy grader&apos;s 4.5 can mean the same thing.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Score form (with keyboard entry and draft autosave)**

Create `src/app/portal/(app)/admin/applicants/score-form.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { saveReviewAction } from "@/actions/recruit";
import type { RubricRow, ScoringApplicant } from "@/lib/data/recruit-scoring";
import type { Stage } from "@/lib/recruit-scoring";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** Remounted per applicant (key) so drafts reset without effects. */
export function ScoreForm({
  stage,
  rubric,
  applicant,
  onSubmitted,
}: {
  stage: Stage;
  rubric: RubricRow;
  applicant: ScoringApplicant;
  onSubmitted: () => void;
}) {
  const criteria = rubric.criteria.filter((c) => !c.archived);
  const [scores, setScores] = useState<Record<string, number>>(applicant.mine?.scores ?? {});
  const [comment, setComment] = useState(applicant.mine?.comment ?? "");
  const [active, setActive] = useState(0);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const firstRender = useRef(true);
  const options = Array.from({ length: Math.floor(rubric.scaleMax - rubric.scaleMin) + 1 }, (_, i) => rubric.scaleMin + i);
  const complete = criteria.length > 0 && criteria.every((c) => scores[c.id] !== undefined);
  const alreadySubmitted = !!applicant.mine?.submitted;

  // Debounced draft autosave; skipped for the initial render and for already-submitted reviews.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (alreadySubmitted) return;
    const timer = setTimeout(async () => {
      setSaved("saving");
      const result = await saveReviewAction({ applicantId: applicant.id, stage, scores, comment, submit: false });
      setSaved(result.error ? "idle" : "saved");
    }, 1200);
    return () => clearTimeout(timer);
  }, [scores, comment, alreadySubmitted, applicant.id, stage]);

  function setScore(criterionId: string, value: number) {
    setScores((prev) => ({ ...prev, [criterionId]: value }));
    setSaved("idle");
  }

  function submit() {
    startTransition(async () => {
      const result = await saveReviewAction({ applicantId: applicant.id, stage, scores, comment, submit: true });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${alreadySubmitted ? "Updated" : "Submitted"} your score for ${applicant.name}.`);
      router.refresh();
      onSubmitted();
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
    const digit = Number(e.key);
    if (Number.isInteger(digit) && options.includes(digit) && criteria[active]) {
      setScore(criteria[active].id, digit);
      setActive((a) => Math.min(a + 1, criteria.length - 1));
      e.preventDefault();
    } else if (e.key === "Enter" && complete && !isPending) {
      submit();
      e.preventDefault();
    }
  }

  return (
    <div className="space-y-4 outline-none" tabIndex={0} onKeyDown={onKeyDown} aria-label={`Score ${applicant.name}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{applicant.name}</h3>
        {applicant.applicationLink && (
          <a
            href={applicant.applicationLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
          >
            Open application <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>
      {!applicant.applicationLink && stage === "resume" && (
        <p className="text-xs text-muted-foreground">No application link yet — add one from the applicant&apos;s profile.</p>
      )}
      <p className="text-xs text-muted-foreground">
        Tip: click this form, then press {options[0]}–{options[options.length - 1]} to score each criterion in turn, and Enter to submit.
      </p>

      {criteria.length === 0 ? (
        <p className="text-sm text-muted-foreground">This rubric has no active criteria. Add some in the Setup tab.</p>
      ) : (
        <ul className="space-y-3">
          {criteria.map((c, i) => (
            <li key={c.id} className={`rounded-lg border p-3 ${i === active ? "border-foreground" : ""}`} onClick={() => setActive(i)}>
              <div className="font-medium">{c.name}</div>
              {c.description && <div className="mb-2 text-xs text-muted-foreground">{c.description}</div>}
              <div className="flex flex-wrap gap-1.5">
                {options.map((o) => (
                  <Button
                    key={o}
                    type="button"
                    size="sm"
                    variant={scores[c.id] === o ? "default" : "outline"}
                    aria-pressed={scores[c.id] === o}
                    onClick={() => setScore(c.id, o)}
                  >
                    {o}
                  </Button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Textarea
        aria-label="Comment"
        placeholder="Anything the group should know (optional)"
        rows={3}
        value={comment}
        onChange={(e) => {
          setComment(e.target.value);
          setSaved("idle");
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {alreadySubmitted ? "Submitted — you can still change it." : saved === "saving" ? "Saving draft…" : saved === "saved" ? "Draft saved" : ""}
        </span>
        <Button disabled={isPending || !complete} onClick={submit}>
          {alreadySubmitted ? "Update score" : "Submit & next"}
        </Button>
      </div>
      {!complete && criteria.length > 0 && <p className="text-xs text-muted-foreground">Score every criterion to submit.</p>}
    </div>
  );
}
```

- [ ] **Step 3: Scoring view (stage switcher, queue, others' scores, insights)**

Create `src/app/portal/(app)/admin/applicants/scoring-view.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { ScoringApplicant, StageData } from "@/lib/data/recruit-scoring";
import type { RecruitSettings } from "@/lib/recruit-settings";
import { STAGES, type Stage } from "@/lib/recruit-scoring";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReviewerInsights } from "./reviewer-insights";
import { ScoreForm } from "./score-form";

const fmt = (n: number | null) => (n === null ? "–" : n.toFixed(2));

function OthersPanel({ applicant, disagreeing }: { applicant: ScoringApplicant; disagreeing: boolean }) {
  if (!applicant.mine?.submitted) {
    return <p className="text-xs text-muted-foreground">Other reviewers&apos; scores are hidden until you submit yours.</p>;
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">All reviewers</span>
        {applicant.visibleSummary && (
          <span className="text-muted-foreground">
            raw {fmt(applicant.visibleSummary.raw)} · adjusted {fmt(applicant.visibleSummary.normalized)} · {applicant.visibleSummary.count} review
            {applicant.visibleSummary.count === 1 ? "" : "s"}
          </span>
        )}
        {disagreeing && <Badge variant="destructive">reviewers disagree</Badge>}
      </div>
      {applicant.others.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nobody else has submitted yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {applicant.others.map((o) => (
            <li key={o.id} className="space-y-0.5 p-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span>{o.reviewerName}</span>
                <span className="tabular-nums">
                  {fmt(o.raw)}
                  {o.wasNormalized && <span className="text-xs text-muted-foreground"> → {fmt(o.normalized)}</span>}
                </span>
              </div>
              {o.comment && <p className="text-xs text-muted-foreground">&ldquo;{o.comment}&rdquo;</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StagePanel({ data, settings }: { data: StageData; settings: RecruitSettings }) {
  const [filter, setFilter] = useState<"todo" | "all">("todo");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const scored = (a: ScoringApplicant) => !!a.mine?.submitted;
  const todo = data.applicants.filter((a) => !scored(a));
  const list = filter === "todo" ? todo : data.applicants;
  const selected = data.applicants.find((a) => a.id === selectedId) ?? todo[0] ?? data.applicants[0] ?? null;

  function next() {
    const after = data.applicants.filter((a) => !scored(a) && a.id !== selected?.id);
    setSelectedId(after[0]?.id ?? null);
  }

  if (data.applicants.length === 0) {
    return (
      <Card className="mt-4">
        <CardContent className="py-10 text-center">
          <p className="font-medium">
            {data.stage === "interview" ? "No one to interview-score yet" : "No applicants to score yet"}
          </p>
          <p className="text-sm text-muted-foreground">
            {data.stage === "interview"
              ? "Applicants show up here once you mark their interview as attended in the Attendance tab."
              : "Add applicants or import a list first."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const mineCount = data.applicants.length - todo.length;

  return (
    <div className="mt-4 grid items-start gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="text-sm">
          <b>{mineCount}</b> of {data.applicants.length} scored by you
        </div>
        <div className="flex gap-1.5 text-xs">
          {(["todo", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 ${filter === f ? "bg-foreground text-background" : "bg-muted"}`}
            >
              {f === "todo" ? `To score (${todo.length})` : "Everyone"}
            </button>
          ))}
        </div>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">You&apos;ve scored everyone. Nice work!</p>
        ) : (
          <ul className="max-h-[28rem] divide-y overflow-y-auto rounded-xl border">
            {list.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 ${
                    selected?.id === a.id ? "bg-muted" : ""
                  }`}
                >
                  <span className="truncate">{a.name}</span>
                  {scored(a) ? <Badge variant="secondary">scored</Badge> : a.mine ? <Badge variant="outline">draft</Badge> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="pt-2">
          <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Reviewers</h4>
          <ReviewerInsights reviewers={data.reviewers} minN={settings.normalizeMinN} />
        </div>
      </div>

      <div className="space-y-5">
        {selected ? (
          <>
            <ScoreForm key={`${data.stage}:${selected.id}`} stage={data.stage} rubric={data.rubric} applicant={selected} onSubmitted={next} />
            <OthersPanel applicant={selected} disagreeing={selected.disagree} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Pick an applicant to start scoring.</p>
        )}
      </div>
    </div>
  );
}

export function ScoringView({ stages, settings }: { stages: Record<Stage, StageData>; settings: RecruitSettings }) {
  const [stage, setStage] = useState<Stage>("resume");
  return (
    <div className="mt-4">
      <Tabs value={stage} onValueChange={(v) => v && setStage(v as Stage)}>
        <TabsList>
          {STAGES.map((s) => (
            <TabsTrigger key={s.value} value={s.value}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {/* Keyed by stage so each stage keeps its own selection and filter. */}
      <StagePanel key={stage} data={stages[stage]} settings={settings} />
    </div>
  );
}
```

- [ ] **Step 4: Wire the tab and the page**

`page.tsx`: import `getScoringBundle` and `getCurrentProfile` (`@/lib/data/profile`); add `getScoringBundle(quarterId, profile.id)` to the `Promise.all` (get the profile first or inside via `await getCurrentProfile()` before the `Promise.all`); pass `scoring={scoring}` to `ApplicantsWorkspace`. (`rubrics`/`settings` for Setup can now come from `scoring.stages` / `scoring.settings` — replace the Task 5 temporary loads with `rubrics={{ resume: scoring.stages.resume.rubric, interview: scoring.stages.interview.rubric }}` and `settings={scoring.settings}` to avoid duplicate queries.)

`applicants-workspace.tsx`: add `scoring: ScoringBundle` to props; add `<TabsTrigger value="scoring">Scoring</TabsTrigger>` after Attendance and `<TabsContent value="scoring"><ScoringView stages={scoring.stages} settings={scoring.settings} /></TabsContent>`; pass `scoring.stages`-derived rubrics and `scoring.settings` to `SetupView`.

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all pass.

Manual (after the user applies the migration): as two different execs, score the same applicant (second exec sees "hidden until you submit", then sees the first's score and the spread); submit with a criterion missing → button disabled; digit keys score criteria in order; archive a criterion → disappears from new reviews but a submitted review's score is unchanged; with ≥ 8 scores from a generous and a harsh reviewer, the reviewer panel shows "evened out" and raw vs adjusted differ.

```bash
git add "src/app/portal/(app)/admin/applicants"
git commit -m "Add reviewer scoring tab with blind scoring and reviewer insights"
```

---

### Task 7: Applicant panel — application link and stage scores

**Files:**
- Modify: `src/app/portal/(app)/admin/applicants/applicant-panel.tsx`
- Modify: `src/app/portal/(app)/admin/applicants/applicants-workspace.tsx`

**Interfaces:**
- Consumes: `ApplicantRow.applicationLink`; `scoring.summaries` (Task 4); `StageSummary`.
- Produces: `ApplicantPanel` gains props `summaries: { resume?: StageSummary; interview?: StageSummary }` and `disagreementThreshold: number`.

- [ ] **Step 1: Edit the panel**

In `PanelBody` add state `const [applicationLink, setApplicationLink] = useState(applicant.applicationLink ?? "");`; include `applicationLink !== (applicant.applicationLink ?? "")` in `dirty`; pass `applicationLink` in the `updateApplicantAction` call; add an input under the Notes textarea:

```tsx
          <Input
            aria-label="Application link"
            placeholder="Link to their application (Google Doc, Drive, etc.)"
            value={applicationLink}
            onChange={(e) => setApplicationLink(e.target.value)}
          />
```

Add a "Scores" section above the Points history:

```tsx
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Scores</h3>
          {(["resume", "interview"] as const).map((s) => {
            const summary = summaries[s];
            return (
              <div key={s} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                <span className="capitalize">{s}</span>
                {summary ? (
                  <span className="flex items-center gap-2 tabular-nums">
                    raw {summary.raw.toFixed(2)} · adjusted {summary.normalized.toFixed(2)} · {summary.count} review
                    {summary.count === 1 ? "" : "s"}
                    {summary.count >= 2 && summary.spread >= disagreementThreshold && <Badge variant="destructive">disagree</Badge>}
                  </span>
                ) : (
                  <span className="text-muted-foreground">not scored yet</span>
                )}
              </div>
            );
          })}
        </section>
```

Thread the new props through `ApplicantPanel` → `PanelBody`. In `applicants-workspace.tsx` pass `summaries={{ resume: scoring.summaries.resume[selected.id], interview: scoring.summaries.interview[selected.id] }}` (guard `selected` null) and `disagreementThreshold={scoring.settings.disagreementThreshold}`.

- [ ] **Step 2: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all pass.

```bash
git add "src/app/portal/(app)/admin/applicants"
git commit -m "Show application link and stage scores in the applicant panel"
```

---

### Task 8: Final verification

- [ ] **Step 1: Full verification**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 2: Walk the Review Focus list**

Items 1–2 are covered by Task 2's unit tests; items 3–5 need the migration applied (ask the user first).

- [ ] **Step 3: Hand off**, listing anything unverified (SQL not run, UI not exercised in a browser).
