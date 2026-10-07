# Recruitment Points — Decision View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Combine engagement points, resume score and interview score into one weighted composite per applicant and present a ranked leaderboard built for decisions: cutoff line, "on the bubble" highlight, raw/normalized toggle, signals, ranking explanation in the side panel, and CSV export.

**Architecture:** All composite math is pure and unit-tested in `src/lib/recruit-composite.ts`; settings (weights, full marks, cutoff) extend the existing `recruit-settings` module and `org_settings` rows (no migration). The workspace computes the ranking client-side from the already-loaded applicants and the scoring bundle, so toggling raw/normalized or editing the cutoff re-ranks instantly. `ApplicantsView` is rewritten as the approved "Leaderboard v2".

**Tech Stack:** Next.js (breaking-changes build), TypeScript, Vitest, base-ui shadcn components, sonner.

**Spec:** `docs/superpowers/specs/2026-10-07-recruitment-points-decision-view-design.md` (builds on pieces 1–3, already merged)

## Global Constraints

- `AGENTS.md`: this Next.js version has breaking changes; copy patterns from the existing `src/app/portal/(app)/admin/applicants/*`.
- **No migration.** Settings live in `org_settings` and fall back to defaults when unset.
- Defaults: weights engagement 30 / resume 30 / interview 40 (must total 100), engagement full marks **5**, accepting count **30**, bubble width **3**. Default view uses **normalized** scores.
- Engagement percent = `clamp(engagementPoints / fullMarks, 0, 1) × 100` where engagement points are live ledger points in categories whose section is `engagement`; stage percent = `(score − scaleMin) / (scaleMax − scaleMin) × 100`.
- Composite = weighted mean over the sections that are **present**; engagement is always present, resume/interview are missing until scored. Applicants missing a section are marked **Incomplete**; the ranking still includes them.
- The ranking shows un-blinded aggregate scores (decision tool); per-reviewer details in the side panel are still not shown by this piece.
- Settings that change ranking inputs (weights, full marks, cutoff) are editable by any exec; weights must total exactly 100.
- React lint rule `react-hooks/set-state-in-effect` is enforced: derive values or use `key`-remounted components, no synchronous `setState` in effects.
- Commit messages: plain, **no `Co-Authored-By` / Claude attribution lines** (saved user preference).
- Before the final commit run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## Review Focus

1. **Weights that don't total 100, or full marks ≤ 0** — rejected with a clear message; unset or corrupt stored values fall back to defaults instead of breaking the page (Task 1 tests).
2. **Partial applicants** — an applicant with no resume/interview score gets a composite from the sections they have, is flagged Incomplete, and never shows `NaN`; an applicant with no data at all ranks last (Task 2 tests).
3. **Ties** — equal composites share a rank, with stable name ordering (Task 2 tests).
4. **Cutoff edges** — accepting count 0, larger than the number of applicants, or equal to it; bubble width larger than the list (Task 2 tests, Task 4 UI).
5. **Toggle correctness** — raw vs normalized changes only the stage scores, the delta chip equals normalized − raw composite, and filters/search never move the cutoff line to a wrong row (Task 2 tests, Task 4 UI).

---

### Task 1: Extend settings (TDD)

**Files:**
- Modify: `src/lib/recruit-settings.ts`
- Modify: `src/lib/recruit-settings.test.ts`

**Interfaces:**
- Produces: `RecruitSettings` now also has `weightEngagement`, `weightResume`, `weightInterview`, `engagementFullMarks`, `acceptingCount`, `bubbleWidth` (all `number`); `DEFAULT_RECRUIT_SETTINGS` and `RECRUIT_SETTING_KEYS` cover them; `validateRecruitSettings(partial)` additionally validates them; `parseRecruitSettings` reads them.
- Weight keys: `recruit_weight_engagement`, `recruit_weight_resume`, `recruit_weight_interview`; others: `recruit_engagement_full_marks`, `recruit_accepting_count`, `recruit_bubble_width`.

- [ ] **Step 1: Update and add tests**

In `src/lib/recruit-settings.test.ts` change the existing "reads stored values" assertion to keep passing with the larger settings object:

```ts
    expect(parseRecruitSettings(rows)).toEqual({ ...DEFAULT_RECRUIT_SETTINGS, normalizeMinN: 12, disagreementThreshold: 2 });
```

Append:

```ts
describe("decision-view settings", () => {
  it("has the agreed defaults", () => {
    expect(DEFAULT_RECRUIT_SETTINGS).toMatchObject({
      weightEngagement: 30,
      weightResume: 30,
      weightInterview: 40,
      engagementFullMarks: 5,
      acceptingCount: 30,
      bubbleWidth: 3,
    });
  });

  it("reads stored weights only when they total 100", () => {
    const good = [
      { key: RECRUIT_SETTING_KEYS.weightEngagement, value: "20" },
      { key: RECRUIT_SETTING_KEYS.weightResume, value: "30" },
      { key: RECRUIT_SETTING_KEYS.weightInterview, value: "50" },
    ];
    expect(parseRecruitSettings(good)).toMatchObject({ weightEngagement: 20, weightResume: 30, weightInterview: 50 });

    const bad = good.map((r) => (r.key === RECRUIT_SETTING_KEYS.weightResume ? { ...r, value: "99" } : r));
    expect(parseRecruitSettings(bad)).toMatchObject({ weightEngagement: 30, weightResume: 30, weightInterview: 40 });
  });

  it("reads full marks, cutoff and bubble width, ignoring invalid values", () => {
    const rows = [
      { key: RECRUIT_SETTING_KEYS.engagementFullMarks, value: "0" },
      { key: RECRUIT_SETTING_KEYS.acceptingCount, value: "25" },
      { key: RECRUIT_SETTING_KEYS.bubbleWidth, value: "-1" },
    ];
    expect(parseRecruitSettings(rows)).toMatchObject({ engagementFullMarks: 5, acceptingCount: 25, bubbleWidth: 3 });
  });

  it("validates weights as a group that totals 100", () => {
    expect(validateRecruitSettings({ weightEngagement: 30, weightResume: 30, weightInterview: 40 })).toBeNull();
    expect(validateRecruitSettings({ weightEngagement: 30, weightResume: 30, weightInterview: 30 })).toMatch(/add up to 100/i);
    expect(validateRecruitSettings({ weightEngagement: 100 })).toMatch(/all three/i);
    expect(validateRecruitSettings({ weightEngagement: -10, weightResume: 60, weightInterview: 50 })).toMatch(/0 or more/i);
  });

  it("validates full marks, cutoff and bubble width", () => {
    expect(validateRecruitSettings({ engagementFullMarks: 0 })).toMatch(/greater than 0/i);
    expect(validateRecruitSettings({ engagementFullMarks: 4.5 })).toBeNull();
    expect(validateRecruitSettings({ acceptingCount: -1 })).toMatch(/0 or more/i);
    expect(validateRecruitSettings({ acceptingCount: 2.5 })).toMatch(/whole/i);
    expect(validateRecruitSettings({ acceptingCount: 0 })).toBeNull();
    expect(validateRecruitSettings({ bubbleWidth: 1.5 })).toMatch(/whole/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/recruit-settings.test.ts`
