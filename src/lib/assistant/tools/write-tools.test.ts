import { beforeEach, describe, expect, it, vi } from "vitest";

const { calls, rec, state } = vi.hoisted(() => {
  const calls: [string, unknown[]][] = [];
  const state: { taskResult: { error?: string } } = { taskResult: {} };
  const rec = (name: string) => async (...args: unknown[]) => (calls.push([name, args]), {} as { error?: string });
  return { calls, rec, state };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/actions/calendar", () => ({ createOrgEvent: rec("createOrgEvent"), updateOrgEvent: rec("updateOrgEvent"), deleteOrgEvent: rec("deleteOrgEvent") }));
vi.mock("@/actions/team-profiles", () => ({ approveAll: rec("approveAll") }));
vi.mock("@/actions/attendance", () => ({ submitAttendance: rec("submitAttendance") }));
vi.mock("@/actions/wiki", () => ({ createWikiPage: rec("createWikiPage"), updateWikiPage: rec("updateWikiPage"), deleteWikiPage: rec("deleteWikiPage") }));
vi.mock("@/actions/members", () => ({ archiveMember: rec("archiveMember"), bulkCreateMembers: async () => ({ results: [{ status: "created" }] }), resetMemberPassword: rec("resetMemberPassword"), restoreMember: rec("restoreMember"), updateMemberRole: rec("updateMemberRole") }));
vi.mock("@/actions/recruit", () => ({ addApplicantAction: rec("addApplicantAction"), awardPointsAction: rec("awardPointsAction"), createEventAction: rec("createEventAction"), voidPointsAction: rec("voidPointsAction") }));
vi.mock("@/actions/quarters", () => ({ createQuarter: rec("createQuarter"), deleteQuarter: rec("deleteQuarter"), setActiveQuarter: rec("setActiveQuarter") }));
vi.mock("@/actions/clients", () => ({ createClientRecord: rec("createClientRecord"), mergeClients: rec("mergeClients") }));
vi.mock("@/actions/team-builder", () => ({ applyPlan: rec("applyPlan"), createPlan: rec("createPlan"), finalizePlan: rec("finalizePlan") }));
vi.mock("@/actions/org-settings", () => ({ updateAttendanceAlertThreshold: rec("updateAttendanceAlertThreshold") }));
vi.mock("@/actions/coffee-chat", () => ({ cancelBookingAsAdminAction: rec("cancelCoffee"), generateSlotsAction: rec("generateCoffee"), publishAllSlotsAction: rec("publishCoffee") }));
vi.mock("@/actions/interview", () => ({ cancelInterviewBookingAsAdminAction: rec("cancelInterview"), generateInterviewSlotsAction: rec("generateInterview"), publishAllInterviewSlotsAction: rec("publishInterview"), setInterviewBookingOpenAction: rec("openInterview") }));
vi.mock("@/actions/client-meeting", () => ({ cancelClientMeetingAsAdminAction: rec("cancelClient"), generateClientMeetingSlotsAction: rec("generateClient"), publishAllClientMeetingSlotsAction: rec("publishClient"), setClientMeetingBookingOpenAction: rec("openClient") }));
vi.mock("@/actions/exec-todos", () => ({ createExecTodo: rec("createExecTodo"), toggleExecTodo: rec("toggleExecTodo"), deleteExecTodo: rec("deleteExecTodo") }));
vi.mock("@/actions/projects", () => ({ addMember: rec("addMember"), removeMember: rec("removeMember"), updateProjectStatus: rec("updateProjectStatus"), createProject: rec("createProject"), deleteProject: rec("deleteProject"), setHealthOverride: rec("setHealthOverride") }));
vi.mock("@/actions/quick-links", () => ({ createQuickLink: rec("createQuickLink"), updateQuickLink: rec("updateQuickLink"), deleteQuickLink: rec("deleteQuickLink") }));
vi.mock("@/actions/tasks", () => ({
  createTask: rec("createTask"),
  updateTask: async (...a: unknown[]) => (calls.push(["updateTask", a]), state.taskResult),
  updateTaskDueDate: rec("updateTaskDueDate"),
  deleteTask: rec("deleteTask"),
}));

import { approveProposal, type ProposalStore } from "../proposals";
import { buildWriteTools, registerExecutors } from "./write-tools";
import type { DataAccess, ToolDeps } from "./types";

const data = {
  activeQuarter: async () => ({ id: "q1", name: "Fall" }),
  quarterProjects: async () => [
    { id: "p1", client_name: "Acme Corp", status: "x", health: "on_track", deadline: null, pm: null, sc: null },
    { id: "p2", client_name: "Beta Labs", status: "x", health: "on_track", deadline: null, pm: null, sc: null },
  ],
  directory: async () => [
    { id: "u2", name: "Priya Patel", role: "Consultant", team: null },
    { id: "u3", name: "Sam Lee", role: "Consultant", team: null },
    { id: "u4", name: "Sam Wong", role: "Consultant", team: null },
  ],
  tasks: async () => [
    { id: "t1", task_name: "Market memo", due_date: null, status: "not_started", priority: "medium", task_type: "other", project_id: "p1", project: "Acme Corp", assignee_id: null, assignee: null },
  ],
  projectDetail: async () => ({ id: "p1", client_name: "Acme Corp", status: "", health: "", deadline: null, pm: null, sc: null, members: [{ id: "u2", name: "Priya Patel", team_role: "member" }, { id: "u3", name: "Sam Lee", team_role: "member" }] }),
  wikiPages: async () => [{ id: "w1", parent_id: null, title: "Issue Trees", slug: "issue-trees", section: "consultant", body: "Old body", updated_at: "2026-09-01T00:00:00Z" }],
  recruitSetup: async () => ({ categories: [{ id: "c1", name: "Coffee chat", section: "x", defaultPoints: 3, archived: false }], events: [] }),
  applicants: async () => [{ id: "a1", name: "Jo Park", email: null, major: null, year: null, notes: "", total: 3, entries: [] }],
  bookings: async () => [{ kind: "interview", id: "b1", who: "Jo Park", date: "2999-01-01", start: "10:00:00", end: "10:30:00", status: "confirmed", withExecs: [] }],
  quarters: async () => [{ id: "q1", name: "Fall", start: "", end: "", isActive: true }],
  openExecTodos: async () => [{ id: "e1", title: "Book venue", due_date: null, assigned_to: [] }],
} as unknown as DataAccess;

const deps = (role: ToolDeps["profile"]["role"] = "consultant"): ToolDeps => ({ profile: { id: "u1", name: "Me Myself", role }, rowCap: 10, data });

function setup(role: ToolDeps["profile"]["role"] = "consultant") {
  const inserted: { tool: string; args: Record<string, unknown>; preview: string }[] = [];
  const store: ProposalStore = {
    insert: async (p) => (inserted.push({ tool: p.tool, args: p.args as Record<string, unknown>, preview: p.preview }), { id: `prop${inserted.length}` }),
    claim: async (id) => {
      const p = inserted[Number(id.slice(4)) - 1];
      return { id, tool: p.tool, args: p.args };
    },
    markExecuted: async () => {},
    markFailed: async () => {},
    reject: async () => true,
  };
  const tools = buildWriteTools({ id: "u1", role }, "th", store, deps(role)) as unknown as Record<string, { execute: (a: unknown) => Promise<Record<string, unknown>> }>;
  return { inserted, store, tools };
}

beforeEach(() => {
  calls.length = 0;
  state.taskResult = {};
  registerExecutors();
});

describe("propose_task", () => {
  it("resolves project and assignee names to ids and stores a readable preview", async () => {
    const { tools, inserted } = setup();
    const r = await tools.propose_task.execute({ project: "acme", task: "Draft slides", assignee: "priya", due_date: "2026-10-20", priority: "high" });
    expect(r.status).toBe("awaiting_user_approval");
    expect(inserted[0].args).toMatchObject({ projectId: "p1", assigneeId: "u2", priority: "high", taskType: "other" });
    expect(inserted[0].preview).toBe('Add task "Draft slides" to Acme Corp for Priya Patel, due 2026-10-20 (high priority)');
  });
  it("treats 'me' as the requester", async () => {
    const { tools, inserted } = setup();
    await tools.propose_task.execute({ project: "Acme", task: "X", assignee: "me" });
    expect(inserted[0].args.assigneeId).toBe("u1");
  });
  it("refuses with a question-ready reason when the person is ambiguous, storing nothing", async () => {
    const { tools, inserted } = setup();
    const r = await tools.propose_task.execute({ project: "Acme", task: "X", assignee: "Sam" });
    expect(r).toMatchObject({ status: "refused" });
    expect(String(r.reason)).toMatch(/Sam Lee; Sam Wong/);
    expect(inserted).toHaveLength(0);
  });
  it("refuses an unknown project", async () => {
    const { tools } = setup();
    expect(await tools.propose_task.execute({ project: "Nope", task: "X" })).toMatchObject({ status: "refused" });
  });
});

describe("propose_task_update + executor", () => {
  it("marks a task done through updateTask, using ids resolved at proposal time", async () => {
    const { tools, store } = setup();
    const r = await tools.propose_task_update.execute({ task: "market", status: "done" });
    expect(r.preview).toBe('Update "Market memo" (Acme Corp): status → done');
    const out = await approveProposal(store, { id: "u1", role: "consultant" }, r.proposalId as string, new Date());
    expect(out).toEqual({ ok: true });
    expect(calls).toEqual([["updateTask", ["t1", "p1", { status: "done" }]]]);
  });
  it("routes due dates through updateTaskDueDate", async () => {
    const { tools, store } = setup();
    const r = await tools.propose_task_update.execute({ task: "market", due_date: "2026-11-01" });
    await approveProposal(store, { id: "u1", role: "consultant" }, r.proposalId as string, new Date());
    expect(calls).toEqual([["updateTaskDueDate", ["t1", "p1", "2026-11-01"]]]);
  });
  it("shows the action's own refusal text when a permission check fails", async () => {
    state.taskResult = { error: "You don't have permission to edit this project." };
    const { tools, store } = setup();
    const r = await tools.propose_task_update.execute({ task: "market", status: "done" });
    const out = await approveProposal(store, { id: "u1", role: "consultant" }, r.proposalId as string, new Date());
    expect(out).toEqual({ ok: false, error: "You don't have permission to edit this project." });
  });
});

describe("exec-only writes", () => {
  it("does not even offer exec-only tools to non-execs", () => {
    const { tools } = setup("consultant");
    expect(tools.propose_event).toBeUndefined();
    expect(tools.propose_project_delete).toBeUndefined();
    expect(tools.propose_member_change).toBeUndefined();
    expect(tools.propose_task).toBeDefined();
  });
  it("rejects non-http quick link URLs", async () => {
    const { tools } = setup("president");
    expect(await tools.propose_quick_link.execute({ title: "Bad", url: "javascript:alert(1)" })).toMatchObject({ status: "refused" });
  });
  it("completes and deletes exec to-dos by title", async () => {
    const { tools, store } = setup("president");
    const done = await tools.propose_exec_todo_update.execute({ title: "venue", action: "complete" });
    const del = await tools.propose_exec_todo_update.execute({ title: "venue", action: "delete" });
    await approveProposal(store, { id: "u1", role: "president" }, done.proposalId as string, new Date());
    await approveProposal(store, { id: "u1", role: "president" }, del.proposalId as string, new Date());
    expect(calls).toEqual([["toggleExecTodo", ["e1", true]], ["deleteExecTodo", ["e1"]]]);
  });
});

describe("project actions", () => {
  it("adds a member by name", async () => {
    const { tools, store } = setup("president");
    const r = await tools.propose_project_member.execute({ project: "beta", person: "priya", action: "add" });
    expect(r.preview).toBe("Add Priya Patel to Beta Labs");
    await approveProposal(store, { id: "u1", role: "president" }, r.proposalId as string, new Date());
    expect(calls).toEqual([["addMember", ["p2", "u2"]]]);
  });
});

describe("destructive actions carry a warning so the card asks for confirmation", () => {
  it("project delete", async () => {
    const { tools } = setup("president");
    const r = await tools.propose_project_delete.execute({ project: "acme" });
    expect(r).toMatchObject({ status: "awaiting_user_approval", preview: 'Delete project "Acme Corp"' });
    expect(String(r.warning)).toMatch(/cannot be undone/i);
  });
  it("task delete, member archive, quarter delete, booking cancel all warn; harmless ones do not", async () => {
    const { tools } = setup("president");
    expect((await tools.propose_task_delete.execute({ task: "market" })).warning).toBeTruthy();
    expect((await tools.propose_member_change.execute({ person: "priya", action: "archive", reason: "graduated" })).warning).toBeTruthy();
    expect((await tools.propose_quarter.execute({ action: "delete", name: "fall" })).warning).toBeTruthy();
    expect((await tools.propose_scheduling.execute({ kind: "interview", action: "cancel_booking", who: "jo" })).warning).toBeTruthy();
    expect((await tools.propose_task.execute({ project: "acme", task: "x" })).warning).toBeUndefined();
  });
  it("does nothing until approved", async () => {
    const { tools } = setup("president");
    await tools.propose_project_delete.execute({ project: "acme" });
    expect(calls).toEqual([]);
  });
});

describe("admin tools", () => {
  it("logs attendance listing only the exceptions, resolving names within the team", async () => {
    const { tools, store, inserted } = setup("project_manager");
    const r = await tools.propose_attendance.execute({ project: "acme", date: "2026-10-06", unexcused: ["priya"], tardy: ["sam"] });
    expect(inserted[0].args).toMatchObject({ unexcusedIds: ["u2"], tardyIds: ["u3"], excusedIds: [] });
    await approveProposal(store, { id: "u1", role: "project_manager" }, r.proposalId as string, new Date());
    expect(calls).toEqual([["submitAttendance", [{ projectId: "p1", date: "2026-10-06", excusedIds: [], unexcusedIds: ["u2"], tardyIds: ["u3"] }]]]);
  });
  it("refuses a name that is not on the team", async () => {
    const { tools } = setup("project_manager");
    expect(await tools.propose_attendance.execute({ project: "acme", unexcused: ["Zed"] })).toMatchObject({ status: "refused" });
  });
  it("awards the category's default points when none are given", async () => {
    const { tools, inserted } = setup("president");
    await tools.propose_recruitment.execute({ action: "award_points", applicant: "jo", category: "coffee" });
    expect(inserted[0].args).toMatchObject({ applicantId: "a1", categoryId: "c1", points: 3 });
  });
  it("creates a wiki page with a slug that avoids existing ones", async () => {
    const { tools, inserted } = setup("president");
    await tools.propose_resource_page.execute({ action: "create", title: "Issue Trees", body: "New" });
    expect(inserted[0].args).toMatchObject({ slug: "issue-trees-2", section: "consultant" });
  });
  it("appends to an existing wiki page without losing the old text", async () => {
    const { tools, store, inserted } = setup("president");
    const r = await tools.propose_resource_page.execute({ action: "edit", title: "issue", append: "More." });
    expect(inserted[0].args).toMatchObject({ pageId: "w1", body: "Old body\n\nMore." });
    await approveProposal(store, { id: "u1", role: "president" }, r.proposalId as string, new Date());
    expect(calls[0][0]).toBe("updateWikiPage");
  });
  it("maps a typed role to the role key", async () => {
    const { tools, inserted } = setup("president");
    await tools.propose_member_change.execute({ person: "priya", action: "change_role", role: "Project Manager" });
    expect(inserted[0].args).toMatchObject({ userId: "u2", role: "project_manager" });
  });
  it("cancels the right kind of booking through its own action", async () => {
    const { tools, store } = setup("president");
    const r = await tools.propose_scheduling.execute({ kind: "interview", action: "cancel_booking", who: "jo" });
    await approveProposal(store, { id: "u1", role: "president" }, r.proposalId as string, new Date());
    expect(calls).toEqual([["cancelInterview", ["b1"]]]);
  });
});
