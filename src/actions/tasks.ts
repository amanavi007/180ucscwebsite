"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database, TaskPriority, TaskStatus } from "@/lib/supabase/database.types";

type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];

export interface ActionResult {
  error?: string;
}

export async function createSubTask(input: {
  projectId: string;
  parentTaskId: string;
  taskName: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  priority: TaskPriority;
}): Promise<ActionResult> {
  const supabase = await createClient();

  // task_type is inherited from the parent milestone via DB trigger.
  const { error } = await supabase.from("tasks").insert({
    project_id: input.projectId,
    parent_task_id: input.parentTaskId,
    task_name: input.taskName,
    assignee_id: input.assigneeId || null,
    due_date: input.dueDate || null,
    priority: input.priority,
    task_type: "initial_research",
  });

  if (error) return { error: error.message };

  revalidatePath(`/projects/${input.projectId}`);
  revalidatePath("/tasks");
  return {};
}

export async function updateTask(
  taskId: string,
  projectId: string,
  input: Partial<{
    taskName: string;
    assigneeId: string | null;
    dueDate: string | null;
    status: TaskStatus;
    priority: TaskPriority;
  }>,
): Promise<ActionResult> {
  const supabase = await createClient();

  const patch: TaskUpdate = {};
  if (input.taskName !== undefined) patch.task_name = input.taskName;
  if (input.assigneeId !== undefined) patch.assignee_id = input.assigneeId;
  if (input.dueDate !== undefined) patch.due_date = input.dueDate;
  if (input.status !== undefined) patch.status = input.status;
  if (input.priority !== undefined) patch.priority = input.priority;

  const { error } = await supabase.from("tasks").update(patch).eq("id", taskId);
  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/tasks");
  return {};
}

export async function deleteTask(taskId: string, projectId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/tasks");
  return {};
}