Expected: FAIL — new keys/fields don't exist.

- [ ] **Step 3: Implement**

Replace `src/lib/recruit-settings.ts` with:

```ts
export interface RecruitSettings {
  normalizeMinN: number;
  disagreementThreshold: number;
  weightEngagement: number;
  weightResume: number;
  weightInterview: number;
  engagementFullMarks: number;
  acceptingCount: number;
  bubbleWidth: number;
}

export const DEFAULT_RECRUIT_SETTINGS: RecruitSettings = {
  normalizeMinN: 8,
  disagreementThreshold: 1.5,
  weightEngagement: 30,
  weightResume: 30,
  weightInterview: 40,
  engagementFullMarks: 5,
  acceptingCount: 30,
  bubbleWidth: 3,
};

export const RECRUIT_SETTING_KEYS: Record<keyof RecruitSettings, string> = {
  normalizeMinN: "recruit_normalize_min_n",
  disagreementThreshold: "recruit_disagreement_threshold",
  weightEngagement: "recruit_weight_engagement",
  weightResume: "recruit_weight_resume",
  weightInterview: "recruit_weight_interview",
  engagementFullMarks: "recruit_engagement_full_marks",
  acceptingCount: "recruit_accepting_count",
  bubbleWidth: "recruit_bubble_width",
};

const WEIGHT_FIELDS = ["weightEngagement", "weightResume", "weightInterview"] as const;

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

  const givenWeights = WEIGHT_FIELDS.filter((f) => partial[f] !== undefined);
  if (givenWeights.length > 0) {
    if (givenWeights.length < WEIGHT_FIELDS.length) return "Set all three weights together so they can add up to 100.";
    const values = WEIGHT_FIELDS.map((f) => partial[f] as number);
    if (values.some((v) => !Number.isFinite(v) || v < 0)) return "Each weight has to be 0 or more.";
    const total = values.reduce((a, b) => a + b, 0);
    if (Math.abs(total - 100) > 0.01) return `The weights have to add up to 100 (they add up to ${Math.round(total * 100) / 100}).`;
  }

  if (partial.engagementFullMarks !== undefined) {
    if (!Number.isFinite(partial.engagementFullMarks) || partial.engagementFullMarks <= 0) {
      return "Full marks for engagement has to be greater than 0.";
    }
  }
  for (const field of ["acceptingCount", "bubbleWidth"] as const) {
    const value = partial[field];
    if (value === undefined) continue;
    if (!Number.isFinite(value)) return "Enter that as a number.";
    if (!Number.isInteger(value)) return "That has to be a whole number.";
    if (value < 0) return "That has to be 0 or more.";
  }
  return null;
}

export function parseRecruitSettings(rows: { key: string; value: string }[]): RecruitSettings {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const num = (field: keyof RecruitSettings): number => Number(byKey.get(RECRUIT_SETTING_KEYS[field]));

  const read = (field: Exclude<keyof RecruitSettings, (typeof WEIGHT_FIELDS)[number]>): number => {
    const parsed = num(field);
    const candidate = { [field]: parsed } as Partial<RecruitSettings>;
    return Number.isFinite(parsed) && validateRecruitSettings(candidate) === null ? parsed : DEFAULT_RECRUIT_SETTINGS[field];
  };

  const storedWeights = {
    weightEngagement: num("weightEngagement"),
    weightResume: num("weightResume"),
    weightInterview: num("weightInterview"),
  };
  const weights = validateRecruitSettings(storedWeights) === null
    ? storedWeights
    : {
        weightEngagement: DEFAULT_RECRUIT_SETTINGS.weightEngagement,
        weightResume: DEFAULT_RECRUIT_SETTINGS.weightResume,
        weightInterview: DEFAULT_RECRUIT_SETTINGS.weightInterview,
      };

  return {
    normalizeMinN: read("normalizeMinN"),
    disagreementThreshold: read("disagreementThreshold"),
    ...weights,
    engagementFullMarks: read("engagementFullMarks"),
    acceptingCount: read("acceptingCount"),
    bubbleWidth: read("bubbleWidth"),
  };
}
```

- [ ] **Step 4: Run to verify pass and commit**

