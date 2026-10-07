import { describe, expect, it } from "vitest";
import { approveProposal, createProposal, PROPOSAL_ACTIONS, rejectProposal, type ProposalStore } from "./proposals";

function memoryStore() {
  const rows = new Map<string, { id: string; userId: string; tool: string; args: unknown; status: string; expiresAt: number }>();
  let n = 0;
  const store: ProposalStore = {
    insert: async (p) => {
      const id = `p${++n}`;
      rows.set(id, { id, userId: p.userId, tool: p.tool, args: p.args, status: "pending", expiresAt: Date.now() + 86_400_000 });
      return { id };
    },
    claim: async (id, userId, nowIso) => {
      const r = rows.get(id);
      if (!r || r.userId !== userId || r.status !== "pending" || r.expiresAt <= Date.parse(nowIso)) return null;
      r.status = "approved";
      return { id: r.id, tool: r.tool, args: r.args };
    },
    markExecuted: async (id) => { rows.get(id)!.status = "executed"; },
    markFailed: async (id) => { rows.get(id)!.status = "failed"; },
    reject: async (id, userId) => {
      const r = rows.get(id);
      if (!r || r.userId !== userId || r.status !== "pending") return false;
      r.status = "rejected";
      return true;
    },
  };
  return { store, rows };
}

const exec = { id: "e1", role: "president" as const };
const member = { id: "c1", role: "consultant" as const };

describe("createProposal", () => {
  it("never executes: it only stores a pending proposal with a preview", async () => {
    const { store, rows } = memoryStore();
    let executed = false;
    PROPOSAL_ACTIONS.create_exec_todo.execute = async () => { executed = true; };
    const r = await createProposal(store, exec, "t1", "create_exec_todo", { title: "Call Acme", due_date: "2026-10-12" });
    expect(r.ok).toBe(true);
    expect(executed).toBe(false);
    expect([...rows.values()][0].status).toBe("pending");
    expect(r.ok && r.preview).toContain("Call Acme");
  });
  it("refuses a non-exec for an exec-only action", async () => {
    const { store, rows } = memoryStore();
    const r = await createProposal(store, member, null, "create_exec_todo", { title: "x" });
    expect(r.ok).toBe(false);
    expect(rows.size).toBe(0);
  });
  it("refuses unknown tools and invalid args", async () => {
    const { store } = memoryStore();
    expect((await createProposal(store, exec, null, "drop_database", {})).ok).toBe(false);
    expect((await createProposal(store, exec, null, "create_exec_todo", { title: "" })).ok).toBe(false);
  });
});

describe("approveProposal", () => {
  it("executes exactly once even if approved twice", async () => {
    const { store } = memoryStore();
    let runs = 0;
    PROPOSAL_ACTIONS.create_exec_todo.execute = async () => { runs++; };
    const c = await createProposal(store, exec, null, "create_exec_todo", { title: "A" });
    if (!c.ok) throw new Error("setup");
    const [a, b] = await Promise.all([
      approveProposal(store, exec, c.proposalId, new Date()),
      approveProposal(store, exec, c.proposalId, new Date()),
    ]);
    expect(runs).toBe(1);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
  });
  it("refuses an expired proposal", async () => {
    const { store } = memoryStore();
    const c = await createProposal(store, exec, null, "create_exec_todo", { title: "A" });
    if (!c.ok) throw new Error("setup");
    const r = await approveProposal(store, exec, c.proposalId, new Date(Date.now() + 2 * 86_400_000));
    expect(r.ok).toBe(false);
  });
  it("refuses someone else's proposal", async () => {
    const { store } = memoryStore();
    const c = await createProposal(store, exec, null, "create_exec_todo", { title: "A" });
    if (!c.ok) throw new Error("setup");
    expect((await approveProposal(store, { id: "other", role: "president" }, c.proposalId, new Date())).ok).toBe(false);
  });
  it("re-checks role at approval time", async () => {
    const { store } = memoryStore();
    const c = await createProposal(store, exec, null, "create_exec_todo", { title: "A" });
    if (!c.ok) throw new Error("setup");
    const demoted = { id: exec.id, role: "consultant" as const };
    expect((await approveProposal(store, demoted, c.proposalId, new Date())).ok).toBe(false);
  });
  it("marks failed and reports the error when execution throws", async () => {
    const { store, rows } = memoryStore();
    PROPOSAL_ACTIONS.create_exec_todo.execute = async () => { throw new Error("db"); };
    const c = await createProposal(store, exec, null, "create_exec_todo", { title: "A" });
    if (!c.ok) throw new Error("setup");
    const r = await approveProposal(store, exec, c.proposalId, new Date());
    expect(r.ok).toBe(false);
    expect(rows.get(c.proposalId)!.status).toBe("failed");
  });
});

describe("rejectProposal", () => {
  it("rejects a pending proposal once", async () => {
    const { store } = memoryStore();
    const c = await createProposal(store, exec, null, "create_exec_todo", { title: "A" });
    if (!c.ok) throw new Error("setup");
    expect((await rejectProposal(store, exec, c.proposalId)).ok).toBe(true);
    expect((await rejectProposal(store, exec, c.proposalId)).ok).toBe(false);
  });
});
