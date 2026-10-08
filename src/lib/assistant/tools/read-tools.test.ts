import { describe, expect, it } from "vitest";
import {
  runAttendanceReport,
  runDirectory,
  runMyAttendance,
  runMyOpenTasks,
  runMyProjects,
  runQuarterProjects,
  runTopApplicants,
  runUpcomingEvents,
} from "./read-tools";
import type { DataAccess, ToolDeps } from "./types";

const base: DataAccess = {
  activeQuarter: async () => ({ id: "q1", name: "Fall 2026" }),
  myProjects: async () => [],
  myOpenTasks: async () => [],
  openExecTodos: async () => [],
  upcomingEvents: async () => [],
  topApplicants: async () => [],
  attendanceByMember: async () => [],
  myAttendance: async () => ({ rate: null, unexcused: 0, tardy: 0, excused: 0, totalSessions: 0 }),
  quarterProjects: async () => [],
  directory: async () => [],
};
const deps = (over: Partial<DataAccess> = {}, role: ToolDeps["profile"]["role"] = "consultant", rowCap = 3): ToolDeps => ({
  profile: { id: "u1", name: "Sam", role },
  rowCap,
  data: { ...base, ...over },
});

describe("runMyOpenTasks", () => {
  it("caps rows, reports the true total and flags truncation", async () => {
    const tasks = Array.from({ length: 5 }, (_, i) => ({
      id: `t${i}`, task_name: `T${i}`, due_date: null, status: "not_started", priority: "medium", project: { client_name: "Acme" },
    }));
    const r = await runMyOpenTasks(deps({ myOpenTasks: async () => tasks }));
    expect(r.items).toHaveLength(3);
    expect(r.total).toBe(5);
    expect(r.truncated).toBe(true);
  });
  it("returns an empty result with a note when there is no active quarter", async () => {
    const r = await runMyOpenTasks(deps({ activeQuarter: async () => null }));
    expect(r.items).toEqual([]);
    expect(r.note).toMatch(/no active quarter/i);
  });
  it("returns only compact fields", async () => {
    const r = await runMyOpenTasks(deps({
      myOpenTasks: async () => [{ id: "t", task_name: "A", due_date: "2026-10-09", status: "in_progress", priority: "high", project: { client_name: "Acme" } }],
    }));
    expect(Object.keys(r.items[0]).sort()).toEqual(["due", "priority", "project", "status", "task"]);
  });
});

describe("runMyProjects", () => {
  it("says so when the user has no projects", async () => {
    const r = await runMyProjects(deps());
    expect(r.items).toEqual([]);
    expect(r.note).toMatch(/no projects/i);
  });
});

describe("runUpcomingEvents", () => {
  it("drops past events, sorts ascending and caps", async () => {
    const events = [
      { date: "2026-10-01", title: "old", type: "event", time: null, location: null },
      { date: "2026-10-20", title: "later", type: "event", time: null, location: null },
      { date: "2026-10-09", title: "soon", type: "meeting", time: "6pm", location: "Zoom" },
    ];
    const r = await runUpcomingEvents(deps({ upcomingEvents: async () => events }), "2026-10-07");
    expect(r.items.map((e) => e.title)).toEqual(["soon", "later"]);
  });
});

describe("runTopApplicants", () => {
  it("refuses non-execs without touching data", async () => {
    let called = false;
    const r = await runTopApplicants(deps({ topApplicants: async () => { called = true; return []; } }, "consultant"));
    expect(called).toBe(false);
    expect(r.note).toMatch(/exec/i);
    expect(r.items).toEqual([]);
  });
  it("returns the ranked list for execs, capped", async () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ name: `A${i}`, total: 10 - i }));
    const r = await runTopApplicants(deps({ topApplicants: async () => rows }, "president"));
    expect(r.items).toHaveLength(3);
    expect(r.total).toBe(6);
  });
});