Run: `npx vitest run src/lib/recruit-settings.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors. (Plan 3's `ScoringSettingsCard` passes only its two fields, which is still valid because the action takes a `Partial`.)

```bash
git add src/lib/recruit-settings.ts src/lib/recruit-settings.test.ts
git commit -m "Extend recruitment settings with weights, full marks and cutoff"
```

---

### Task 2: Composite math (pure logic, TDD)

**Files:**
- Create: `src/lib/recruit-composite.ts`
- Test: `src/lib/recruit-composite.test.ts`

**Interfaces:**
- Consumes: `toCsv` from `./csv`.
- Produces (exported from `src/lib/recruit-composite.ts`):
  - `interface SectionWeights { engagement: number; resume: number; interview: number }`
  - `engagementPercent(points: number, fullMarks: number): number`
  - `stagePercent(score: number, scaleMin: number, scaleMax: number): number`
  - `interface SectionPercents { engagementPct: number; resumePct: number | null; interviewPct: number | null }`
  - `compositeFor(p: SectionPercents, weights: SectionWeights): { composite: number; complete: boolean; effectiveWeights: { engagement: number; resume: number | null; interview: number | null } }`
  - `interface ScoreLite { raw: number; normalized: number }`
  - `interface DecisionInput { id: string; name: string; engagementPoints: number; resume: ScoreLite | null; interview: ScoreLite | null }`
  - `interface DecisionConfig { weights: SectionWeights; fullMarks: number; resumeScale: { min: number; max: number }; interviewScale: { min: number; max: number }; useNormalized: boolean }`
  - `interface RankedApplicant { id: string; name: string; rank: number; composite: number; engagementPct: number; resumePct: number | null; interviewPct: number | null; complete: boolean; normalizationDelta: number; effectiveWeights: { engagement: number; resume: number | null; interview: number | null } }`
  - `rankApplicants(rows: DecisionInput[], cfg: DecisionConfig): RankedApplicant[]`
  - `bubbleIds(ranked: { id: string }[], acceptingCount: number, width: number): Set<string>`
  - `explainComposite(r: RankedApplicant): string`
  - `interface ExportRow { rank: number; name: string; email: string; composite: number; engagementPoints: number; engagementPct: number; resumeRaw: number | null; resumeAdjusted: number | null; resumePct: number | null; interviewRaw: number | null; interviewAdjusted: number | null; interviewPct: number | null; complete: boolean }`
  - `decisionCsv(rows: ExportRow[]): string`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/recruit-composite.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  bubbleIds,
  compositeFor,
  decisionCsv,
  engagementPercent,
  explainComposite,
  rankApplicants,
  stagePercent,
  type DecisionConfig,
  type DecisionInput,
} from "./recruit-composite";

const weights = { engagement: 30, resume: 30, interview: 40 };

describe("engagementPercent", () => {
  it("scales against full marks, capping at 100 and flooring at 0", () => {
    expect(engagementPercent(5, 5)).toBe(100);
    expect(engagementPercent(7, 5)).toBe(100);
    expect(engagementPercent(2.5, 5)).toBe(50);
    expect(engagementPercent(-2, 5)).toBe(0);
  });
  it("never divides by zero", () => {
    expect(engagementPercent(3, 0)).toBe(0);
  });
});

describe("stagePercent", () => {
  it("maps the scale onto 0-100 and clamps", () => {
    expect(stagePercent(5, 1, 5)).toBe(100);
    expect(stagePercent(3, 1, 5)).toBe(50);
    expect(stagePercent(1, 1, 5)).toBe(0);
    expect(stagePercent(7, 1, 5)).toBe(100);
    expect(stagePercent(0, 1, 5)).toBe(0);
  });
  it("is 0 for a degenerate scale", () => {
    expect(stagePercent(3, 3, 3)).toBe(0);
  });
});

describe("compositeFor", () => {
  it("uses the configured weights when every section is present", () => {
    const r = compositeFor({ engagementPct: 100, resumePct: 50, interviewPct: 0 }, weights);
    expect(r.composite).toBe(45);
    expect(r.complete).toBe(true);
    expect(r.effectiveWeights).toEqual({ engagement: 30, resume: 30, interview: 40 });
  });
  it("renormalizes weights over the sections that exist", () => {
    const r = compositeFor({ engagementPct: 100, resumePct: 50, interviewPct: null }, weights);
    expect(r.composite).toBe(75); // (30*100 + 30*50) / 60
    expect(r.complete).toBe(false);
    expect(r.effectiveWeights).toEqual({ engagement: 50, resume: 50, interview: null });
  });
  it("falls back to engagement alone when nothing else is scored", () => {
    const r = compositeFor({ engagementPct: 40, resumePct: null, interviewPct: null }, weights);
    expect(r.composite).toBe(40);
    expect(r.complete).toBe(false);
  });
  it("uses equal weights when the present sections all have weight 0", () => {
    const r = compositeFor({ engagementPct: 100, resumePct: 0, interviewPct: null }, { engagement: 0, resume: 0, interview: 100 });
    expect(r.composite).toBe(50);
    expect(Number.isNaN(r.composite)).toBe(false);
  });
});

const cfg: DecisionConfig = {
  weights,
  fullMarks: 4,
  resumeScale: { min: 1, max: 5 },
  interviewScale: { min: 1, max: 5 },
  useNormalized: true,
};

const A: DecisionInput = {
  id: "a",
  name: "Aisha",
  engagementPoints: 4,
  resume: { raw: 5, normalized: 4.5 },
  interview: { raw: 5, normalized: 5 },
};
const B: DecisionInput = { id: "b", name: "Ben", engagementPoints: 2, resume: { raw: 3, normalized: 3 }, interview: null };
const C: DecisionInput = { id: "c", name: "Cara", engagementPoints: 0, resume: null, interview: null };

describe("rankApplicants", () => {
  it("ranks by composite, best first", () => {
    const ranked = rankApplicants([C, B, A], cfg);
    expect(ranked.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });
  it("computes composites from normalized scores by default", () => {
    const [a] = rankApplicants([A], cfg);
    // engagement 100, resume (4.5-1)/4 = 87.5, interview 100 -> (3000 + 2625 + 4000) / 100
    expect(a.composite).toBeCloseTo(96.25, 9);
    expect(a.complete).toBe(true);
  });
  it("uses raw scores when the toggle says so, and reports the normalization delta either way", () => {
    const [raw] = rankApplicants([A], { ...cfg, useNormalized: false });
    expect(raw.composite).toBeCloseTo(100, 9);
    expect(raw.normalizationDelta).toBeCloseTo(-3.75, 9);
    const [norm] = rankApplicants([A], cfg);
    expect(norm.normalizationDelta).toBeCloseTo(-3.75, 9);
  });
  it("marks partial applicants incomplete without NaN", () => {
    const [b] = rankApplicants([B], cfg);
    expect(b.complete).toBe(false);
    expect(b.composite).toBe(50); // (30*50 + 30*50) / 60
    expect(b.interviewPct).toBeNull();
    expect(Number.isNaN(b.composite)).toBe(false);
  });
  it("ranks an applicant with no data last", () => {
    const ranked = rankApplicants([C, B], cfg);
    expect(ranked[1].id).toBe("c");
    expect(ranked[1].composite).toBe(0);
  });
  it("gives equal composites a shared rank, ordered by name", () => {
    const x: DecisionInput = { id: "x", name: "Zed", engagementPoints: 4, resume: null, interview: null };
    const y: DecisionInput = { id: "y", name: "Amy", engagementPoints: 4, resume: null, interview: null };
    const ranked = rankApplicants([x, y], cfg);
    expect(ranked.map((r) => [r.name, r.rank])).toEqual([
      ["Amy", 1],
      ["Zed", 1],
    ]);
  });
  it("returns [] for no applicants", () => {
    expect(rankApplicants([], cfg)).toEqual([]);
  });
});

describe("bubbleIds", () => {
  const ranked = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}` }));
  it("covers `width` rows either side of the cutoff", () => {
    expect([...bubbleIds(ranked, 5, 2)]).toEqual(["r3", "r4", "r5", "r6"]);
  });
  it("is empty when nothing is being accepted or the width is 0", () => {
    expect(bubbleIds(ranked, 0, 3).size).toBe(0);
    expect(bubbleIds(ranked, 5, 0).size).toBe(0);
  });
  it("stays within the list at the edges", () => {
    expect([...bubbleIds(ranked, 1, 3)]).toEqual(["r0", "r1", "r2", "r3"]);
    expect([...bubbleIds(ranked, 10, 2)]).toEqual(["r8", "r9"]);
    expect([...bubbleIds(ranked, 99, 2)]).toEqual(["r8", "r9"]);
  });
});

