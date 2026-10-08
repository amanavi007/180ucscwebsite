import { describe, expect, it } from "vitest";
import {
  runApplicantDetail,
  runPersonDetail,
  runProjectAttendance,
  runScheduling,
  runTeamAttendanceStatus,
} from "./read-tools-more";
import { runUpcomingEvents } from "./read-tools";
import type { DataAccess, ToolDeps } from "./types";

const deps = (over: Partial<DataAccess>, role: ToolDeps["profile"]["role"] = "president"): ToolDeps => ({
  profile: { id: "u1", name: "Me", role },
  rowCap: 10,
  data: { activeQuarter: async () => ({ id: "q", name: "Fall" }), ...over } as DataAccess,
});

const applicants = [
  { id: "a1", name: "Jo Park", email: null, major: "Econ", year: "2", notes: "", total: 7, entries: [
    { id: "e1", category: "Coffee chat", event: null, points: 5, reason: null, voided: false },
    { id: "e2", category: "Info session", event: "Kickoff", points: 2, reason: null, voided: false },
    { id: "e3", category: "Bonus", event: null, points: 9, reason: "oops", voided: true },
  ] },
];

describe("exec-only reads", () => {
  it("refuse non-execs", async () => {
    const d = deps({}, "consultant");
    expect(await runApplicantDetail(d, "x")).toEqual({ note: expect.stringMatching(/only available to execs/i) });
    expect((await runScheduling(d, "2026-10-07")).note).toMatch(/only available to execs/i);
    expect((await runTeamAttendanceStatus(d, "2026-10-07")).note).toMatch(/only available to execs/i);
  });
});

describe("runApplicantDetail", () => {
  it("lists live point entries and skips voided ones", async () => {
    const r = await runApplicantDetail(deps({ applicants: async () => applicants }), "jo");
    expect(r).toMatchObject({ name: "Jo Park", total: 7 });
    expect((r as { points: string }).points).toBe("Coffee chat: 5; Info session @ Kickoff: 2");
  });
});

describe("runScheduling", () => {
  it("shows only confirmed upcoming bookings, soonest first", async () => {
    const b = (id: string, date: string, status = "confirmed") => ({ kind: "interview" as const, id, who: id, date, start: "10:00:00", end: "10:30:00", status, withExecs: ["Ex"] });
    const r = await runScheduling(deps({ bookings: async () => [b("late", "2026-10-20"), b("past", "2026-10-01"), b("gone", "2026-10-10", "cancelled"), b("soon", "2026-10-09")] }), "2026-10-07");
    expect(r.items.map((i) => i.who)).toEqual(["soon", "late"]);
  });
});

describe("runTeamAttendanceStatus", () => {
  it("only lists teams that are behind", async () => {
    const r = await runTeamAttendanceStatus(
      deps({ teamAttendance: async () => [
        { projectId: "1", client: "Ok", loggedToday: true, missingDates: [] },
        { projectId: "2", client: "Behind", loggedToday: false, missingDates: ["2026-10-01"] },
      ] }),
      "2026-10-07",
    );
    expect(r.items.map((i) => i.team)).toEqual(["Behind"]);
  });
});

describe("runProjectAttendance", () => {
  it("resolves the project by name, newest session first", async () => {
    const r = await runProjectAttendance(
      deps({
        quarterProjects: async () => [{ id: "p1", client_name: "Acme", status: "", health: "", deadline: null, pm: null, sc: null }],
        attendanceHistory: async () => [
          { date: "2026-09-01", takenBy: "A", excused: 0, unexcused: 1, tardy: 0 },
          { date: "2026-09-08", takenBy: "A", excused: 0, unexcused: 0, tardy: 0 },
        ],
      }),
      "acme",
    );
    expect(r.items.map((i) => i.date)).toEqual(["2026-09-08", "2026-09-01"]);
  });
});

describe("runPersonDetail", () => {
  const dir = [{ id: "u9", name: "Priya Patel", role: "Consultant", team: "Acme" }];
  it("hides attendance of other people from non-execs", async () => {
    const d = deps({ directory: async () => dir, tasks: async () => [], attendanceByMember: async () => [{ name: "Priya Patel", team: "Acme", rate: 0.5, unexcused: 1, tardy: 0, excused: 0 }] }, "consultant");
    expect(await runPersonDetail(d, "priya", "2026-10-07")).not.toHaveProperty("attendancePct");
  });
  it("shows attendance to execs", async () => {
    const d = deps({ directory: async () => dir, tasks: async () => [], attendanceByMember: async () => [{ name: "Priya Patel", team: "Acme", rate: 0.5, unexcused: 1, tardy: 0, excused: 0 }] });
    expect(await runPersonDetail(d, "priya", "2026-10-07")).toMatchObject({ attendancePct: 50, teams: "Acme" });
  });
});

describe("runUpcomingEvents filters", () => {
  const events = [
    { date: "2026-10-08", title: "Social", type: "event", time: null, location: "Beach" },
    { date: "2026-12-01", title: "Gala", type: "event", time: null, location: null },
  ];
  it("limits to the next N days and filters by text", async () => {
    const d = deps({ upcomingEvents: async () => events });
    expect((await runUpcomingEvents(d, "2026-10-07", { days: 7 })).items.map((e) => e.title)).toEqual(["Social"]);
    expect((await runUpcomingEvents(d, "2026-10-07", { query: "gala" })).items.map((e) => e.title)).toEqual(["Gala"]);
  });
});
