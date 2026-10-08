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
vi.mock("@/actions/calendar", () => ({ createOrgEvent: rec("createOrgEvent") }));
vi.mock("@/actions/exec-todos", () => ({ createExecTodo: rec("createExecTodo"), toggleExecTodo: rec("toggleExecTodo"), deleteExecTodo: rec("deleteExecTodo") }));
vi.mock("@/actions/projects", () => ({ addMember: rec("addMember"), removeMember: rec("removeMember"), updateProjectStatus: rec("updateProjectStatus") }));
vi.mock("@/actions/quick-links", () => ({ createQuickLink: rec("createQuickLink") }));
vi.mock("@/actions/tasks", () => ({
  createTask: rec("createTask"),
  updateTask: async (...a: unknown[]) => (calls.push(["updateTask", a]), state.taskResult),
  updateTaskDueDate: rec("updateTaskDueDate"),
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
  it("refuses non-execs before anything is stored", async () => {
    const { tools, inserted } = setup("consultant");
    expect(await tools.propose_event.execute({ title: "Social", date: "2026-10-30" })).toMatchObject({ status: "refused" });
    expect(await tools.propose_quick_link.execute({ title: "Drive", url: "https://x.org" })).toMatchObject({ status: "refused" });
    expect(inserted).toHaveLength(0);
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
