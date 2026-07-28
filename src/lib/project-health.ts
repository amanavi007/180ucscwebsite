import type { ProjectHealth, TaskStatus } from "@/lib/supabase/database.types";
import { formatOrgDate } from "@/lib/date";

interface HealthTask {
  status: TaskStatus;
  due_date: string | null;
}

interface HealthProject {
  status: string;
  deadline: string | null;
  health_manual_override: ProjectHealth | null;
}

const DEADLINE_WARNING_DAYS = 7;
const FINAL_STATUSES = new Set(["ready_for_final_deliverable", "archived"]);

/**
 * At_risk if any incomplete milestone task is overdue, or the deadline is
 * within a week while the project isn't essentially done. Blocked is never
 * inferred -- it's always the manual override.
 */
export function computeProjectHealth(
  project: HealthProject,
  tasks: HealthTask[],
  today: Date = new Date(),
): ProjectHealth {
  if (project.health_manual_override) {
    return project.health_manual_override;
  }

  const todayStr = formatOrgDate(today);

  const hasOverdueTask = tasks.some(
    (t) => t.status !== "done" && t.due_date !== null && t.due_date < todayStr,
  );
  if (hasOverdueTask) return "at_risk";

  if (project.deadline && !FINAL_STATUSES.has(project.status)) {
    const deadline = new Date(project.deadline);
    const daysUntil = Math.floor(
      (deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysUntil <= DEADLINE_WARNING_DAYS) return "at_risk";
  }

  return "on_track";
}
