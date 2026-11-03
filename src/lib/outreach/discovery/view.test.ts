import { describe, expect, it } from "vitest";
import { OUTCOME_FILTERS, countsByFilter, filterByOutcome, outcomeChip, outcomesForFilter, parsePage, parsePageSize, summarizeCandidates, type CandidateView } from "./view";

const c = (outcome: string, createdAt = "2026-11-03T14:00:00Z"): CandidateView => ({
  id: outcome + createdAt,
  sourceRef: "acme",
  founders: [],
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
    expect(outcomeChip("ready")).toEqual({ label: "Ready", variant: "info" });
    expect(outcomeChip("no_email")).toEqual({ label: "Retrying", variant: "muted" });
    expect(outcomeChip("failed")).toEqual({ label: "Gave up", variant: "muted" });
    expect(outcomeChip("duplicate")).toEqual({ label: "Already known", variant: "muted" });
    expect(outcomeChip("unreachable")).toEqual({ label: "Retrying", variant: "warn" });
    expect(outcomeChip("no_facts")).toEqual({ label: "Nothing to say", variant: "muted" });
    expect(outcomeChip("error")).toEqual({ label: "Retrying", variant: "warn" });
  });
  it("copes with an outcome it has not heard of", () => {
    expect(outcomeChip("weird")).toEqual({ label: "weird", variant: "muted" });
  });
});

describe("filterByOutcome", () => {
  const rows = [c("added"), c("no_email"), c("duplicate"), c("unreachable"), c("no_facts"), c("error")];
  it("returns everything for all", () => expect(filterByOutcome(rows, "all")).toHaveLength(6));
  it("returns one outcome", () => expect(filterByOutcome(rows, "added").map((r) => r.outcome)).toEqual(["added"]));
  it("groups everything discovery set aside under Skipped", () => {
    expect(filterByOutcome(rows, "skipped").map((r) => r.outcome).sort()).toEqual(["duplicate", "error", "no_email", "no_facts", "unreachable"]);
  });
  it("offers an All chip first", () => expect(OUTCOME_FILTERS[0].key).toBe("all"));
});

describe("outcomesForFilter and countsByFilter", () => {
  it("maps a filter to the database outcomes it covers, and all to none", () => {
    expect(outcomesForFilter("all")).toBeNull();
    expect(outcomesForFilter("ready")).toEqual(["ready"]);
    expect(outcomesForFilter("skipped")).toEqual(["duplicate", "no_email", "unreachable", "error", "failed", "no_facts"]);
    expect(outcomesForFilter("nonsense")).toBeNull();
  });
  it("totals each filter from the per-outcome counts", () => {
    const counts = countsByFilter({ ready: 400, added: 12, no_email: 300, duplicate: 3, unreachable: 5, error: 1 });
    expect(counts).toMatchObject({ all: 721, ready: 400, added: 12, skipped: 309 });
  });
  it("has a Ready filter after All", () => {
    expect(OUTCOME_FILTERS.map((f) => f.key).slice(0, 2)).toEqual(["all", "ready"]);
  });
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

describe("paging", () => {
  it("only allows the offered page sizes", () => {
    expect(parsePageSize("100")).toBe(100);
    expect(parsePageSize("250")).toBe(250);
    expect(parsePageSize("7")).toBe(50);
    expect(parsePageSize(null)).toBe(50);
  });
  it("keeps the page number inside the pages that exist", () => {
    expect(parsePage("3", 1141, 50)).toBe(3);
    expect(parsePage("999", 1141, 50)).toBe(23);
    expect(parsePage("0", 1141, 50)).toBe(1);
    expect(parsePage("abc", 10, 50)).toBe(1);
    expect(parsePage("2", 0, 50)).toBe(1);
  });
});
