import "server-only";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createOrgEvent } from "@/actions/calendar";
import { createExecTodo, deleteExecTodo, toggleExecTodo } from "@/actions/exec-todos";
import { addMember, removeMember, updateProjectStatus } from "@/actions/projects";
import { logAudit } from "@/lib/audit";
import { createQuickLink } from "@/actions/quick-links";
import { createTask, updateTask, updateTaskDueDate } from "@/actions/tasks";
import { PROPOSAL_ACTIONS, UserFacingError, createProposal, type Actor, type ProposalStore } from "../proposals";
import { isExec } from "@/lib/auth/roles";
import { findPerson, findProject, type Lookup } from "./lookup";
import { buildAdminWriteTools, registerAdminExecutors } from "./write-tools-admin";
import { resolveByName } from "./resolve";
import type { ToolDeps } from "./types";

/** User-scoped store: RLS (chat_proposals_own) guarantees ownership; the filters are belt and braces. */
export async function supabaseProposalStore(): Promise<ProposalStore> {
  const supabase = await createClient();
  return {
    insert: async (p) => {
      const { data, error } = await supabase
        .from("chat_proposals")
        .insert({ user_id: p.userId, thread_id: p.threadId, tool: p.tool, args: p.args, preview: p.preview })
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id };
    },
    claim: async (id, userId, nowIso) => {
      const { data } = await supabase
        .from("chat_proposals")
        .update({ status: "approved" })
        .eq("id", id)
        .eq("user_id", userId)
        .eq("status", "pending")
        .gt("expires_at", nowIso)
        .select("id, tool, args")
        .maybeSingle();
      return data ?? null;
    },
    markExecuted: async (id, nowIso) => {
      await supabase.from("chat_proposals").update({ status: "executed", executed_at: nowIso }).eq("id", id);
    },
    markFailed: async (id, error) => {
      await supabase.from("chat_proposals").update({ status: "failed", error }).eq("id", id);
    },
    reject: async (id, userId) => {
      const { data } = await supabase
        .from("chat_proposals")
        .update({ status: "rejected" })
        .eq("id", id)
        .eq("user_id", userId)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      return !!data;
    },
  };
}

/** The existing server actions already check permissions and validate; their refusal text is what the user should see. */
function check(result: { error?: string } | void) {
  if (result && result.error) throw new UserFacingError(result.error);
}

/** Wire the real executors. Called at module load of the approve route and chat route. */
export function registerExecutors() {
  const A = PROPOSAL_ACTIONS;
  A.create_exec_todo.execute = async (a) => check(await createExecTodo(a.title, a.due_date ?? null, a.assignedTo ?? []));
  A.complete_exec_todo.execute = async (a) => check(await toggleExecTodo(a.todoId, a.done));
  A.delete_exec_todo.execute = async (a) => check(await deleteExecTodo(a.todoId));
  A.create_task.execute = async (a) =>
    check(
      await createTask({
        projectId: a.projectId,
        taskName: a.taskName,
        assigneeId: a.assigneeId ?? null,
        dueDate: a.dueDate ?? null,
        priority: a.priority,
        taskType: a.taskType,
      }),
    );
  A.update_task.execute = async (a) => {
    const patch: Record<string, unknown> = {};
    if (a.status) patch.status = a.status;
    if (a.priority) patch.priority = a.priority;
    if (a.assigneeId !== undefined) patch.assigneeId = a.assigneeId;
    if (Object.keys(patch).length > 0) check(await updateTask(a.taskId, a.projectId, patch));
    // Due dates have their own action: default stage tasks share a date across the whole team.
    if (a.dueDate !== undefined) check(await updateTaskDueDate(a.taskId, a.projectId, a.dueDate));
  };
  A.set_project_status.execute = async (a) => check(await updateProjectStatus(a.projectId, a.status));
  A.add_project_member.execute = async (a) => check(await addMember(a.projectId, a.userId));
  A.remove_project_member.execute = async (a) => check(await removeMember(a.projectId, a.userId));
  A.create_event.execute = async (a) =>
    check(await createOrgEvent({ title: a.title, date: a.date, time: a.time, location: a.location, description: a.description }));
  A.create_quick_link.execute = async (a) =>
    check(await createQuickLink({ title: a.title, url: a.url, description: a.description ?? "", category: a.category ?? "" }));

  registerAdminExecutors();

  // Everything the assistant does on someone's behalf lands in the activity log, whichever action ran.
  for (const [name, action] of Object.entries(A)) {
    const run = action.execute;
    action.execute = async (args, ctx) => {
      await run(args, ctx);
      await logAudit(ctx.userId, `assistant.${name}`, A[name].preview(args), "Done via AI assistant (approved)");
    };
  }
}

