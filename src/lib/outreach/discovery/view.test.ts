import { describe, expect, it } from "vitest";
import { OUTCOME_FILTERS, filterByOutcome, outcomeChip, summarizeCandidates, type CandidateView } from "./view";

const c = (outcome: string, createdAt = "2026-11-03T14:00:00Z"): CandidateView => ({
  id: outcome + createdAt,
  company: "Acme",
  website: "https://acme.com",
  domain: "acme.com",
  outcome,
  reason: null,
  prospectId: null,
  email: null,
  emailSourceUrl: null,
  createdAt,
});

describe("outcomeChip", () => {
  it("shows every outcome as a plain word with a status colour", () => {
    expect(outcomeChip("added")).toEqual({ label: "Added", variant: "ok" });
    expect(outcomeChip("no_email")).toEqual({ label: "No email", variant: "muted" });
    expect(outcomeChip("duplicate")).toEqual({ label: "Already known", variant: "muted" });
    expect(outcomeChip("unreachable")).toEqual({ label: "Couldn't reach", variant: "warn" });
    expect(outcomeChip("no_facts")).toEqual({ label: "Nothing to say", variant: "warn" });
    expect(outcomeChip("error")).toEqual({ label: "Error", variant: "bad" });
  });
  it("copes with an outcome it has not heard of", () => {
    expect(outcomeChip("weird")).toEqual({ label: "weird", variant: "muted" });
  });
});

describe("filterByOutcome", () => {
  const rows = [c("added"), c("no_email"), c("duplicate"), c("unreachable"), c("no_facts"), c("error")];
  it("returns everything for all", () => expect(filterByOutcome(rows, "all")).toHaveLength(6));
  it("returns one outcome", () => expect(filterByOutcome(rows, "added").map((r) => r.outcome)).toEqual(["added"]));
  it("groups the outcomes that need a human look under Problems", () => {
    expect(filterByOutcome(rows, "problems").map((r) => r.outcome).sort()).toEqual(["error", "no_facts", "unreachable"]);
  });
  it("offers an All chip first", () => expect(OUTCOME_FILTERS[0].key).toBe("all"));
});

describe("summarizeCandidates", () => {
  const now = new Date("2026-11-03T20:00:00Z"); // noon Pacific
  it("counts what was added and looked at today (Pacific) and over the last 7 days", () => {
    const rows = [
      c("added", "2026-11-03T14:00:00Z"),
      c("no_email", "2026-11-03T14:01:00Z"),
      c("added", "2026-11-02T14:00:00Z"),
      c("no_email", "2026-10-20T14:00:00Z"),
    ];
    expect(summarizeCandidates(rows, now)).toMatchObject({ addedToday: 1, lookedAtToday: 2, lookedAtWeek: 3, addedWeek: 2 });
  });
  it("reports the latest activity as the last run", () => {
    const rows = [c("added", "2026-11-03T14:05:00Z"), c("added", "2026-11-03T14:00:00Z")];
    expect(summarizeCandidates(rows, now).lastRunAt?.toISOString()).toBe("2026-11-03T14:05:00.000Z");
  });
  it("has no last run before anything was looked at", () => {
    expect(summarizeCandidates([], now)).toMatchObject({ addedToday: 0, lookedAtToday: 0, lastRunAt: null });
  });
});
