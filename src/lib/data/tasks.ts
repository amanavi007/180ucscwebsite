import "server-only";
import { createClient } from "@/lib/supabase/server";
import { sortTasksByStage } from "@/lib/project-labels";
import type { TaskStatus, TaskType } from "@/lib/supabase/database.types";
import type { TaskWithAssignee, TaskWithProject } from "./types";

export async function getTasksForProject(projectId: string): Promise<TaskWithAssignee[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*, assignee:profiles(id,name), exec_reviews:task_exec_reviews(exec_id,reviewed_at,exec:profiles(id,name))")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return sortTasksByStage(data as unknown as TaskWithAssignee[]);
}

export interface TaskFilters {
  assigneeId?: string;
  projectId?: string;
  status?: string;
  taskType?: string;
  quarterId?: string;
}

export async function getVisibleTasks(filters: TaskFilters = {}): Promise<TaskWithProject[]> {
  const supabase = await createClient();
  // `!inner` so a `quarterId` filter can constrain on the joined project's
  // quarter_id -- project_id is required on every task, so this doesn't drop
  // any rows a left join would have kept.
  let query = supabase
    .from("tasks")
    .select("*, assignee:profiles(id,name), exec_reviews:task_exec_reviews(exec_id,reviewed_at,exec:profiles(id,name)), project:projects!inner(id,client_name,quarter_id)")
    .order("due_date", { ascending: true, nullsFirst: false });

  if (filters.assigneeId) query = query.eq("assignee_id", filters.assigneeId);
  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  if (filters.status) query = query.eq("status", filters.status as TaskStatus);
  if (filters.taskType) query = query.eq("task_type", filters.taskType as TaskType);
  if (filters.quarterId) query = query.eq("project.quarter_id", filters.quarterId);

  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as TaskWithProject[];
}
