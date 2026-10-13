import { describe, expect, it } from "vitest";
import { assignReviewers, exclusionKey, resumeVisibility, reviewState, selfExclusions } from "./recruit-assignment";

const ids = (n: number, p: string) => Array.from({ length: n }, (_, i) => `${p}${i}`);

describe("assignReviewers", () => {
  it("gives every applicant exactly N distinct reviewers, balanced within one", () => {
    const applicantIds = ids(51, "a");
    const pool = ids(6, "r");
    const r = assignReviewers({ applicantIds, pool, perApplicant: 2, excluded: new Set(), existing: [], seed: 7 });
    if (!r.ok) throw new Error("expected ok");
    expect(r.added).toHaveLength(102);
    for (const a of applicantIds) {
      const mine = r.added.filter((x) => x.applicantId === a).map((x) => x.reviewerId);
      expect(new Set(mine).size).toBe(2);
    }
    const loads = pool.map((p) => r.added.filter((x) => x.reviewerId === p).length);
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(1);
  });

  it("is deterministic for a seed", () => {
    const base = { applicantIds: ids(10, "a"), pool: ids(6, "r"), perApplicant: 2, excluded: new Set<string>(), existing: [] };
    expect(assignReviewers({ ...base, seed: 3 })).toEqual(assignReviewers({ ...base, seed: 3 }));
  });

  it("never assigns an excluded reviewer", () => {
    const excluded = new Set([exclusionKey("a0", "r0"), exclusionKey("a0", "r1")]);
    const r = assignReviewers({ applicantIds: ["a0"], pool: ids(4, "r"), perApplicant: 2, excluded, existing: [], seed: 1 });
    if (!r.ok) throw new Error("expected ok");
    expect(r.added.map((x) => x.reviewerId).sort()).toEqual(["r2", "r3"]);
  });

  it("refuses, and assigns nothing, when too few reviewers are eligible", () => {
    const r = assignReviewers({ applicantIds: ["a0", "a1"], pool: ["r0"], perApplicant: 2, excluded: new Set(), existing: [], seed: 1 });
    expect(r).toEqual({ ok: false, applicantId: expect.any(String), need: 2, eligible: 1 });
  });

  it("is idempotent and only tops up shortfalls", () => {
    const base = { applicantIds: ids(8, "a"), pool: ids(6, "r"), perApplicant: 2, excluded: new Set<string>(), seed: 5 };
    const first = assignReviewers({ ...base, existing: [] });
    if (!first.ok) throw new Error("expected ok");
    const again = assignReviewers({ ...base, existing: first.added });
    expect(again).toEqual({ ok: true, added: [] });
    const grown = assignReviewers({ ...base, applicantIds: [...base.applicantIds, "new"], existing: first.added });
    if (!grown.ok) throw new Error("expected ok");
    expect(grown.added.every((x) => x.applicantId === "new")).toBe(true);
    expect(grown.added).toHaveLength(2);
  });

  it("counts existing assignments toward N", () => {
    const r = assignReviewers({
      applicantIds: ["a0"], pool: ids(4, "r"), perApplicant: 2, excluded: new Set(),
      existing: [{ applicantId: "a0", reviewerId: "r0" }], seed: 1,
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.added).toHaveLength(1);
    expect(r.added[0].reviewerId).not.toBe("r0");
  });
});

describe("selfExclusions", () => {
  it("excludes an exec who is also an applicant (email match, case-insensitive)", () => {
    const s = selfExclusions([{ id: "a1", email: "Sam@ucsc.edu" }, { id: "a2", email: null }], [{ id: "r1", email: "sam@ucsc.edu" }]);
    expect([...s]).toEqual([exclusionKey("a1", "r1")]);
  });
});

describe("reviewState", () => {
  it("is unassigned with no reviewers", () => {
    expect(reviewState([], [], false)).toMatchObject({ status: "unassigned", unlocked: false });
  });
  it("tracks progress and unlocks only when every assigned reviewer has submitted", () => {
    expect(reviewState(["a", "b"], [], false)).toMatchObject({ status: "not-started", unlocked: false, submitted: 0 });
    expect(reviewState(["a", "b"], ["a"], false)).toMatchObject({ status: "in-progress", unlocked: false, submitted: 1 });
    expect(reviewState(["a", "b"], ["a", "b"], false)).toMatchObject({ status: "complete", unlocked: true });
  });
  it("ignores submissions from people who are not assigned", () => {
    expect(reviewState(["a", "b"], ["a", "x", "y"], false)).toMatchObject({ unlocked: false, submitted: 1 });
  });
  it("force reveal unlocks early", () => {
    expect(reviewState(["a", "b"], ["a"], true)).toMatchObject({ status: "revealed", unlocked: true });
  });
});

describe("resumeVisibility", () => {
  const reviews = [
    { reviewerId: "me", submitted: true },
    { reviewerId: "x", submitted: true },
    { reviewerId: "y", submitted: false },
  ];
  it("hides everyone else, even after I submitted, while locked", () => {
    const v = resumeVisibility("me", reviews, false);
    expect(v.mine).toBe(reviews[0]);
    expect(v.others).toEqual([]);
  });
  it("shows other submitted reviews once unlocked", () => {
    expect(resumeVisibility("me", reviews, true).others).toEqual([reviews[1]]);
  });
  it("returns no review for me when I have none", () => {
    expect(resumeVisibility("zzz", reviews, false).mine).toBeNull();
  });
});