const ISO = "YYYY-MM-DD";
const refused = (reason: string) => ({ status: "refused" as const, reason });

/** Turns a lookup failure into the tool result the model relays ("which Sam?"), or runs `then` on the match. */
async function withLookup<T>(l: Lookup<T>, then: (item: T) => Promise<unknown>) {
  return l.ok ? then(l.item) : refused(l.reason);
}

export function buildWriteTools(actor: Actor, threadId: string | null, store: ProposalStore, deps: ToolDeps): ToolSet {
  const propose = async (name: string, args: unknown) => {
    const r = await createProposal(store, actor, threadId, name, args);
    return r.ok
      ? { status: "awaiting_user_approval", proposalId: r.proposalId, preview: r.preview, ...(r.warning ? { warning: r.warning } : {}) }
      : refused(r.error);
  };
  const NOTE = " This does NOT change anything: the user must approve a card first.";

  async function findTask(taskQuery: string, projectQuery: string | undefined) {
    const quarter = await deps.data.activeQuarter();
    if (!quarter) return { ok: false, reason: "There is no active quarter yet." } as const;
    let projectId: string | undefined;
    if (projectQuery) {
      const p = await findProject(deps, projectQuery);
      if (!p.ok) return p;
      projectId = p.item.id;
    }
    const rows = await deps.data.tasks(quarter.id, { projectId });
    const r = resolveByName(taskQuery, rows, (t) => t.task_name);
    if (r.kind === "one") return { ok: true, item: r.item } as const;
    if (r.kind === "none") return { ok: false, reason: `No task matches "${taskQuery}".` } as const;
    const names = r.items.slice(0, 6).map((t) => `${t.task_name} (${t.project ?? "no project"}, ${t.assignee ?? "unassigned"})`).join("; ");
    return { ok: false, reason: `More than one task matches "${taskQuery}": ${names}. Ask the user which, or pass the project.` } as const;
  }

  async function assignee(name: string | null | undefined) {
    if (name === undefined) return { ok: true, id: undefined, label: undefined } as const;
    if (name === null || /^(none|nobody|unassigned)$/i.test(name.trim())) return { ok: true, id: null, label: null } as const;
    const who = /^(me|myself)$/i.test(name.trim()) ? { ok: true, item: { id: actor.id, name: deps.profile.name } } as const : await findPerson(deps, name);
    return who.ok ? ({ ok: true, id: who.item.id, label: who.item.name } as const) : who;
  }

  const core: ToolSet = {
    propose_exec_todo: tool({
      description: `Propose adding an item to the exec to-do list. Exec only.${NOTE}`,
      inputSchema: z.object({
        title: z.string().describe("Short to-do title"),
        due_date: z.string().nullable().optional().describe(ISO + ", if the user gave a date"),
        assignees: z.array(z.string()).optional().describe("Names of execs to assign"),
      }),
      execute: async (args) => {
        const ids: string[] = [];
        const names: string[] = [];
        for (const n of args.assignees ?? []) {
          const w = await assignee(n);
          if (!w.ok) return refused(w.reason);
          if (w.id) { ids.push(w.id); names.push(w.label!); }
        }
        return propose("create_exec_todo", { title: args.title, due_date: args.due_date, assignedTo: ids, assignedNames: names });
      },
    }),
    propose_exec_todo_update: tool({
      description: `Propose marking an exec to-do done/reopened, or deleting it. Exec only.${NOTE}`,
      inputSchema: z.object({
        title: z.string().describe("Part of the to-do's title"),
        action: z.enum(["complete", "reopen", "delete"]),
      }),
      execute: async ({ title, action }) => {
        const todos = await deps.data.openExecTodos();
        const r = resolveByName(title, todos, (t) => t.title);
        if (r.kind === "none") return refused(`No open exec to-do matches "${title}".`);
        if (r.kind === "many") return refused(`More than one to-do matches: ${r.items.map((t) => t.title).join("; ")}. Ask which.`);
        return action === "delete"
          ? propose("delete_exec_todo", { todoId: r.item.id, title: r.item.title })
          : propose("complete_exec_todo", { todoId: r.item.id, title: r.item.title, done: action === "complete" });
      },
    }),
    propose_task: tool({
      description: `Propose creating a task on a project. Project and assignee are given by name.${NOTE}`,
      inputSchema: z.object({
        project: z.string().describe("Client/project name"),
        task: z.string().describe("Task name"),
        assignee: z.string().nullable().optional().describe("Person's name, or 'me'"),
        due_date: z.string().nullable().optional().describe(ISO),
        priority: z.enum(["low", "medium", "high"]).optional(),
        task_type: z.enum(["preliminary_research", "implementables", "deliverable", "other"]).optional(),
      }),
      execute: async (a) =>
        withLookup(await findProject(deps, a.project), async (p) => {
          const w = await assignee(a.assignee);
          if (!w.ok) return refused(w.reason);
          return propose("create_task", {
            projectId: p.id, projectName: p.client_name, taskName: a.task,
            assigneeId: w.id, assigneeName: w.label, dueDate: a.due_date, priority: a.priority, taskType: a.task_type,
          });
        }),
    }),
    propose_task_update: tool({
      description: `Propose changing an existing task: mark done / in progress, change priority or due date, reassign.${NOTE}`,
      inputSchema: z.object({
        task: z.string().describe("Part of the task name"),
        project: z.string().optional().describe("Project name, to disambiguate"),
        status: z.enum(["not_started", "in_progress", "done"]).optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        due_date: z.string().nullable().optional().describe(`${ISO}, or null to clear`),
        assignee: z.string().nullable().optional().describe("Person's name, 'me', or null to unassign"),
      }),
      execute: async (a) =>
        withLookup(await findTask(a.task, a.project), async (t) => {
          const w = await assignee(a.assignee);
          if (!w.ok) return refused(w.reason);
          return propose("update_task", {
            taskId: t.id, projectId: t.project_id, taskName: t.task_name, projectName: t.project ?? "project",
            status: a.status, priority: a.priority, dueDate: a.due_date, assigneeId: w.id, assigneeName: w.label,
          });
        }),
    }),
    propose_project_status: tool({
      description: `Propose moving a project to a new stage. PM/SC of that project or execs.${NOTE}`,
      inputSchema: z.object({
        project: z.string(),
        status: z.enum([
          "initial_research", "issue_tree", "preliminary_research", "implementable_creation",
          "deliverable_slide_work", "presentation_practice", "ready_for_final_deliverable", "archived",
        ]),
      }),
      execute: async (a) =>
        withLookup(await findProject(deps, a.project), (p) =>
          propose("set_project_status", { projectId: p.id, projectName: p.client_name, status: a.status }),
        ),
    }),
    propose_project_member: tool({
      description: `Propose adding or removing a person on a project team. PM/SC of that project or execs.${NOTE}`,
      inputSchema: z.object({ project: z.string(), person: z.string(), action: z.enum(["add", "remove"]) }),
      execute: async (a) =>
        withLookup(await findProject(deps, a.project), async (p) =>
          withLookup(await findPerson(deps, a.person), (u) =>
            propose(a.action === "add" ? "add_project_member" : "remove_project_member", {
              projectId: p.id, projectName: p.client_name, userId: u.id, userName: u.name,
            }),
          ),
        ),
    }),
    propose_event: tool({
      description: `Propose adding an org calendar event. Exec only.${NOTE}`,
      inputSchema: z.object({
        title: z.string(),
        date: z.string().describe(ISO),
        time: z.string().nullable().optional(),
        location: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
      }),
      execute: (a) => propose("create_event", a),
    }),
    propose_quick_link: tool({
      description: `Propose adding a quick link. Exec only.${NOTE}`,
      inputSchema: z.object({
        title: z.string(),
        url: z.string(),
        description: z.string().nullable().optional(),
        category: z.string().nullable().optional(),
      }),
      execute: (a) => propose("create_quick_link", a),
    }),
  };

  const all = { ...core, ...buildAdminWriteTools(actor, deps, propose, NOTE) };
  if (isExec(actor.role)) return all;
  // Everyone else only gets the tools their role can actually use: fewer tools means fewer wasted tokens and wrong picks.
  return Object.fromEntries(Object.entries(all).filter(([name]) => NON_EXEC_TOOLS.has(name)));
}

/** Tools a PM/SC/consultant may use (the underlying actions still enforce per-project permissions). */
const NON_EXEC_TOOLS = new Set(["propose_task", "propose_task_update", "propose_task_delete", "propose_project_status", "propose_project_member", "propose_project_health", "propose_attendance"]);
