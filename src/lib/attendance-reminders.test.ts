import { describe, expect, it } from "vitest";
import { isReminderHour, selectReminders, type ReminderLead } from "./attendance-reminders";

describe("isReminderHour", () => {
  it("is true at 21:30 Pacific in summer (PDT, 04:30 UTC next day)", () => {
    expect(isReminderHour(new Date("2026-09-30T04:30:00Z"))).toBe(true);
  });
  it("is false at 22:30 Pacific in summer (05:30 UTC)", () => {
    expect(isReminderHour(new Date("2026-09-30T05:30:00Z"))).toBe(false);
  });
  it("is true at 21:30 Pacific in winter (PST, 05:30 UTC next day)", () => {
    expect(isReminderHour(new Date("2026-12-02T05:30:00Z"))).toBe(true);
  });
  it("is false at 20:30 Pacific in winter (04:30 UTC)", () => {
    expect(isReminderHour(new Date("2026-12-02T04:30:00Z"))).toBe(false);
  });
});

const today = "2026-09-29";
const projects = [
  { id: "p1", name: "Acme" },
  { id: "p2", name: "Globex" },
];
const lead = (projectId: string, email: string | null, archivedAt: string | null = null): ReminderLead => ({
  projectId,
  email,
  archivedAt,
});
const base = {
  today,
  meetingDates: [today],
  projects,
  loggedProjectIds: [] as string[],
  leads: [lead("p1", "a@x.com"), lead("p2", "b@x.com")],
};

describe("selectReminders", () => {
  it("reminds every lead of projects with no attendance", () => {
    expect(selectReminders(base)).toEqual([
      { projectId: "p1", projectName: "Acme", date: today, to: "a@x.com" },
      { projectId: "p2", projectName: "Globex", date: today, to: "b@x.com" },
    ]);
  });

  it("returns nothing when today is not a meeting day", () => {
    expect(selectReminders({ ...base, meetingDates: ["2026-09-30"] })).toEqual([]);
  });

  it("skips projects whose attendance is already logged", () => {
    const result = selectReminders({ ...base, loggedProjectIds: ["p1"] });
    expect(result.map((r) => r.projectId)).toEqual(["p2"]);
  });

  it("skips projects with no leads", () => {
    const result = selectReminders({ ...base, leads: [lead("p2", "b@x.com")] });
    expect(result.map((r) => r.projectId)).toEqual(["p2"]);
  });

  it("skips archived leads", () => {
    const result = selectReminders({
      ...base,
      leads: [lead("p1", "a@x.com", "2026-09-01T00:00:00Z"), lead("p1", "c@x.com")],
    });
    expect(result.map((r) => r.to)).toEqual(["c@x.com"]);
  });

  it("emails each lead of a project once, even with duplicate or differently-cased rows", () => {
    const result = selectReminders({
      ...base,
      leads: [lead("p1", "a@x.com"), lead("p1", "A@x.com"), lead("p1", "d@x.com")],
    });
    expect(result.map((r) => r.to)).toEqual(["a@x.com", "d@x.com"]);
  });

  it("sends a lead on two projects one email per project", () => {
    const result = selectReminders({ ...base, leads: [lead("p1", "a@x.com"), lead("p2", "a@x.com")] });
    expect(result.map((r) => [r.projectId, r.to])).toEqual([
      ["p1", "a@x.com"],
      ["p2", "a@x.com"],
    ]);
  });

  it("skips leads with a missing or blank email", () => {
    const result = selectReminders({
      ...base,
      leads: [lead("p1", null), lead("p1", "  "), lead("p1", "a@x.com")],
    });
    expect(result.map((r) => r.to)).toEqual(["a@x.com"]);
  });
});
