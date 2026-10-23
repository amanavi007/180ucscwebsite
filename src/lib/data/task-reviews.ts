import "server-only";
import { createClient } from "@/lib/supabase/server";
import { EXEC_ROLES, compareByRole } from "@/lib/auth/roles";
import type { UserRole } from "@/lib/supabase/database.types";

export interface MyTaskReview {
  taskId: string;
  taskName: string;
  projectId: string;
  clientName: string;
  consultantName: string;
  /** When this exec was assigned. */
  assignedAt: string;
  /** Null while this exec's review is still owed. */
  reviewedAt: string | null;
  /** The other assigned exec(s) and whether each is done. */
  others: { name: string; done: boolean }[];
}

interface ReviewRow {
  task_id: string;
  assigned_at: string;
  reviewed_at: string | null;
  task: {
    id: string;
    task_name: string;
    project_id: string;
    stage_step: string | null;
    assignee: { name: string } | null;
    project: { client_name: string } | null;
    reviews: { exec_id: string; reviewed_at: string | null; exec: { name: string } | null }[];
  } | null;
}

/**
 * Task reviews assigned to this exec. Only tasks still at the awaiting-exec step
 * count: a task that was moved back keeps stale assignment rows until it re-enters
 * the step, and those must not show as owed.
 */
export async function getMyTaskReviews(execId: string): Promise<MyTaskReview[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_exec_reviews")
    .select(
      "task_id, assigned_at, reviewed_at, task:tasks!inner(id, task_name, project_id, stage_step, assignee:profiles!tasks_assignee_id_fkey(name), project:projects(client_name), reviews:task_exec_reviews(exec_id, reviewed_at, exec:profiles(name)))",
    )
    .eq("exec_id", execId)
    .eq("task.stage_step", "awaiting_exec_revision")
    .order("assigned_at", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as unknown as ReviewRow[])
    .filter((r) => r.task)
    .map((r) => ({
      taskId: r.task_id,
      taskName: r.task!.task_name,
      projectId: r.task!.project_id,
      clientName: r.task!.project?.client_name ?? "Unknown client",
      consultantName: r.task!.assignee?.name ?? "A consultant",
      assignedAt: r.assigned_at,
      reviewedAt: r.reviewed_at,
      others: r.task!.reviews
        .filter((o) => o.exec_id !== execId)
        .map((o) => ({ name: o.exec?.name ?? "Another exec", done: !!o.reviewed_at })),
    }));
}

export async function getPendingTaskReviewCount(execId: string): Promise<number> {
  const reviews = await getMyTaskReviews(execId);
  return reviews.filter((r) => !r.reviewedAt).length;
}

export interface ExecReviewLoadItem {
  taskId: string;
  taskName: string;
  projectId: string;
  clientName: string;
  consultantName: string;
  assignedAt: string;
}

export interface ExecReviewLoad {
  execId: string;
  name: string;
  role: UserRole;
  /** Assigned and not yet marked reviewed, on tasks still awaiting exec revision. */
  waiting: ExecReviewLoadItem[];
  /** Reviews this exec has marked done, ever. */
  reviewedCount: number;
}

interface LoadRow {
  exec_id: string;
  assigned_at: string;
  reviewed_at: string | null;
  task: {
    id: string;
    task_name: string;
    project_id: string;
    stage_step: string | null;
    assignee: { name: string } | null;
    project: { client_name: string } | null;
  } | null;
}

/**
 * Every active exec with their pending and finished exec reviews, so the Director of
 * Projects can check the auto-assignment is splitting work evenly. Execs with nothing
 * assigned are included (a 0 is the point). Most waiting first.
 */
export async function getExecReviewLoad(): Promise<ExecReviewLoad[]> {
  const supabase = await createClient();
  const [execs, reviews] = await Promise.all([
    supabase.from("profiles").select("id, name, role").in("role", EXEC_ROLES).is("archived_at", null),
    supabase
      .from("task_exec_reviews")
      .select(
        "exec_id, assigned_at, reviewed_at, task:tasks!inner(id, task_name, project_id, stage_step, assignee:profiles!tasks_assignee_id_fkey(name), project:projects(client_name))",
      )
      .order("assigned_at", { ascending: true }),
  ]);
  if (execs.error) throw execs.error;
  if (reviews.error) throw reviews.error;

  const byExec = new Map<string, ExecReviewLoad>(
    (execs.data ?? []).map((e) => [e.id, { execId: e.id, name: e.name, role: e.role, waiting: [], reviewedCount: 0 }]),
  );
  for (const r of (reviews.data ?? []) as unknown as LoadRow[]) {
    const exec = byExec.get(r.exec_id);
    if (!exec || !r.task) continue;
    if (r.reviewed_at) {
      exec.reviewedCount += 1;
    } else if (r.task.stage_step === "awaiting_exec_revision") {
      exec.waiting.push({
        taskId: r.task.id,
        taskName: r.task.task_name,
        projectId: r.task.project_id,
        clientName: r.task.project?.client_name ?? "Unknown client",
        consultantName: r.task.assignee?.name ?? "A consultant",
        assignedAt: r.assigned_at,
      });
    }
  }
  return [...byExec.values()].sort(
    (a, b) => b.waiting.length - a.waiting.length || compareByRole(a, b),
  );
}
