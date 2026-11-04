import { describe, expect, it } from "vitest";
import {
  computeOnboardingStats,
  onboardingFlagReasons,
  parseJcLines,
  DEFAULT_ONBOARDING_THRESHOLDS,
} from "./onboarding-attendance";

describe("computeOnboardingStats", () => {
  it("counts late as attended and drops excused from the denominator", () => {
    // 2 present, 1 late, 1 excused, 1 unexcused: (2+1) / (5-1) = 0.75
    const s = computeOnboardingStats(["present", "present", "tardy", "excused", "unexcused"]);
    expect(s).toMatchObject({ meetings: 5, present: 2, tardy: 1, excused: 1, unexcused: 1, absences: 2 });
    expect(s.rate).toBeCloseTo(0.75, 10);
  });
  it("has no rate when nothing counts", () => {
    expect(computeOnboardingStats([]).rate).toBeNull();
    expect(computeOnboardingStats(["excused"]).rate).toBeNull();
  });
  it("is 100% when only present or late", () => {
    expect(computeOnboardingStats(["present", "tardy"]).rate).toBe(1);
  });
});

describe("onboardingFlagReasons", () => {
  const t = DEFAULT_ONBOARDING_THRESHOLDS;
  it("is empty for a JC in good standing", () => {
    expect(onboardingFlagReasons(computeOnboardingStats(["present", "present", "excused"]), t)).toEqual([]);
  });
  it("flags unexcused, total absences and low rate", () => {
    const stats = computeOnboardingStats(["unexcused", "unexcused", "excused", "present"]);
    const reasons = onboardingFlagReasons(stats, t);
    expect(reasons).toContain("2 unexcused");
    expect(reasons).toContain("3 absences");
  });
  it("treats 0 as off", () => {
    const stats = computeOnboardingStats(["unexcused", "unexcused", "unexcused"]);
    expect(onboardingFlagReasons(stats, { maxUnexcused: 0, maxAbsences: 0, minRate: 0 })).toEqual([]);
  });
});

describe("parseJcLines", () => {
  it("accepts name only, name + email, angle brackets and tabs; any domain", () => {
    const { jcs, problems } = parseJcLines(
      "Maya Chen\nSam Lee, sam@gmail.com\nJo Park <jo@icloud.com>\nAli Khan\tali@ucsc.edu\n",
    );
    expect(problems).toEqual([]);
    expect(jcs).toEqual([
      { name: "Maya Chen", email: null },
      { name: "Sam Lee", email: "sam@gmail.com" },
      { name: "Jo Park", email: "jo@icloud.com" },
      { name: "Ali Khan", email: "ali@ucsc.edu" },
    ]);
  });
  it("reports bad emails and skips duplicates", () => {
    const { jcs, problems } = parseJcLines("A B, nope@x\nA B\nA B");
    expect(problems).toHaveLength(1);
    expect(jcs).toEqual([{ name: "A B", email: null }]);
  });
});
