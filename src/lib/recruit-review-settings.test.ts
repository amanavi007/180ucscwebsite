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
