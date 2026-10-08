import { describe, expect, it } from "vitest";
import {
  runAttendanceReport,
  runDirectory,
  runMyAttendance,
  runMyOpenTasks,
  runMyProjects,
  runProjectDetail,
  runQuarterProjects,
  runTasks,
  runNextSteps,
  runWiki,
  runMemberStats,
  runTopApplicants,
  runUpcomingEvents,
} from "./read-tools";
import type { DataAccess, ReadResult, ToolDeps } from "./types";

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
  tasks: async () => [],
  projectDetail: async () => ({ id: "p1", client_name: "Acme", status: "issue_tree", health: "on_track", deadline: null, pm: "Pat", sc: null, members: [] }),
  wikiPages: async () => [],
  quickLinks: async () => [],
  notifications: async () => ({ items: [], unreadCount: 0 }),
  search: async () => [],
  memberStats: async () => [],
  activityLog: async () => [],
  attentionItems: async () => [],
  calendarItems: async () => [],
  applicants: async () => [],
  recruitSetup: async () => ({ categories: [], events: [] }),
  quarters: async () => [],
  clients: async () => [],
  alumni: async () => [],
  bookings: async () => [],
  meetingDates: async () => [],
  teamPlans: async () => [],
  attendanceHistory: async () => [],
  teamAttendance: async () => [],
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
    { id: "a", name: "Ana Lee", role: "Consultant", team: "Acme" },
    { id: "b", name: "Ben Ro", role: "Project Manager", team: "Beta" },
    { id: "c", name: "Cy Ng", role: "President", team: null },
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
    { id: "1", title: "Mine", due_date: "2026-10-09", assigned_to: ["u1"] },
    { id: "2", title: "Anyone", due_date: null, assigned_to: [] },
    { id: "3", title: "Theirs", due_date: null, assigned_to: ["other"] },
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

const task = (over: object) => ({
  id: "t", task_name: "Memo", due_date: null, status: "not_started", priority: "medium", task_type: "other",
  project_id: "p1", project: "Acme", assignee_id: "u2", assignee: "Priya Patel", ...over,
});
const qp = [{ id: "p1", client_name: "Acme Corp", status: "issue_tree", health: "on_track", deadline: null, pm: null, sc: null }];
const dir = [
  { id: "u2", name: "Priya Patel", role: "Consultant", team: "Acme Corp" },
  { id: "u3", name: "Sam Lee", role: "Consultant", team: null },
  { id: "u4", name: "Sam Wong", role: "Consultant", team: null },
];

describe("runTasks", () => {
  it("resolves the assignee by name, hides done tasks by default and can filter overdue", async () => {
    const seen: unknown[] = [];
    const data = {
      quarterProjects: async () => qp,
      directory: async () => dir,
      tasks: async (_q: string, f: unknown) => {
        seen.push(f);
        return [task({ id: "1", due_date: "2026-10-01" }), task({ id: "2", status: "done" }), task({ id: "3", due_date: "2026-12-01" })];
      },
    };
    const r = await runTasks(deps(data), { assignee: "priya", overdueOnly: true }, "2026-10-07");
    expect(seen).toEqual([{ assigneeId: "u2" }]);
    expect(r.items).toHaveLength(1);
  });
  it("tells the model when a name is ambiguous instead of guessing", async () => {
    const r = await runTasks(deps({ directory: async () => dir }), { assignee: "Sam" }, "2026-10-07");
    expect(r.items).toEqual([]);
    expect(r.note).toMatch(/more than one person/i);
  });
});

describe("runProjectDetail", () => {
  it("summarizes tasks and team for one project", async () => {
    const r = await runProjectDetail(
      deps({
        quarterProjects: async () => qp,
        tasks: async () => [task({ id: "1", due_date: "2026-10-01" }), task({ id: "2", status: "done" })],
        projectDetail: async () => ({ id: "p1", client_name: "Acme Corp", status: "issue_tree", health: "at_risk", deadline: null, pm: "Pat", sc: "Sue", members: [{ id: "m1", name: "Pat", team_role: "pm" }, { id: "m2", name: "Ann", team_role: "member" }] }),
      }),
      "acme",
      "2026-10-07",
    );
    expect(r).toMatchObject({ client: "Acme Corp", tasksOpen: 1, tasksDone: 1, tasksOverdue: 1, team: "Pat (PM), Ann" });
  });
  it("returns a note for an unknown project", async () => {
    expect(await runProjectDetail(deps({ quarterProjects: async () => qp }), "zzz", "2026-10-07")).toEqual({ note: expect.stringMatching(/no project/i) });
  });
});

describe("runWiki", () => {
  const pages = [
    { id: "w1", parent_id: null, title: "Onboarding", slug: "onboarding", section: "consultant", body: "Welcome to **180**", updated_at: "2026-09-01T00:00:00Z" },
    { id: "w2", parent_id: null, title: "PM Playbook", slug: "pm", section: "pm", body: "How to run a project", updated_at: "2026-09-02T00:00:00Z" },
  ];
  it("asks the data layer for PM pages only for elevated roles", async () => {
    const asked: boolean[] = [];
    const wikiPages = async (v: boolean) => (asked.push(v), pages);
    await runWiki(deps({ wikiPages }), "x", false);
    await runWiki(deps({ wikiPages }, "project_manager"), "x", false);
    expect(asked).toEqual([false, true]);
  });
  it("returns the page text when asked to read", async () => {
    const r = (await runWiki(deps({ wikiPages: async () => pages }), "onboarding", true)) as { content: string; href: string };
    expect(r.content).toBe("Welcome to **180**");
    expect(r.href).toBe("/portal/resources?section=consultant&page=onboarding");
  });
  it("answers a question with the matching passage and a link, and says so when nothing matches", async () => {
    const hit = (await runWiki(deps({ wikiPages: async () => pages }), "how do I run a project", false)) as ReadResult<{ title: string }>;
    expect(hit.items[0]).toMatchObject({ title: "PM Playbook" });
    const miss = (await runWiki(deps({ wikiPages: async () => pages }), "tax filing", false)) as ReadResult<unknown>;
    expect(miss.note).toMatch(/do not invent/i);
  });
});

describe("runMemberStats", () => {
  it("is exec only", async () => {
    expect((await runMemberStats(deps({}), "overdue")).note).toMatch(/only available to execs/i);
  });
});

describe("runNextSteps", () => {
  it("pairs each project's stage with its nearest tasks and the guide passage for that stage", async () => {
    const r = await runNextSteps(
      deps({
        myProjects: async () => [{ id: "p1", client_name: "Acme", status: "issue_tree", health: "on_track", deadline: null }],
        myOpenTasks: async () => [
          { id: "t1", task_name: "Build tree", due_date: "2026-10-01", status: "in_progress", priority: "high", project: { client_name: "Acme" } },
        ],
        wikiPages: async () => [
          { id: "w", parent_id: null, title: "Issue Trees", slug: "issue-trees", section: "consultant", body: "Split the problem into branches.", updated_at: "2026-09-01T00:00:00Z" },
        ],
      }),
      "2026-10-07",
    );
    expect(r.items[0]).toMatchObject({ project: "Acme", stage: "issue tree", overdue: 1, guideHref: "/portal/resources?section=consultant&page=issue-trees" });
    expect(String(r.items[0].guide)).toMatch(/Issue Trees/);
  });
});
