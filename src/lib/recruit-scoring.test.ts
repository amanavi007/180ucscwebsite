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
