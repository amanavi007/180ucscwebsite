import { z } from "zod";

/** Pure definition of an assistant write: what it accepts, who may ask, how it reads on the approve card. */
export interface ProposalAction<A = unknown> {
  requiresExec: boolean;
  schema: z.ZodType<A>;
  preview(args: A): string;
  execute(args: A, ctx: { userId: string }): Promise<void>;
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const id = z.string().min(1).max(64);
const label = z.string().trim().min(1).max(200);
const priority = z.enum(["low", "medium", "high"]);
const taskStatus = z.enum(["not_started", "in_progress", "done"]);
const taskType = z.enum(["preliminary_research", "implementables", "deliverable", "other"]);
const projectStatus = z.enum([
  "initial_research",
  "issue_tree",
  "preliminary_research",
  "implementable_creation",
  "deliverable_slide_work",
  "presentation_practice",
  "ready_for_final_deliverable",
  "archived",
]);

const notRegistered = (name: string) => async () => {
  throw new Error(`${name} executor not registered`);
};
const human = (s: string) => s.replace(/_/g, " ");

export const createExecTodoSchema = z.object({
  title: z.string().trim().min(1).max(200),
  due_date: date.nullable().optional(),
  assignedTo: z.array(id).max(10).optional(),
  assignedNames: z.array(label).max(10).optional(),
});
export const createTaskSchema = z.object({
  projectId: id,
  projectName: label,
  taskName: z.string().trim().min(1).max(200),
  assigneeId: id.nullable().optional(),
  assigneeName: label.nullable().optional(),
  dueDate: date.nullable().optional(),
  priority: priority.default("medium"),
  taskType: taskType.default("other"),
});
export const updateTaskSchema = z
  .object({
    taskId: id,
    projectId: id,
    taskName: label,
    projectName: label,
    status: taskStatus.optional(),
    priority: priority.optional(),
    dueDate: date.nullable().optional(),
    assigneeId: id.nullable().optional(),
    assigneeName: label.nullable().optional(),
  })
  .refine((a) => a.status || a.priority || a.dueDate !== undefined || a.assigneeId !== undefined, "Nothing to change.");
export const projectStatusSchema = z.object({ projectId: id, projectName: label, status: projectStatus });
export const projectMemberSchema = z.object({ projectId: id, projectName: label, userId: id, userName: label });
export const createEventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  date,
  time: z.string().trim().max(40).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
});
export const execTodoDoneSchema = z.object({ todoId: id, title: label, done: z.boolean() });
export const execTodoDeleteSchema = z.object({ todoId: id, title: label });
export const quickLinkSchema = z.object({
  title: z.string().trim().min(1).max(120),
  url: z.string().trim().url().max(500).refine((u) => /^https?:\/\//i.test(u), "Must be http(s)."),
  description: z.string().trim().max(300).nullable().optional(),
  category: z.string().trim().max(60).nullable().optional(),
});

/** Registry of everything the assistant may do on a user's behalf. Executors are wired in tools/write-tools.ts. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ACTIONS: Record<string, ProposalAction<any>> = {
  create_exec_todo: {
    requiresExec: true,
    schema: createExecTodoSchema,
    preview: (a: z.infer<typeof createExecTodoSchema>) =>
      `Add exec to-do: "${a.title}"${a.due_date ? ` (due ${a.due_date})` : ""}${a.assignedNames?.length ? ` for ${a.assignedNames.join(", ")}` : ""}`,
    execute: notRegistered("create_exec_todo"),
  },
  complete_exec_todo: {
    requiresExec: true,
    schema: execTodoDoneSchema,
    preview: (a: z.infer<typeof execTodoDoneSchema>) => `${a.done ? "Mark done" : "Reopen"} exec to-do: "${a.title}"`,
    execute: notRegistered("complete_exec_todo"),
  },
  delete_exec_todo: {
    requiresExec: true,
    schema: execTodoDeleteSchema,
    preview: (a: z.infer<typeof execTodoDeleteSchema>) => `Delete exec to-do: "${a.title}"`,
    execute: notRegistered("delete_exec_todo"),
  },
  create_task: {
    requiresExec: false,
    schema: createTaskSchema,
    preview: (a: z.infer<typeof createTaskSchema>) =>
      `Add task "${a.taskName}" to ${a.projectName}${a.assigneeName ? ` for ${a.assigneeName}` : ""}${a.dueDate ? `, due ${a.dueDate}` : ""} (${a.priority} priority)`,
    execute: notRegistered("create_task"),
  },
  update_task: {
    requiresExec: false,
    schema: updateTaskSchema,
    preview: (a: z.infer<typeof updateTaskSchema>) => {
      const changes = [
        a.status && `status → ${human(a.status)}`,
        a.priority && `priority → ${a.priority}`,
        a.dueDate !== undefined && (a.dueDate ? `due → ${a.dueDate}` : "clear due date"),
        a.assigneeId !== undefined && (a.assigneeName ? `assign to ${a.assigneeName}` : "unassign"),
      ].filter(Boolean);
      return `Update "${a.taskName}" (${a.projectName}): ${changes.join(", ")}`;
    },
    execute: notRegistered("update_task"),
  },
  set_project_status: {
    requiresExec: false,
    schema: projectStatusSchema,
    preview: (a: z.infer<typeof projectStatusSchema>) => `Set ${a.projectName} status to ${human(a.status)}`,
    execute: notRegistered("set_project_status"),
  },
  add_project_member: {
    requiresExec: false,
    schema: projectMemberSchema,
    preview: (a: z.infer<typeof projectMemberSchema>) => `Add ${a.userName} to ${a.projectName}`,
    execute: notRegistered("add_project_member"),
  },
  remove_project_member: {
    requiresExec: false,
    schema: projectMemberSchema,
    preview: (a: z.infer<typeof projectMemberSchema>) => `Remove ${a.userName} from ${a.projectName}`,
    execute: notRegistered("remove_project_member"),
  },
  create_event: {
    requiresExec: true,
    schema: createEventSchema,
    preview: (a: z.infer<typeof createEventSchema>) =>
      `Add calendar event "${a.title}" on ${a.date}${a.time ? ` at ${a.time}` : ""}${a.location ? ` (${a.location})` : ""}`,
    execute: notRegistered("create_event"),
  },
  create_quick_link: {
    requiresExec: true,
    schema: quickLinkSchema,
    preview: (a: z.infer<typeof quickLinkSchema>) => `Add quick link "${a.title}" → ${a.url}`,
    execute: notRegistered("create_quick_link"),
  },
};
