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