describe("explainComposite", () => {
  it("spells out the weights and percentages that make the score", () => {
    const [a] = rankApplicants([A], cfg);
    expect(explainComposite(a)).toBe("30% × 100 + 30% × 88 + 40% × 100 = 96.3");
  });
  it("shows renormalized weights for partial applicants", () => {
    const [b] = rankApplicants([B], cfg);
    expect(explainComposite(b)).toBe("50% × 50 + 50% × 50 = 50");
  });
});

describe("decisionCsv", () => {
  it("writes a header and one row per applicant, blanks for missing values", () => {
    const csv = decisionCsv([
      {
        rank: 1,
        name: "Aisha, Rahman",
        email: "a@ucsc.edu",
        composite: 96.25,
        engagementPoints: 4,
        engagementPct: 100,
        resumeRaw: 5,
        resumeAdjusted: 4.5,
        resumePct: 87.5,
        interviewRaw: null,
        interviewAdjusted: null,
        interviewPct: null,
        complete: false,
      },
    ]);
    const [header, row] = csv.split("\n");
    expect(header).toBe(
      "Rank,Name,Email,Composite,Engagement points,Engagement %,Resume (raw),Resume (adjusted),Resume %,Interview (raw),Interview (adjusted),Interview %,Complete",
    );
    expect(row).toBe('1,"Aisha, Rahman",a@ucsc.edu,96.25,4,100,5,4.5,87.5,,,,No');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/recruit-composite.test.ts`
Expected: FAIL — cannot resolve `./recruit-composite`.

- [ ] **Step 3: Implement**

Create `src/lib/recruit-composite.ts`:

```ts
import { toCsv } from "./csv";

export interface SectionWeights {
  engagement: number;
  resume: number;
  interview: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

export function engagementPercent(points: number, fullMarks: number): number {
  if (fullMarks <= 0) return 0;
  return clamp(points / fullMarks, 0, 1) * 100;
}

export function stagePercent(score: number, scaleMin: number, scaleMax: number): number {
  if (scaleMax <= scaleMin) return 0;
  return clamp((score - scaleMin) / (scaleMax - scaleMin), 0, 1) * 100;
}

export interface SectionPercents {
  engagementPct: number;
  resumePct: number | null;
  interviewPct: number | null;
}

export interface EffectiveWeights {
  engagement: number;
  resume: number | null;
  interview: number | null;
}

/** Weighted mean over the sections that exist (engagement always does); weights are renormalized to what's present. */
export function compositeFor(
  p: SectionPercents,
  weights: SectionWeights,
): { composite: number; complete: boolean; effectiveWeights: EffectiveWeights } {
  const present: { key: keyof SectionWeights; pct: number; weight: number }[] = [
    { key: "engagement", pct: p.engagementPct, weight: weights.engagement },
  ];
  if (p.resumePct !== null) present.push({ key: "resume", pct: p.resumePct, weight: weights.resume });
  if (p.interviewPct !== null) present.push({ key: "interview", pct: p.interviewPct, weight: weights.interview });

  const total = present.reduce((s, x) => s + x.weight, 0);
  const useEqual = total <= 0;
  const w = (x: { weight: number }) => (useEqual ? 1 : x.weight);
  const denom = useEqual ? present.length : total;

  const composite = present.reduce((s, x) => s + w(x) * x.pct, 0) / denom;
  const share = (key: keyof SectionWeights): number | null => {
    const found = present.find((x) => x.key === key);
    return found ? (w(found) / denom) * 100 : null;
  };

  return {
    composite,
    complete: p.resumePct !== null && p.interviewPct !== null,
    effectiveWeights: { engagement: share("engagement")!, resume: share("resume"), interview: share("interview") },
  };
}

export interface ScoreLite {
  raw: number;
  normalized: number;
}

export interface DecisionInput {
  id: string;
  name: string;
  engagementPoints: number;
  resume: ScoreLite | null;
  interview: ScoreLite | null;
}

export interface DecisionConfig {
  weights: SectionWeights;
  fullMarks: number;
  resumeScale: { min: number; max: number };
  interviewScale: { min: number; max: number };
  useNormalized: boolean;
}

export interface RankedApplicant {
  id: string;
  name: string;
  rank: number;
  composite: number;
  engagementPct: number;
  resumePct: number | null;
  interviewPct: number | null;
  complete: boolean;
  /** Composite from normalized scores minus composite from raw scores. */
  normalizationDelta: number;
  effectiveWeights: EffectiveWeights;
}

export function rankApplicants(rows: DecisionInput[], cfg: DecisionConfig): RankedApplicant[] {
  const scored = rows.map((row) => {
    const engagementPct = engagementPercent(row.engagementPoints, cfg.fullMarks);
    const pct = (s: ScoreLite | null, scale: { min: number; max: number }, normalized: boolean) =>
      s ? stagePercent(normalized ? s.normalized : s.raw, scale.min, scale.max) : null;

    const shown = compositeFor(
      {
        engagementPct,
        resumePct: pct(row.resume, cfg.resumeScale, cfg.useNormalized),
        interviewPct: pct(row.interview, cfg.interviewScale, cfg.useNormalized),
      },
      cfg.weights,
    );
    const normalizedComposite = compositeFor(
      {
        engagementPct,
        resumePct: pct(row.resume, cfg.resumeScale, true),
        interviewPct: pct(row.interview, cfg.interviewScale, true),
      },
      cfg.weights,
    ).composite;
    const rawComposite = compositeFor(
      {
        engagementPct,
        resumePct: pct(row.resume, cfg.resumeScale, false),
        interviewPct: pct(row.interview, cfg.interviewScale, false),
      },
      cfg.weights,
    ).composite;

    return {
      id: row.id,
      name: row.name,
      composite: shown.composite,
      engagementPct,
      resumePct: pct(row.resume, cfg.resumeScale, cfg.useNormalized),
      interviewPct: pct(row.interview, cfg.interviewScale, cfg.useNormalized),
      complete: shown.complete,
      normalizationDelta: normalizedComposite - rawComposite,
      effectiveWeights: shown.effectiveWeights,
    };
  });

  scored.sort((a, b) => round2(b.composite) - round2(a.composite) || a.name.localeCompare(b.name));

  let rank = 0;
  let last: number | null = null;
  return scored.map((s, i) => {
    const key = round2(s.composite);
    if (key !== last) {
      rank = i + 1;
      last = key;
    }
    return { ...s, rank };
  });
}

/** Ids within `width` rows either side of the accept/decline line (the line sits after `acceptingCount` rows). */
export function bubbleIds(ranked: { id: string }[], acceptingCount: number, width: number): Set<string> {
  if (acceptingCount <= 0 || width <= 0) return new Set();
  const start = Math.max(0, acceptingCount - width);
  const end = Math.min(ranked.length, acceptingCount + width);
  return new Set(ranked.slice(start, end).map((r) => r.id));
}

const fmt = (n: number, digits: number) => String(Math.round(n * 10 ** digits) / 10 ** digits);

/** "30% × 88 + 30% × 76 + 40% × 90 = 85" — the weights shown are the ones actually used for this applicant. */
export function explainComposite(r: RankedApplicant): string {
  const parts: string[] = [`${fmt(r.effectiveWeights.engagement, 0)}% × ${fmt(r.engagementPct, 0)}`];
  if (r.resumePct !== null && r.effectiveWeights.resume !== null) {
    parts.push(`${fmt(r.effectiveWeights.resume, 0)}% × ${fmt(r.resumePct, 0)}`);
  }
  if (r.interviewPct !== null && r.effectiveWeights.interview !== null) {
    parts.push(`${fmt(r.effectiveWeights.interview, 0)}% × ${fmt(r.interviewPct, 0)}`);
  }
  return `${parts.join(" + ")} = ${fmt(r.composite, 1)}`;
}

export interface ExportRow {
  rank: number;
  name: string;
  email: string;
  composite: number;
  engagementPoints: number;
  engagementPct: number;
  resumeRaw: number | null;
  resumeAdjusted: number | null;
  resumePct: number | null;
  interviewRaw: number | null;
  interviewAdjusted: number | null;
  interviewPct: number | null;
  complete: boolean;
}

const cell = (n: number | null): string | number => (n === null ? "" : round2(n));

export function decisionCsv(rows: ExportRow[]): string {
  return toCsv(
    [
      "Rank",
      "Name",
      "Email",
      "Composite",
      "Engagement points",
      "Engagement %",
      "Resume (raw)",
      "Resume (adjusted)",
      "Resume %",
      "Interview (raw)",
      "Interview (adjusted)",
      "Interview %",
      "Complete",
    ],
    rows.map((r) => [
      r.rank,
      r.name,
      r.email,
      round2(r.composite),
      round2(r.engagementPoints),
      round2(r.engagementPct),
      cell(r.resumeRaw),
      cell(r.resumeAdjusted),
      cell(r.resumePct),
      cell(r.interviewRaw),
      cell(r.interviewAdjusted),
      cell(r.interviewPct),
      r.complete ? "Yes" : "No",
    ]),
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/recruit-composite.test.ts`
Expected: all PASS. If `explainComposite` for A prints `96.3` vs `96.25`, note `fmt(96.25, 1)` rounds half up to `96.3` — the test expects `96.3`; if floating error produces `96.2`, compute with `Math.round(n * 10 ** digits + Number.EPSILON)` instead.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recruit-composite.ts src/lib/recruit-composite.test.ts
git commit -m "Add composite scoring, ranking, cutoff bubble and CSV export logic"
```

---

### Task 3: Engagement points in the data layer and ranking in the workspace

**Files:**
- Modify: `src/lib/data/recruit.ts`
- Modify: `src/app/portal/(app)/admin/applicants/applicants-workspace.tsx`

**Interfaces:**
- Consumes: Task 2 `rankApplicants`, `bubbleIds`, `DecisionConfig`, `RankedApplicant`; plan 3's `ScoringBundle` (`summaries`, `stages[...].rubric`, `settings`), `isDisagreement`.
- Produces: `ApplicantRow.engagementPoints: number` (live points in `engagement`-section categories); `export interface RankedRow extends ApplicantRow { ranking: RankedApplicant; disagree: boolean; onBubble: boolean }` exported from a new `src/app/portal/(app)/admin/applicants/ranked-row.ts` along with `buildRankedRows(rows, scoring, useNormalized): { ranked: RankedRow[]; config: DecisionConfig }`.

- [ ] **Step 1: Engagement points**

In `getApplicantRows` (`src/lib/data/recruit.ts`) build `const sectionByCategory = new Map(categories.map((c) => [c.id, c.section]));` and in the final mapping add:

```ts
      engagementPoints: sumPoints(entries.filter((e) => sectionByCategory.get(e.categoryId) === "engagement")),
```

and add `engagementPoints: number;` to `ApplicantRow`.

- [ ] **Step 2: The ranked-row builder**

Create `src/app/portal/(app)/admin/applicants/ranked-row.ts`:

```ts
import type { ApplicantRow } from "@/lib/data/recruit";
import type { ScoringBundle } from "@/lib/data/recruit-scoring";
import { bubbleIds, rankApplicants, type DecisionConfig, type RankedApplicant } from "@/lib/recruit-composite";
import { isDisagreement } from "@/lib/recruit-scoring";

export interface RankedRow extends ApplicantRow {
  ranking: RankedApplicant;
  disagree: boolean;
  onBubble: boolean;
}

export function buildRankedRows(
  rows: ApplicantRow[],
  scoring: ScoringBundle,
  useNormalized: boolean,
): { ranked: RankedRow[]; config: DecisionConfig } {
  const { settings, summaries, stages } = scoring;
  const config: DecisionConfig = {
    weights: {
      engagement: settings.weightEngagement,
      resume: settings.weightResume,
      interview: settings.weightInterview,
    },
    fullMarks: settings.engagementFullMarks,
    resumeScale: { min: stages.resume.rubric.scaleMin, max: stages.resume.rubric.scaleMax },
    interviewScale: { min: stages.interview.rubric.scaleMin, max: stages.interview.rubric.scaleMax },
    useNormalized,
  };

  const lite = (s: { raw: number; normalized: number } | undefined) => (s ? { raw: s.raw, normalized: s.normalized } : null);
  const ranking = rankApplicants(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      engagementPoints: r.engagementPoints,
      resume: lite(summaries.resume[r.id]),
      interview: lite(summaries.interview[r.id]),
    })),
    config,
  );

  const byId = new Map(rows.map((r) => [r.id, r]));
  const bubble = bubbleIds(ranking, settings.acceptingCount, settings.bubbleWidth);

  const ranked = ranking.map((rk): RankedRow => {
    const row = byId.get(rk.id)!;
    const resume = summaries.resume[rk.id];
    const interview = summaries.interview[rk.id];
    return {
      ...row,
      ranking: rk,
      disagree:
        (!!resume && isDisagreement(resume, settings.disagreementThreshold)) ||
        (!!interview && isDisagreement(interview, settings.disagreementThreshold)),
      onBubble: bubble.has(rk.id),
    };
  });
  return { ranked, config };
}
```

- [ ] **Step 3: Compute in the workspace**

In `applicants-workspace.tsx`: add `const [useNormalized, setUseNormalized] = useState(true);` and `const { ranked } = useMemo(() => buildRankedRows(rows, scoring, useNormalized), [rows, scoring, useNormalized]);` (import `useMemo`). Keep passing the existing props to `ApplicantsView` for now (Task 4 swaps it to `ranked`).

- [ ] **Step 4: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all pass.

```bash
git add src/lib/data/recruit.ts "src/app/portal/(app)/admin/applicants"
git commit -m "Compute engagement points and the decision ranking in the workspace"
```

---

### Task 4: Leaderboard v2, ranking panel section, CSV export

**Files:**
- Modify (rewrite): `src/app/portal/(app)/admin/applicants/applicants-view.tsx`
- Modify: `src/app/portal/(app)/admin/applicants/applicant-panel.tsx` (ranking section)
- Modify: `src/app/portal/(app)/admin/applicants/applicants-workspace.tsx`
- Modify: `src/app/portal/(app)/admin/applicants/how-it-works.tsx` (help text)

**Interfaces:**
- Consumes: Task 3 `RankedRow`; Task 2 `explainComposite`, `decisionCsv`, `ExportRow`; `updateRecruitSettingsAction`; `downloadCsv` from `@/lib/csv`; `ScoreRing`.
- Produces: `ApplicantsView` props `{ ranked: RankedRow[]; settings: RecruitSettings; useNormalized: boolean; onToggleNormalized: (v: boolean) => void; summaries: ScoringBundle["summaries"]; duplicateCount: number; toMarkCount: number; onReviewDuplicates: () => void; onReviewAttendance: () => void; onSelect: (id: string) => void; addButton: React.ReactNode }`; `ApplicantPanel` gains `ranking: RankedRow["ranking"] | null`.

- [ ] **Step 1: Rewrite the leaderboard**

Replace `applicants-view.tsx` with:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Search, UserPlus } from "lucide-react";
import { updateRecruitSettingsAction } from "@/actions/recruit";
import type { ScoringBundle } from "@/lib/data/recruit-scoring";
import type { RecruitSettings } from "@/lib/recruit-settings";
import { decisionCsv, type ExportRow } from "@/lib/recruit-composite";
import { downloadCsv } from "@/lib/csv";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScoreRing } from "./score-ring";
import type { RankedRow } from "./ranked-row";

type Filter = "all" | "engaged" | "resume" | "interview" | "complete";
type Sort = "composite" | "name" | "engagement" | "resume" | "interview";

const SORT_LABEL: Record<Sort, string> = {
  composite: "Sort: Composite",
  name: "Sort: Name A–Z",
  engagement: "Sort: Engagement",
  resume: "Sort: Resume",
  interview: "Sort: Interview",
};

function Bar({ pct, className, label }: { pct: number | null; className: string; label: string }) {
  return (
    <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted" title={`${label}: ${pct === null ? "not scored yet" : `${Math.round(pct)}%`}`}>
      <div className={`h-full ${className}`} style={{ width: `${pct ?? 0}%` }} />
    </div>
  );
}

function Dot({ filled, label }: { filled: boolean; label: string }) {
  return (
    <span
      title={label}
      className={`inline-block size-2 rounded-full border ${filled ? "border-emerald-600 bg-emerald-600" : "border-muted-foreground/40"}`}
    />
  );
}

export function ApplicantsView({
  ranked,
  settings,
  useNormalized,
  onToggleNormalized,
  summaries,
  duplicateCount,
  toMarkCount,
  onReviewDuplicates,
  onReviewAttendance,
  onSelect,
  addButton,
}: {
  ranked: RankedRow[];
  settings: RecruitSettings;
  useNormalized: boolean;
  onToggleNormalized: (v: boolean) => void;
  summaries: ScoringBundle["summaries"];
  duplicateCount: number;
  toMarkCount: number;
  onReviewDuplicates: () => void;
  onReviewAttendance: () => void;
  onSelect: (id: string) => void;
  addButton: React.ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("composite");
  const [accepting, setAccepting] = useState(String(settings.acceptingCount));
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const counts: Record<Filter, number> = {
    all: ranked.length,
    engaged: ranked.filter((r) => r.engagementPoints > 0).length,
    resume: ranked.filter((r) => r.ranking.resumePct !== null).length,
    interview: ranked.filter((r) => r.ranking.interviewPct !== null).length,
    complete: ranked.filter((r) => r.ranking.complete).length,
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const passes = (r: RankedRow) => {
      if (filter === "engaged" && r.engagementPoints <= 0) return false;
      if (filter === "resume" && r.ranking.resumePct === null) return false;
      if (filter === "interview" && r.ranking.interviewPct === null) return false;
      if (filter === "complete" && !r.ranking.complete) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || (r.email ?? "").includes(q) || r.aliases.some((a) => a.includes(q));
    };
    const list = ranked.filter(passes);
    const num = (n: number | null) => (n === null ? -1 : n);
    if (sort === "name") return [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "engagement") return [...list].sort((a, b) => b.ranking.engagementPct - a.ranking.engagementPct || a.name.localeCompare(b.name));
    if (sort === "resume") return [...list].sort((a, b) => num(b.ranking.resumePct) - num(a.ranking.resumePct) || a.name.localeCompare(b.name));
    if (sort === "interview") return [...list].sort((a, b) => num(b.ranking.interviewPct) - num(a.ranking.interviewPct) || a.name.localeCompare(b.name));
    return list;
  }, [ranked, search, filter, sort]);

  // The cutoff line is only meaningful on the full, composite-sorted list.
  const showCutoff = sort === "composite" && filter === "all" && !search.trim() && settings.acceptingCount > 0;

  function saveAccepting() {
    const value = Number(accepting);
    if (value === settings.acceptingCount) return;
    startTransition(async () => {
      const result = await updateRecruitSettingsAction({ acceptingCount: value });
      if (result.error) {
        toast.error(result.error);
        setAccepting(String(settings.acceptingCount));
        return;
      }
      router.refresh();
    });
  }

  function exportCsv() {
    const rows: ExportRow[] = visible.map((r) => {
      const resume = summaries.resume[r.id];
      const interview = summaries.interview[r.id];
      return {
        rank: r.ranking.rank,
        name: r.name,
        email: r.email ?? "",
        composite: r.ranking.composite,
        engagementPoints: r.engagementPoints,
        engagementPct: r.ranking.engagementPct,
        resumeRaw: resume?.raw ?? null,
        resumeAdjusted: resume?.normalized ?? null,
        resumePct: r.ranking.resumePct,
        interviewRaw: interview?.raw ?? null,
        interviewAdjusted: interview?.normalized ?? null,
        interviewPct: r.ranking.interviewPct,
        complete: r.ranking.complete,
      };
    });
    downloadCsv(`applicants-${new Date().toISOString().slice(0, 10)}.csv`, decisionCsv(rows));
  }

  if (ranked.length === 0) {
    return (
      <Card className="mt-4">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <UserPlus className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">No applicants yet this quarter</p>
            <p className="text-sm text-muted-foreground">
              Add the first one by hand, or use Import list to add everyone from an info session at once.
            </p>
          </div>
          {addButton}
        </CardContent>
      </Card>
    );
  }

  const funnel: { key: Filter; label: string }[] = [
    { key: "all", label: "All applicants" },
    { key: "engaged", label: "Engaged" },
    { key: "resume", label: "Resume scored" },
    { key: "interview", label: "Interviewed" },
    { key: "complete", label: "Complete" },
  ];

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {funnel.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-xl border p-3 text-left transition-colors ${filter === f.key ? "border-foreground" : "border-border hover:bg-muted/50"}`}
          >
            <div className="text-xl font-semibold tabular-nums">{counts[f.key]}</div>
            <div className="text-xs text-muted-foreground">{f.label}</div>
          </button>
        ))}
      </div>

      {(duplicateCount > 0 || toMarkCount > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
          <b>To do:</b>
          {toMarkCount > 0 && (
            <button type="button" className="underline-offset-2 hover:underline" onClick={onReviewAttendance}>
              {toMarkCount} booking{toMarkCount === 1 ? "" : "s"} to mark →
            </button>
          )}
          {duplicateCount > 0 && (
            <button type="button" className="underline-offset-2 hover:underline" onClick={onReviewDuplicates}>
              {duplicateCount} possible duplicate{duplicateCount === 1 ? "" : "s"} →
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search applicants" placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={sort} onValueChange={(v) => v && setSort(v as Sort)}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue>{(value: string) => SORT_LABEL[value as Sort]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABEL) as Sort[]).map((s) => (
              <SelectItem key={s} value={s}>
                {SORT_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="inline-flex overflow-hidden rounded-lg border text-xs" role="group" aria-label="Score type">
          {([true, false] as const).map((v) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={useNormalized === v}
              onClick={() => onToggleNormalized(v)}
              className={`px-3 py-1.5 ${useNormalized === v ? "bg-foreground text-background" : "hover:bg-muted"}`}
              title={v ? "Scores evened out between easy and tough graders" : "Scores exactly as reviewers gave them"}
            >
              {v ? "Adjusted" : "Raw"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Accepting ~
          <Input
            aria-label="How many you are accepting"
            className="h-8 w-16"
            type="number"
            min="0"
            value={accepting}
            disabled={isPending}
            onChange={(e) => setAccepting(e.target.value)}
            onBlur={saveAccepting}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
        </label>
        <Button size="sm" variant="outline" onClick={exportCsv}>
          <Download />
          Export CSV
        </Button>
      </div>

      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No one matches that.</p>
      ) : (
        <ul className="rounded-xl border">
          {visible.map((r, index) => (
            <li key={r.id}>
              {showCutoff && index === settings.acceptingCount && (
                <div className="flex items-center gap-2 px-3 py-1 text-xs font-medium text-red-700 dark:text-red-400">
                  <div className="flex-1 border-t-2 border-dashed border-current" />
                  Cutoff · accepting ~{settings.acceptingCount}
                  <div className="flex-1 border-t-2 border-dashed border-current" />
                </div>
              )}
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                className={`flex w-full items-center gap-3 border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/50 ${
                  r.onBubble && showCutoff ? "bg-amber-50/70 dark:bg-amber-500/10" : ""
                }`}
              >
                <span className="w-6 text-sm tabular-nums text-muted-foreground">{sort === "composite" ? r.ranking.rank : ""}</span>
                <ScoreRing value={Math.round(r.ranking.composite)} fraction={r.ranking.composite / 100} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{r.name}</span>
                    {r.hasPrevious && <Badge variant="secondary">Previously applied</Badge>}
                    {!r.ranking.complete && <Badge variant="outline">Incomplete</Badge>}
                    {r.onBubble && showCutoff && <Badge className="bg-amber-100 text-amber-900">On the bubble</Badge>}
                    {r.disagree && <Badge variant="destructive">Reviewers disagree</Badge>}
                  </span>
                  <span className="mt-1 flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Bar pct={r.ranking.engagementPct} className="bg-blue-500" label="Engagement" />
                      <Bar pct={r.ranking.resumePct} className="bg-orange-400" label="Resume" />
                      <Bar pct={r.ranking.interviewPct} className="bg-emerald-500" label="Interview" />
                    </span>
                    <span className="flex items-center gap-1">
                      <Dot filled={r.engagementPoints > 0} label="Engagement" />
                      <Dot filled={r.ranking.resumePct !== null} label="Resume scored" />
                      <Dot filled={r.ranking.interviewPct !== null} label="Interviewed and scored" />
                    </span>
                    {Math.abs(r.ranking.normalizationDelta) >= 1 && (
                      <span className="text-xs text-muted-foreground">
                        adjusting moves them {r.ranking.normalizationDelta > 0 ? "+" : ""}
                        {r.ranking.normalizationDelta.toFixed(1)}
                      </span>
                    )}
                  </span>
                </span>
                <span className="hidden text-xs text-muted-foreground tabular-nums sm:block">{r.total} pts</span>
              </button>
            </li>
          ))}
          {showCutoff && settings.acceptingCount >= visible.length && (
            <li className="flex items-center gap-2 px-3 py-1 text-xs font-medium text-red-700 dark:text-red-400">
              <div className="flex-1 border-t-2 border-dashed border-current" />
              Cutoff · accepting ~{settings.acceptingCount} (everyone is above the line)
              <div className="flex-1 border-t-2 border-dashed border-current" />
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Ranking section in the side panel**

In `applicant-panel.tsx` add a prop `ranking: RankedRow["ranking"] | null` (import the type from `./ranked-row`) through `ApplicantPanel` → `PanelBody`, and import `explainComposite`. Add before the "Scores" section:

```tsx
        {ranking && (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Ranking</h3>
            <div className="rounded-lg border p-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span>
                  Rank <b>#{ranking.rank}</b> · composite <b>{ranking.composite.toFixed(1)}</b>
                </span>
                {!ranking.complete && <Badge variant="outline">Incomplete</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{explainComposite(ranking)}</p>
              {!ranking.complete && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Missing sections are left out and the weights are rebalanced, so this will change once they&apos;re scored.
                </p>
              )}
            </div>
          </section>
        )}
```

- [ ] **Step 3: Workspace wiring and help text**

In `applicants-workspace.tsx`: render
`<ApplicantsView ranked={ranked} settings={scoring.settings} useNormalized={useNormalized} onToggleNormalized={setUseNormalized} summaries={scoring.summaries} duplicateCount={pairs.length} toMarkCount={attendance.toMark.length} onReviewDuplicates={() => setTab("duplicates")} onReviewAttendance={() => setTab("attendance")} onSelect={setSelectedId} addButton={<AddApplicantDialog quarterId={quarterId} />} />`
(removing the old `rows`/`categories`/`events`/`quarterId` props); pass `ranking={ranked.find((r) => r.id === selectedId)?.ranking ?? null}` to `ApplicantPanel`.

In `how-it-works.tsx` replace the list items with:

```tsx
          <li>Each applicant gets one <b>composite score</b> out of 100: engagement, resume and interview, weighted the way you set in <b>Setup</b>.</li>
          <li>The dashed <b>cutoff line</b> sits after the number you&apos;re accepting. Applicants just above and below it are marked <b>on the bubble</b>.</li>
          <li><b>Adjusted</b> scores even out easy and tough graders; <b>Raw</b> shows scores exactly as given. Flip between them to see who moves.</li>
          <li><b>Incomplete</b> means a resume or interview score is still missing — their composite uses what exists and updates as scores come in.</li>
          <li>Click an applicant for the full breakdown, points history and notes. <b>Export CSV</b> downloads exactly what you&apos;re looking at.</li>
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all pass.

Manual (migrations from pieces 2–3 applied): with a few applicants spanning all sections, confirm the ring, three bars and dots; change "Accepting ~" and watch the dashed line and bubble move; switch Raw/Adjusted and watch rows reorder and "adjusting moves them" appear; Incomplete chip on partially scored applicants; search/filter hides the cutoff line; Export CSV opens with the visible rows; side panel shows the formula.

- [ ] **Step 5: Commit**

```bash
git add "src/app/portal/(app)/admin/applicants"
git commit -m "Add decision leaderboard with cutoff line, bubble, toggle and CSV export"
```

---

### Task 5: Decision settings card

**Files:**
- Create: `src/app/portal/(app)/admin/applicants/decision-settings.tsx`
- Modify: `src/app/portal/(app)/admin/applicants/setup-view.tsx`

**Interfaces:**
- Consumes: `updateRecruitSettingsAction`, `RecruitSettings`, `validateRecruitSettings`.
- Produces: `DecisionSettingsCard` props `{ settings: RecruitSettings }`.

- [ ] **Step 1: The card**

Create `src/app/portal/(app)/admin/applicants/decision-settings.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateRecruitSettingsAction } from "@/actions/recruit";
import { validateRecruitSettings, type RecruitSettings } from "@/lib/recruit-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";

export function DecisionSettingsCard({ settings }: { settings: RecruitSettings }) {
  const [isPending, startTransition] = useTransition();
  const [engagement, setEngagement] = useState(String(settings.weightEngagement));
  const [resume, setResume] = useState(String(settings.weightResume));
  const [interview, setInterview] = useState(String(settings.weightInterview));
  const [fullMarks, setFullMarks] = useState(String(settings.engagementFullMarks));
  const [accepting, setAccepting] = useState(String(settings.acceptingCount));
  const [bubble, setBubble] = useState(String(settings.bubbleWidth));
  const router = useRouter();

  const next: Partial<RecruitSettings> = {
    weightEngagement: Number(engagement),
    weightResume: Number(resume),
    weightInterview: Number(interview),
    engagementFullMarks: Number(fullMarks),
    acceptingCount: Number(accepting),
    bubbleWidth: Number(bubble),
  };
  const total = Number(engagement) + Number(resume) + Number(interview);
  const problem = validateRecruitSettings(next);
  const dirty = (Object.keys(next) as (keyof RecruitSettings)[]).some((k) => next[k] !== settings[k]);

  function save() {
    startTransition(async () => {
      const result = await updateRecruitSettingsAction(next);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Ranking settings saved — the leaderboard has been recalculated.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ranking settings</CardTitle>
        <CardDescription>How engagement, resume and interview combine into the final composite score.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FieldGroup>
          <Field>
            <FieldLabel>How much each section counts (must total 100)</FieldLabel>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {[
                ["Engagement", engagement, setEngagement],
                ["Resume", resume, setResume],
                ["Interview", interview, setInterview],
              ].map(([label, value, set]) => (
                <label key={label as string} className="flex items-center gap-1.5">
                  {label as string}
                  <Input
                    aria-label={`${label as string} weight`}
                    type="number"
                    min="0"
                    className="w-20"
                    value={value as string}
                    onChange={(e) => (set as (v: string) => void)(e.target.value)}
                  />
                  %
                </label>
              ))}
              <span className={Math.abs(total - 100) > 0.01 ? "text-red-700 dark:text-red-400" : "text-muted-foreground"}>
                Total: {Number.isFinite(total) ? Math.round(total * 100) / 100 : "–"}
              </span>
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="full-marks">Engagement points for full marks</FieldLabel>
            <Input id="full-marks" type="number" min="0" step="0.5" className="w-28" value={fullMarks} onChange={(e) => setFullMarks(e.target.value)} />
            <FieldDescription>
              This many engagement points counts as a perfect engagement score. Anyone above it is capped at 100%, so one very
              keen applicant doesn&apos;t change anyone else&apos;s score.
            </FieldDescription>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="accepting">How many you&apos;re accepting</FieldLabel>
              <Input id="accepting" type="number" min="0" className="w-28" value={accepting} onChange={(e) => setAccepting(e.target.value)} />
              <FieldDescription>Where the dashed cutoff line sits.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="bubble">&ldquo;On the bubble&rdquo; width</FieldLabel>
              <Input id="bubble" type="number" min="0" className="w-28" value={bubble} onChange={(e) => setBubble(e.target.value)} />
              <FieldDescription>How many applicants either side of the line to highlight.</FieldDescription>
            </Field>
          </div>
        </FieldGroup>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" disabled={isPending || !dirty || !!problem} onClick={save}>
            Save ranking settings
          </Button>
          {dirty && problem && <span className="text-xs text-red-700 dark:text-red-400">{problem}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Mount it**

In `setup-view.tsx` render `<DecisionSettingsCard settings={settings} />` next to the other settings card (the `settings` prop already exists from plan 3).

- [ ] **Step 3: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all pass.

Manual: set weights to 40/30/20 → inline message "weights have to add up to 100 (they add up to 90)" and Save disabled; set 40/30/30 and save → leaderboard recalculates; full marks 0 → blocked.

```bash
git add "src/app/portal/(app)/admin/applicants"
git commit -m "Add ranking settings card for weights, full marks and cutoff"
```

---

### Task 6: Final verification

- [ ] **Step 1: Full verification**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 2: Walk the Review Focus list**

Items 1–4 are covered by Task 1/2 unit tests; item 5's UI half (filters/search hide the cutoff line, the delta chip) needs a manual look once migrations from pieces 2–3 are applied (ask the user first).

- [ ] **Step 3: Hand off**, listing anything unverified (migrations not run against a database, UI not exercised in a browser) and the known limit that the ranking shows un-blinded aggregate scores by design.
