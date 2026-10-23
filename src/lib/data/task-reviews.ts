import "server-only";
import { createClient } from "@/lib/supabase/server";

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
      "task_id, assigned_at, reviewed_at, task:tasks!inner(id, task_name, project_id, stage_step, assignee:profiles(name), project:projects(client_name), reviews:task_exec_reviews(exec_id, reviewed_at, exec:profiles(name)))",
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
