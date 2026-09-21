import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getDirectory } from "@/lib/data/directory";
import { getQuarterAttendanceRates } from "@/lib/data/attendance";
import { getOrgTodayDateString } from "@/lib/date";
import { roleLabel } from "@/lib/auth/roles";
import type { AttendanceRateResult } from "@/lib/attendance";

export interface ConsultantStatsRow {
  userId: string;
  name: string;
  orgRole: string;
  team: string;
  attendanceRate: number | null;
  tasksDone: number;
  tasksTotal: number;
  overdueTasks: number;
}

/**
 * One row per member for the quarter: attendance rate and task completion,
 * the two tracked metrics that already have real data (there's no
 * work-quality rating system yet). Exec-only, like the attendance rates
 * it's built on.
 */
export async function getConsultantStatsRollup(quarterId: string): Promise<ConsultantStatsRow[]> {
  const supabase = await createClient();
  const today = getOrgTodayDateString();

  const directoryRows = await getDirectory(quarterId);
  const rates = await getQuarterAttendanceRates(quarterId, directoryRows);

  const projectIds = [
    ...new Set(directoryRows.map((r) => r.project_id).filter((id): id is string => !!id)),
  ];

  const taskCounts = new Map<string, { done: number; total: number; overdue: number }>();

  if (projectIds.length > 0) {
    const { data: tasks, error } = await supabase
      .from("tasks")
      .select("assignee_id, status, due_date")
      .in("project_id", projectIds);
    if (error) throw error;

    for (const t of tasks ?? []) {
      if (!t.assignee_id) continue;
      const entry = taskCounts.get(t.assignee_id) ?? { done: 0, total: 0, overdue: 0 };
      entry.total += 1;
      if (t.status === "done") entry.done += 1;
      else if (t.due_date && t.due_date < today) entry.overdue += 1;
      taskCounts.set(t.assignee_id, entry);
    }
  }

  return directoryRows.map((row) => {
    const counts = taskCounts.get(row.user_id) ?? { done: 0, total: 0, overdue: 0 };
    const rate: AttendanceRateResult | undefined = rates[row.user_id];
    return {
      userId: row.user_id,
      name: row.name,
      orgRole: roleLabel(row.role),
      team: row.client_name ?? "Unassigned",
      attendanceRate: rate?.rate ?? null,
      tasksDone: counts.done,
      tasksTotal: counts.total,
      overdueTasks: counts.overdue,
    };
  });
}
