import { describe, expect, it, vi } from "vitest";
import { approveProposal, createProposal, PROPOSAL_ACTIONS, type ProposalStore } from "./proposals";

/**
 * The assistant must never be a way around the portal's permissions. This pins which actions are
 * exec-only, so loosening one has to be a deliberate edit to this list.
 */
const EXEC_ONLY = [
  "create_exec_todo", "complete_exec_todo", "delete_exec_todo", "create_event", "create_quick_link",
  "create_project", "delete_project", "update_event", "delete_event", "update_quick_link", "delete_quick_link",
  "create_wiki_page", "update_wiki_page", "delete_wiki_page",
  "create_member", "update_member_role", "reset_member_password", "archive_member", "restore_member",
  "add_applicant", "award_points", "void_points", "create_recruit_event",
  "create_quarter", "set_active_quarter", "delete_quarter", "create_client", "merge_clients",
  "generate_slots", "publish_all_slots", "set_booking_open", "cancel_booking",
  "create_team_plan", "finalize_team_plan", "apply_team_plan", "approve_team_submissions", "set_attendance_threshold",
].sort();

// Left to the underlying server actions, which check project lead / own-task permissions themselves.
const LEAD_OR_OWN = ["create_task", "update_task", "delete_task", "set_project_status", "add_project_member", "remove_project_member", "set_project_health", "submit_attendance"].sort();

const NON_EXEC = ["junior_consultant", "consultant", "senior_consultant", "project_manager"] as const;

function store() {
  const insert = vi.fn(async () => ({ id: "p1" }));
  const claim = vi.fn(async () => ({ id: "p1", tool: "x", args: {} }));
  const markFailed = vi.fn(async () => {});
  const s: ProposalStore = { insert, claim, markExecuted: async () => {}, markFailed, reject: async () => true };
  return { s, insert, claim, markFailed };
}

describe("assistant permission lock", () => {
  it("has exactly the expected exec-only and lead/own actions (every action is accounted for)", () => {
    const execOnly = Object.entries(PROPOSAL_ACTIONS).filter(([, a]) => a.requiresExec).map(([n]) => n).sort();
    const rest = Object.entries(PROPOSAL_ACTIONS).filter(([, a]) => !a.requiresExec).map(([n]) => n).sort();
    expect(execOnly).toEqual(EXEC_ONLY);
    expect(rest).toEqual(LEAD_OR_OWN);
  });

  for (const name of EXEC_ONLY) {
    for (const role of NON_EXEC) {
      it(`${name}: ${role} cannot even create the proposal`, async () => {
        const { s, insert } = store();
        const r = await createProposal(s, { id: "u", role }, null, name, {});
        expect(r.ok).toBe(false);
        expect(insert).not.toHaveBeenCalled();
      });
    }
    it(`${name}: approving a stored proposal re-checks the role and never executes for a non-exec`, async () => {
      const { s, claim, markFailed } = store();
      claim.mockResolvedValue({ id: "p1", tool: name, args: {} });
      const execute = vi.spyOn(PROPOSAL_ACTIONS[name], "execute").mockResolvedValue(undefined);
      const r = await approveProposal(s, { id: "u", role: "consultant" }, "p1", new Date());
      expect(r.ok).toBe(false);
      expect(execute).not.toHaveBeenCalled();
      expect(markFailed).toHaveBeenCalled();
      execute.mockRestore();
    });
  }

  it("a demoted exec loses access between proposing and approving", async () => {
    const { s, claim } = store();
    claim.mockResolvedValue({ id: "p1", tool: "update_member_role", args: { userId: "x", userName: "X", role: "president", roleLabel: "President" } });
    const execute = vi.spyOn(PROPOSAL_ACTIONS.update_member_role, "execute").mockResolvedValue(undefined);
    const r = await approveProposal(s, { id: "u", role: "consultant" }, "p1", new Date());
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/permission/i) });
    expect(execute).not.toHaveBeenCalled();
    execute.mockRestore();
  });
});
