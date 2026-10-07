import { describe, expect, it } from "vitest";
import {
  classifyAddResult,
  formatPoints,
  isPlausibleEmail,
  needsEmailChoice,
  normalizeApplicantEmail,
  rankByTotal,
  resolveMerge,
  ringFraction,
  roundPoints,
  sumPoints,
  undoableMergeIds,
  validateAward,
  type MergeSide,
} from "./recruit";

describe("sumPoints", () => {
  it("adds entries and ignores voided ones", () => {
    expect(
      sumPoints([
        { points: 1, voidedAt: null },
        { points: 1, voidedAt: null },
        { points: 5, voidedAt: "2026-10-01T00:00:00Z" },
      ]),
    ).toBe(2);
  });
  it("handles negatives", () => {
    expect(sumPoints([{ points: 1, voidedAt: null }, { points: -1, voidedAt: null }])).toBe(0);
  });
  it("does not leak float error", () => {
    expect(sumPoints([{ points: 0.1, voidedAt: null }, { points: 0.2, voidedAt: null }])).toBe(0.3);
  });
  it("is 0 for no entries", () => {
    expect(sumPoints([])).toBe(0);
  });
});

describe("roundPoints / formatPoints", () => {
  it("rounds to two decimals", () => {
    expect(roundPoints(0.30000000000000004)).toBe(0.3);
  });
  it("formats signs", () => {
    expect(formatPoints(1)).toBe("+1");
    expect(formatPoints(-1)).toBe("-1");
    expect(formatPoints(0)).toBe("0");
    expect(formatPoints(0.5)).toBe("+0.5");
  });
});

describe("validateAward", () => {
  it("accepts positive points without a reason", () => {
    expect(validateAward({ points: 1 })).toBeNull();
  });
  it("accepts zero (excused)", () => {
    expect(validateAward({ points: 0 })).toBeNull();
  });
  it("requires a reason for negative points", () => {
    expect(validateAward({ points: -1 })).toMatch(/reason/i);
    expect(validateAward({ points: -1, reason: "   " })).toMatch(/reason/i);
    expect(validateAward({ points: -1, reason: "No-show, no word" })).toBeNull();
  });
  it("rejects non-finite numbers", () => {
    expect(validateAward({ points: Number.NaN })).toMatch(/number/i);
    expect(validateAward({ points: Number.POSITIVE_INFINITY })).toMatch(/number/i);
  });
});

describe("email helpers", () => {
  it("normalizes and blanks", () => {
    expect(normalizeApplicantEmail("  JKim@UCSC.edu ")).toBe("jkim@ucsc.edu");
    expect(normalizeApplicantEmail("   ")).toBeNull();
    expect(normalizeApplicantEmail(null)).toBeNull();
  });
  it("checks plausibility", () => {
    expect(isPlausibleEmail("a@b.co")).toBe(true);
    expect(isPlausibleEmail("not-an-email")).toBe(false);
    expect(isPlausibleEmail("a@b")).toBe(false);
  });
});

const side = (over: Partial<MergeSide> = {}): MergeSide => ({
  email: null,
  major: null,
  year: null,
  notes: "",
  ...over,
});

