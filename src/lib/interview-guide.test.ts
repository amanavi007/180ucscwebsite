import { describe, expect, it } from "vitest";
import {
  BEHAVIORAL_QUESTIONS,
  CASES,
  CASE_STEPS,
  RUBRIC_TOTAL,
  behavioralMix,
  behavioralMixAdvice,
  formatClock,
  isScoreComplete,
  sectionMax,
  timerTargetSeconds,
  sectionTotal,
  totalScore,
  validateScores,
} from "./interview-guide";

describe("interview guide content", () => {
  it("keeps all 14 template questions with unique keys and numbers", () => {
    expect(BEHAVIORAL_QUESTIONS).toHaveLength(14);
    expect(new Set(BEHAVIORAL_QUESTIONS.map((q) => q.key)).size).toBe(14);
    expect(new Set(BEHAVIORAL_QUESTIONS.map((q) => q.number)).size).toBe(14);
  });

  it("gives every question at least one follow-up", () => {
    for (const q of BEHAVIORAL_QUESTIONS) expect(q.followUps.length).toBeGreaterThan(0);
  });

  it("has unique case keys and the case steps add up to 16 minutes", () => {
    expect(new Set(CASES.map((c) => c.key)).size).toBe(CASES.length);
    expect(CASE_STEPS.reduce((n, s) => n + s.minutes, 0)).toBe(16);
  });
});

describe("rubric", () => {
  it("adds up to 40 with the 16/10/14 split", () => {
    expect(RUBRIC_TOTAL).toBe(40);
    expect(sectionMax("behavioral")).toBe(16);
    expect(sectionMax("research")).toBe(10);
    expect(sectionMax("case")).toBe(14);
  });

  it("totals scores by section and overall, ignoring unscored lines", () => {
    const scores = { cohesiveness: 5, experience: 2, composure: 4, content: 3, explanation: 6 };
    expect(sectionTotal(scores, "behavioral")).toBe(11);
    expect(sectionTotal(scores, "research")).toBe(3);
    expect(sectionTotal(scores, "case")).toBe(6);
    expect(totalScore(scores)).toBe(20);
    expect(isScoreComplete(scores)).toBe(false);
  });

  it("rejects out-of-range, fractional and unknown scores", () => {
    expect(validateScores({ cohesiveness: 6, composure: 0 })).toBeNull();
    expect(validateScores({ cohesiveness: 7 })).toMatch(/Cohesiveness/);
    expect(validateScores({ experience: 1.5 })).toMatch(/whole number/);
    expect(validateScores({ made_up: 1 })).toMatch(/rubric/);
    expect(validateScores(null)).toMatch(/missing/);
  });
});

describe("question mix", () => {
  const pick = (...numbers: number[]) => BEHAVIORAL_QUESTIONS.filter((q) => numbers.includes(q.number)).map((q) => q.key);

  it("counts questions by depth", () => {
    expect(behavioralMix(pick(1, 2, 7, 4, 5))).toEqual({ warmup: 2, core: 1, deep: 2 });
  });

  it("says nothing before anything is picked and when the set is balanced", () => {
    expect(behavioralMixAdvice([])).toBeNull();
    expect(behavioralMixAdvice(pick(1, 7, 9, 3, 4))).toBeNull();
  });

  it("flags too few, too many, no deep question and no warm-up", () => {
    expect(behavioralMixAdvice(pick(1, 7))).toMatch(/3 more/);
    expect(behavioralMixAdvice(pick(1, 2, 7, 9, 3, 4, 5))).toMatch(/7 questions/);
    expect(behavioralMixAdvice(pick(1, 2, 7, 9, 3))).toMatch(/deep-dive/);
    expect(behavioralMixAdvice(pick(7, 9, 3, 4, 5))).toMatch(/warm-up/);
  });
});

describe("formatClock", () => {
  it("formats minutes and seconds", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(720)).toBe("12:00");
    expect(formatClock(-3)).toBe("0:00");
  });
});

describe("timerTargetSeconds", () => {
  it("knows each timer's limit", () => {
    expect(timerTargetSeconds("behavioral")).toBe(720);
    expect(timerTargetSeconds("research")).toBe(480);
    expect(timerTargetSeconds("case:qa")).toBe(480);
    expect(timerTargetSeconds("case:plan")).toBe(120);
  });

  it("has no limit for steps without a timer or unknown ids", () => {
    expect(timerTargetSeconds("before")).toBeNull();
    expect(timerTargetSeconds("case:nope")).toBeNull();
  });
});
