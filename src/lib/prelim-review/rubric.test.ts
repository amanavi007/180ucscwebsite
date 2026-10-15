import { describe, expect, it } from "vitest";
import { STARTER_RUBRICS, computeVerdict, criteriaSchema, normalizeResults } from "./rubric";

const criteria = [
  { id: "sources", title: "Sources", description: "Every claim has a source." },
  { id: "format", title: "Format", description: "Matches the guide." },
];

describe("criteriaSchema", () => {
  it("accepts the starter rubrics", () => {
    for (const kind of ["doc", "slides"] as const) {
      expect(criteriaSchema.safeParse(STARTER_RUBRICS[kind].criteria).success).toBe(true);
    }
  });
  it("rejects duplicate ids and bad ids", () => {
    expect(criteriaSchema.safeParse([criteria[0], criteria[0]]).success).toBe(false);
    expect(criteriaSchema.safeParse([{ ...criteria[0], id: "Has Space" }]).success).toBe(false);
    expect(criteriaSchema.safeParse([]).success).toBe(false);
  });
});

describe("normalizeResults", () => {
  it("returns exactly one result per criterion, in rubric order", () => {
    const out = normalizeResults(criteria, [
      { criterionId: "format", status: "pass", evidence: "", suggestion: "" },
      { criterionId: "sources", status: "fix", evidence: "p2", suggestion: "Cite it." },
    ]);
    expect(out.map((r) => r.criterionId)).toEqual(["sources", "format"]);
  });
  it("drops unknown ids and keeps the first of duplicates", () => {
    const out = normalizeResults(criteria, [
      { criterionId: "nope", status: "pass", evidence: "", suggestion: "" },
      { criterionId: "sources", status: "pass", evidence: "", suggestion: "" },
      { criterionId: "sources", status: "missing", evidence: "", suggestion: "" },
    ]);
    expect(out.find((r) => r.criterionId === "sources")?.status).toBe("pass");
    expect(out).toHaveLength(2);
  });
  it("turns an omitted criterion into a fix asking for a re-run", () => {
    const out = normalizeResults(criteria, []);
    expect(out.every((r) => r.status === "fix")).toBe(true);
    expect(out[0].suggestion).toMatch(/run the review again/i);
  });
});

describe("computeVerdict", () => {
  it("is ready only when every result passes", () => {
    const pass = { criterionId: "a", status: "pass" as const, evidence: "", suggestion: "" };
    expect(computeVerdict([pass, pass])).toBe("ready");
    expect(computeVerdict([pass, { ...pass, status: "fix" }])).toBe("needs_work");
    expect(computeVerdict([])).toBe("needs_work");
  });
});