describe("runAttendanceReport", () => {
  const rows = [
    { name: "Ana", team: "Acme", rate: 0.95, unexcused: 0, tardy: 1, excused: 0 },
    { name: "Ben", team: "Beta", rate: 0.5, unexcused: 3, tardy: 0, excused: 1 },
    { name: "Cy", team: null, rate: null, unexcused: 0, tardy: 0, excused: 0 },
    { name: "Dee", team: "Acme", rate: 0.7, unexcused: 2, tardy: 1, excused: 0 },
  ];
  it("refuses non-execs without touching data", async () => {
    let called = false;
    const r = await runAttendanceReport(deps({ attendanceByMember: async () => { called = true; return rows; } }, "consultant"));
    expect(called).toBe(false);
    expect(r.note).toMatch(/exec/i);
  });
  it("lists the lowest rates first, skips members with no rate, as percents", async () => {
    const r = await runAttendanceReport(deps({ attendanceByMember: async () => rows }, "president"));
    expect(r.items.map((i) => i.name)).toEqual(["Ben", "Dee", "Ana"]);
    expect(r.items[0]).toMatchObject({ team: "Beta", ratePct: 50, unexcused: 3 });
  });
  it("says so when there is no attendance data yet", async () => {
    const r = await runAttendanceReport(deps({}, "president"));
    expect(r.items).toEqual([]);
    expect(r.note).toMatch(/no attendance/i);
  });
});

describe("runMyAttendance", () => {
  it("reports the user's own rate as a percent", async () => {
    const r = await runMyAttendance(deps({ myAttendance: async () => ({ rate: 0.875, unexcused: 1, tardy: 0, excused: 0, totalSessions: 8 }) }));
    expect(r.ratePct).toBe(88);
    expect(r.unexcused).toBe(1);
  });
  it("handles no sessions logged yet", async () => {
    const r = await runMyAttendance(deps());
    expect(r.ratePct).toBeNull();
    expect(r.note).toMatch(/no sessions/i);
  });
});

describe("runQuarterProjects", () => {
  it("lists compact project rows and caps", async () => {
    const projects = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`, client_name: `C${i}`, status: "active", health: "on_track", deadline: null, pm: "Pat", sc: null,
    }));
    const r = await runQuarterProjects(deps({ quarterProjects: async () => projects }));
    expect(r.items).toHaveLength(3);
    expect(r.truncated).toBe(true);
    expect(Object.keys(r.items[0]).sort()).toEqual(["client", "deadline", "health", "pm", "sc", "status"]);
  });
  it("handles no active quarter", async () => {
    const r = await runQuarterProjects(deps({ activeQuarter: async () => null }));
    expect(r.note).toMatch(/no active quarter/i);
  });
});

describe("runDirectory", () => {
  const people = [
    { name: "Ana Lee", role: "Consultant", team: "Acme" },
    { name: "Ben Ro", role: "Project Manager", team: "Beta" },
    { name: "Cy Ng", role: "President", team: null },
  ];
  it("filters by name, role or team, case-insensitively", async () => {
    expect((await runDirectory(deps({ directory: async () => people }), "acme")).items.map((p) => p.name)).toEqual(["Ana Lee"]);
    expect((await runDirectory(deps({ directory: async () => people }), "PROJECT MANAGER")).items.map((p) => p.name)).toEqual(["Ben Ro"]);
  });
  it("returns everyone (capped) when no query is given and never includes emails", async () => {
    const r = await runDirectory(deps({ directory: async () => people }), undefined);
    expect(r.items).toHaveLength(3);
    expect(Object.keys(r.items[0]).sort()).toEqual(["name", "role", "team"]);
  });
});

describe("runMyOpenTasks exec to-dos", () => {
  const todos = [
    { title: "Mine", due_date: "2026-10-09", assigned_to: ["u1"] },
    { title: "Anyone", due_date: null, assigned_to: [] },
    { title: "Theirs", due_date: null, assigned_to: ["other"] },
  ];
  it("includes unassigned and own exec to-dos for execs", async () => {
    const r = await runMyOpenTasks(deps({ openExecTodos: async () => todos }, "president"));
    expect(r.items.map((i) => i.task)).toEqual(["Mine", "Anyone"]);
  });
  it("never includes them for non-execs", async () => {
    const r = await runMyOpenTasks(deps({ openExecTodos: async () => todos }));
    expect(r.items).toEqual([]);
  });
});
