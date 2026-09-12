"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { isProjectLead } from "@/lib/auth/project-access";
import { statusForStageStep } from "@/lib/project-labels";
import type {
  Database,
  TaskPriority,
  TaskStageStep,
  TaskStatus,
  TaskType,
} from "@/lib/supabase/database.types";

type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];

export interface ActionResult {
  error?: string;
}

const canLeadProject = isProjectLead;

export async function createTask(input: {
  projectId: string;
  taskName: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  priority: TaskPriority;
  taskType: TaskType;
}): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  const exec = isExec(profile.role);
  const leads = await canLeadProject(input.projectId, profile.id, exec);

  // Base members may only create tasks for themselves.
  const assigneeId = input.assigneeId || null;
  if (!leads && assigneeId !== profile.id) {
    return { error: "You can only create tasks assigned to yourself." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    project_id: input.projectId,
    task_name: input.taskName,
    assignee_id: assigneeId,
    due_date: input.dueDate || null,
    priority: input.priority,
    task_type: input.taskType,
  });

  if (error) return { error: error.message };

  revalidatePath(`/portal/projects/${input.projectId}`);
  revalidatePath("/portal/tasks");
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

  revalidatePath(`/portal/projects/${projectId}`);
  revalidatePath("/portal/tasks");
  return {};
}

/**
 * Due dates on the 5 default stage tasks are shared across the whole team --
 * a PM/SC/exec setting one propagates to every member's copy of that same
 * stage. Custom tasks (and any edit by a base member on their own task)
 * stay single-row.
 */
export async function updateTaskDueDate(
  taskId: string,
  projectId: string,
  dueDate: string | null,
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  const exec = isExec(profile.role);
  const leads = await canLeadProject(projectId, profile.id, exec);

  const supabase = await createClient();

  if (leads) {
    const { data: task } = await supabase
      .from("tasks")
      .select("task_type, is_default_task")
      .eq("id", taskId)
      .single();

    if (task?.is_default_task) {
      const { error } = await supabase
        .from("tasks")
        .update({ due_date: dueDate })
        .eq("project_id", projectId)
        .eq("task_type", task.task_type)
        .eq("is_default_task", true);

      if (error) return { error: error.message };
      revalidatePath(`/portal/projects/${projectId}`);
      revalidatePath("/portal/tasks");
      return {};
    }
  }

  const { error } = await supabase.from("tasks").update({ due_date: dueDate }).eq("id", taskId);
  if (error) return { error: error.message };

  revalidatePath(`/portal/projects/${projectId}`);
  revalidatePath("/portal/tasks");
  return {};
}

/** Advances/sets a stepped task's position on its 4-step timeline; keeps `status` in sync. */
export async function updateTaskStageStep(
  taskId: string,
  projectId: string,
  step: TaskStageStep,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ stage_step: step, status: statusForStageStep(step) })
    .eq("id", taskId);

  if (error) return { error: error.message };

  revalidatePath(`/portal/projects/${projectId}`);
  revalidatePath("/portal/tasks");
  return {};
}

/** Un-starts a stepped task, back to the plain "Not started" state. */
export async function resetTaskStage(taskId: string, projectId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ stage_step: null, status: "not_started" })
    .eq("id", taskId);

  if (error) return { error: error.message };

  revalidatePath(`/portal/projects/${projectId}`);
  revalidatePath("/portal/tasks");
  return {};
}

/**
 * Bulk version of `deleteTask` -- one batched `.in("id", ...)` delete instead
 * of a loop, so reassigning/deleting a handful of tasks at once (e.g. moving
 * everything off someone who just left) doesn't fire N separate DB writes.
 * Gating mirrors `deleteTask`: leads may delete anything, everyone else only
 * their own non-default tasks.
 */
export async function bulkDeleteTasks(taskIds: string[], projectId: string): Promise<ActionResult> {
  if (taskIds.length === 0) return {};

  const profile = await getCurrentProfile();
  const exec = isExec(profile.role);
  const leads = await canLeadProject(projectId, profile.id, exec);

  const supabase = await createClient();

  if (!leads) {
    const { data: rows } = await supabase
      .from("tasks")
      .select("id, assignee_id, is_default_task")
      .in("id", taskIds);

    const allDeletable =
      !!rows &&
      rows.length === taskIds.length &&
      rows.every((t) => t.assignee_id === profile.id && !t.is_default_task);

    if (!allDeletable) {
      return { error: "You can only delete your own tasks." };
    }
  }

  const { error } = await supabase.from("tasks").delete().in("id", taskIds);
  if (error) return { error: error.message };

  revalidatePath(`/portal/projects/${projectId}`);
  revalidatePath("/portal/tasks");
  return {};
}

/**
 * Bulk reassign, one batched update instead of a loop. Reassigning others'
 * tasks is a lead-only action (mirrors `canReassign` in TaskRow, which only
 * ever renders the picker for `canManage` users), so this is gated to leads
 * rather than mirroring `updateTask` (which has no gating of its own since
 * the UI never exposes reassignment of others' tasks to base members).
 */
export async function bulkReassignTasks(
  taskIds: string[],
  newAssigneeId: string,
  projectId: string,
): Promise<ActionResult> {
  if (taskIds.length === 0) return {};

  const profile = await getCurrentProfile();
  const exec = isExec(profile.role);
  const leads = await canLeadProject(projectId, profile.id, exec);

  if (!leads) {
    return { error: "Only PMs/SCs can reassign tasks." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ assignee_id: newAssigneeId })
    .in("id", taskIds);
  if (error) return { error: error.message };

  revalidatePath(`/portal/projects/${projectId}`);
  revalidatePath("/portal/tasks");
  return {};
}

export async function deleteTask(taskId: string, projectId: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  const exec = isExec(profile.role);
  const leads = await canLeadProject(projectId, profile.id, exec);

  if (!leads) {
    const supabase = await createClient();
    const { data: task } = await supabase
      .from("tasks")
      .select("assignee_id, is_default_task")
      .eq("id", taskId)
      .single();

    if (!task || task.assignee_id !== profile.id) {
      return { error: "You can only delete your own tasks." };
    }
    if (task.is_default_task) {
      return { error: "The default tracked tasks can't be deleted -- ask your PM/SC." };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) return { error: error.message };

  revalidatePath(`/portal/projects/${projectId}`);
  revalidatePath("/portal/tasks");
  return {};
}
