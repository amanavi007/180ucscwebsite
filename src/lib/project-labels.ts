import type {
  ProjectHealth,
  ProjectStatus,
  TaskPriority,
  TaskStatus,
  TaskType,
} from "@/lib/supabase/database.types";

export const PROJECT_STATUSES: ProjectStatus[] = [
  "initial_research",
  "issue_tree",
  "preliminary_research",
  "implementable_creation",
  "deliverable_slide_work",
  "presentation_practice",
  "ready_for_final_deliverable",
  "archived",
];

export const TASK_TYPES: TaskType[] = [
  "initial_research",
  "issue_tree",
  "preliminary_research",
  "implementable_creation",
  "deliverable_slide_work",
  "presentation_practice",
  "ready_for_final_deliverable",
];

function toLabel(value: string): string {
  return value
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export function statusLabel(status: ProjectStatus): string {
  return toLabel(status);
}

export function taskTypeLabel(type: TaskType): string {
  return toLabel(type);
}

export const HEALTH_LABELS: Record<ProjectHealth, string> = {
  on_track: "On track",
  at_risk: "At risk",
  blocked: "Blocked",
};

export const HEALTH_BADGE_CLASS: Record<ProjectHealth, string> = {
  on_track: "bg-primary/10 text-primary border-transparent",
  at_risk: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-transparent",
  blocked: "bg-destructive/10 text-destructive border-transparent",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};
