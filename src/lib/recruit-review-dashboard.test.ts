import { describe, expect, it } from "vitest";
import { buildReviewDashboard, dashboardCsv, filterDashboardApplicants } from "./recruit-review-dashboard";

const summary = { raw: 4, normalized: 3.8, count: 2, spread: 2, anyNormalized: true };
const base = {
  applicants: [
    { id: "a1", name: "Ann", email: null },
    { id: "a2", name: "Bo", email: null },
    { id: "a3", name: "Cy", email: null },
  ],
  reviewerNames: new Map([["r1", "Rae"], ["r2", "Sam"]]),
  assignments: [
    { applicantId: "a1", reviewerId: "r1" }, { applicantId: "a1", reviewerId: "r2" },
    { applicantId: "a2", reviewerId: "r1" }, { applicantId: "a2", reviewerId: "r2" },
  ],
  submitted: new Map([["a1", new Set(["r1", "r2"])], ["a2", new Set(["r1"])]]),
  revealed: new Set<string>(),
  summaries: { a1: summary, a2: summary },
  disagreementThreshold: 1.5,
};

describe("buildReviewDashboard", () => {
  it("exposes scores only for unlocked applicants", () => {
    const d = buildReviewDashboard(base);
    const byId = Object.fromEntries(d.applicants.map((a) => [a.id, a]));
    expect(byId.a1).toMatchObject({ raw: 4, normalized: 3.8, disagree: true, state: { status: "complete" } });
    expect(byId.a2).toMatchObject({ raw: null, normalized: null, disagree: false, state: { status: "in-progress" } });
    expect(byId.a3.state.status).toBe("unassigned");
  });
  it("counts per-reviewer progress and totals", () => {
    const d = buildReviewDashboard(base);
    expect(d.reviewers).toEqual([
      { id: "r1", name: "Rae", assigned: 2, done: 2 },
      { id: "r2", name: "Sam", assigned: 2, done: 1 },
    ]);
    expect(d.totals).toEqual({ applicants: 3, complete: 1, unassigned: 1 });
  });
  it("force reveal exposes scores early", () => {
    const d = buildReviewDashboard({ ...base, revealed: new Set(["a2"]) });
    expect(d.applicants.find((a) => a.id === "a2")).toMatchObject({ raw: 4, state: { status: "revealed" } });
  });
});

describe("filterDashboardApplicants", () => {
  const { applicants } = buildReviewDashboard(base);
  it("filters by status group", () => {
    expect(filterDashboardApplicants(applicants, "needs", "").map((a) => a.id)).toEqual(["a3"]);
    expect(filterDashboardApplicants(applicants, "in-progress", "").map((a) => a.id)).toEqual(["a2"]);
    expect(filterDashboardApplicants(applicants, "complete", "").map((a) => a.id)).toEqual(["a1"]);
    expect(filterDashboardApplicants(applicants, "all", "")).toHaveLength(3);
  });
  it("searches names and emails case-insensitively", () => {
    expect(filterDashboardApplicants(applicants, "all", "  BO ").map((a) => a.id)).toEqual(["a2"]);
  });
});

describe("dashboardCsv", () => {
  it("never writes scores for locked applicants", () => {
    const { applicants } = buildReviewDashboard(base);
    const { headers, rows } = dashboardCsv(applicants);
    expect(headers).toEqual(["Applicant", "Email", "Status", "Reviewers submitted", "Reviewers assigned", "Raw", "Adjusted", "Disagree"]);
    expect(rows[0]).toEqual(["Ann", "", "Complete", 2, 2, "4.00", "3.80", "yes"]);
    expect(rows[1]).toEqual(["Bo", "", "In progress", 1, 2, "", "", "no"]);
    expect(rows[2]).toEqual(["Cy", "", "Needs reviewers", 0, 0, "", "", "no"]);
  });
});