describe("resolveMerge", () => {
  it("fills the survivor's gaps from the absorbed record", () => {
    const r = resolveMerge(side({ major: "Econ" }), side({ email: "a@ucsc.edu", major: "Math", year: "2028" }));
    expect(r).toEqual({ ok: true, merged: side({ email: "a@ucsc.edu", major: "Econ", year: "2028" }) });
  });
  it("appends notes when both have some", () => {
    const r = resolveMerge(side({ notes: "Great energy" }), side({ notes: "Asked about PM role" }));
    expect(r.ok && r.merged.notes).toBe("Great energy\n\nAsked about PM role");
  });
  it("keeps whichever side has notes when only one does", () => {
    const r = resolveMerge(side(), side({ notes: "Only here" }));
    expect(r.ok && r.merged.notes).toBe("Only here");
  });
  it("refuses when both have different emails and no choice was made", () => {
    const s = side({ email: "a@ucsc.edu" });
    const a = side({ email: "b@ucsc.edu" });
    expect(needsEmailChoice(s, a)).toBe(true);
    expect(resolveMerge(s, a)).toMatchObject({ ok: false });
  });
  it("accepts a valid email choice", () => {
    const r = resolveMerge(side({ email: "a@ucsc.edu" }), side({ email: "b@ucsc.edu" }), "b@ucsc.edu");
    expect(r.ok && r.merged.email).toBe("b@ucsc.edu");
  });
  it("rejects an email choice that is neither record's email", () => {
    expect(resolveMerge(side({ email: "a@ucsc.edu" }), side({ email: "b@ucsc.edu" }), "c@ucsc.edu")).toMatchObject({
      ok: false,
    });
  });
  it("does not need a choice when emails match or one is missing", () => {
    expect(needsEmailChoice(side({ email: "a@ucsc.edu" }), side({ email: "a@ucsc.edu" }))).toBe(false);
    expect(needsEmailChoice(side({ email: "a@ucsc.edu" }), side())).toBe(false);
  });
});

describe("rankByTotal", () => {
  it("ranks by total desc then name, with ties sharing a rank", () => {
    const ranked = rankByTotal([
      { id: "1", name: "Zed", total: 3 },
      { id: "2", name: "Amy", total: 5 },
      { id: "3", name: "Bob", total: 3 },
    ]);
    expect(ranked.map((r) => [r.name, r.rank])).toEqual([
      ["Amy", 1],
      ["Bob", 2],
      ["Zed", 2],
    ]);
  });
});

describe("ringFraction", () => {
  it("scales against the max and clamps", () => {
    expect(ringFraction(5, 10)).toBe(0.5);
    expect(ringFraction(-2, 10)).toBe(0);
    expect(ringFraction(20, 10)).toBe(1);
  });
  it("is 0 when nobody has points", () => {
    expect(ringFraction(0, 0)).toBe(0);
  });
});

describe("classifyAddResult", () => {
  it("treats needsConfirm as NOT added, so the UI can't claim success", () => {
    expect(classifyAddResult({ needsConfirm: true })).toBe("needs-confirm");
  });
  it("treats an error as an error", () => {
    expect(classifyAddResult({ error: "Someone with that email is already an applicant this quarter." })).toBe("error");
  });
  it("treats an empty result as added", () => {
    expect(classifyAddResult({})).toBe("added");
  });
  it("prefers the error when both are present", () => {
    expect(classifyAddResult({ error: "x", needsConfirm: true })).toBe("error");
  });
});

describe("undoableMergeIds", () => {
  const log = (id: string, survivorId: string, createdAt: string, undoneAt: string | null = null) => ({
    id,
    survivorId,
    createdAt,
    undoneAt,
  });

  it("allows undo of a lone merge", () => {
    expect(undoableMergeIds([log("m1", "A", "2026-10-01T00:00:00Z")])).toEqual(new Set(["m1"]));
  });
  it("only allows the newest merge per survivor (out-of-order undo corrupts records)", () => {
    const ids = undoableMergeIds([log("m1", "A", "2026-10-01T00:00:00Z"), log("m2", "A", "2026-10-02T00:00:00Z")]);
    expect(ids).toEqual(new Set(["m2"]));
  });
  it("keeps merges of different survivors independent", () => {
    const ids = undoableMergeIds([log("m1", "A", "2026-10-01T00:00:00Z"), log("m2", "B", "2026-10-02T00:00:00Z")]);
    expect(ids).toEqual(new Set(["m1", "m2"]));
  });
  it("frees the older merge once the newer one is undone", () => {
    const ids = undoableMergeIds([
      log("m1", "A", "2026-10-01T00:00:00Z"),
      log("m2", "A", "2026-10-02T00:00:00Z", "2026-10-03T00:00:00Z"),
    ]);
    expect(ids).toEqual(new Set(["m1"]));
  });
  it("never offers an already-undone merge", () => {
    expect(undoableMergeIds([log("m1", "A", "2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z")])).toEqual(new Set());
  });
});
