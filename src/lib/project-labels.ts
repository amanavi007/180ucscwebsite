import type {
  ProjectHealth,
  ProjectStatus,
  TaskPriority,
  TaskStageStep,
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
  "preliminary_research",
  "implementables",
  "deliverable",
  "other",
];

/** Task types that track progress via a 4-step timeline instead of a plain status. */
export const STEPPED_TASK_TYPES: TaskType[] = ["preliminary_research", "deliverable"];

export const TASK_STAGE_STEPS: TaskStageStep[] = [
  "draft_in_progress",
  "draft_complete",
  "revisions_in_progress",
  "complete",
];

export const TASK_STAGE_STEP_LABELS: Record<TaskStageStep, string> = {
  draft_in_progress: "Draft in progress",
  draft_complete: "Draft complete (awaiting revision)",
  revisions_in_progress: "Revisions in progress",
  complete: "Complete",
};

export const TASK_STAGE_STEP_SHORT_LABELS: Record<TaskStageStep, string> = {
  draft_in_progress: "Draft",
  draft_complete: "Awaiting revision",
  revisions_in_progress: "Revising",
  complete: "Complete",
};

/**
 * A stepped task shows as plain "Not started" (stage_step null) until it's
 * kicked off -- from then on any step is active progress, so only
 * "complete" maps to done. Derived so status-based filters (dashboards,
 * "due this week", etc.) stay meaningful.
 */
export function statusForStageStep(step: TaskStageStep): TaskStatus {
  return step === "complete" ? "done" : "in_progress";
}

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

const TASK_TYPE_ORDER = new Map(TASK_TYPES.map((t, i) => [t, i]));

/**
 * The 5 default tasks are bulk-inserted in one trigger execution, so their
 * created_at timestamps are identical (or near enough) and give Postgres no
 * stable tiebreaker -- deleting one row could visibly reshuffle the rest.
 * Sort by the canonical stage order instead so it never moves around.
 */
export function sortTasksByStage<T extends { task_type: TaskType; created_at: string }>(
  tasks: T[],
): T[] {
  return [...tasks].sort((a, b) => {
    const rankDiff =
      (TASK_TYPE_ORDER.get(a.task_type) ?? 99) - (TASK_TYPE_ORDER.get(b.task_type) ?? 99);
    if (rankDiff !== 0) return rankDiff;
    return a.created_at.localeCompare(b.created_at);
  });
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

export const TASK_STATUS_BADGE_CLASS: Record<TaskStatus, string> = {
  not_started: "bg-muted text-muted-foreground border-transparent",
  in_progress: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-transparent",
  done: "bg-primary/10 text-primary border-transparent",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const TASK_PRIORITY_DOT_CLASS: Record<TaskPriority, string> = {
  low: "bg-muted-foreground/40",
  medium: "bg-amber-500",
  high: "bg-destructive",
};
