import "server-only";
import { createClient } from "@/lib/supabase/server";
import { sortTasksByStage } from "@/lib/project-labels";
import type { TaskStatus, TaskType } from "@/lib/supabase/database.types";
import type { TaskWithAssignee, TaskWithProject } from "./types";

export async function getTasksForProject(projectId: string): Promise<TaskWithAssignee[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*, assignee:profiles(id,name)")
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
}

export async function getVisibleTasks(filters: TaskFilters = {}): Promise<TaskWithProject[]> {
  const supabase = await createClient();
  let query = supabase
    .from("tasks")
    .select("*, assignee:profiles(id,name), project:projects(id,client_name)")
    .order("due_date", { ascending: true, nullsFirst: false });

  if (filters.assigneeId) query = query.eq("assignee_id", filters.assigneeId);
  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  if (filters.status) query = query.eq("status", filters.status as TaskStatus);
  if (filters.taskType) query = query.eq("task_type", filters.taskType as TaskType);

  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as TaskWithProject[];
}
