import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getProjects } from "@/lib/data/projects";
import { getDirectory } from "@/lib/data/directory";
import { getQuarterAttendanceRates } from "@/lib/data/attendance";
import { statusLabel, HEALTH_LABELS } from "@/lib/project-labels";
import { roleLabel } from "@/lib/auth/roles";
import type { MembershipTeamRole } from "@/lib/supabase/database.types";
import { fetchInChunks } from "@/lib/paginate";

export interface QuarterExportRow {
  name: string;
  email: string;
  orgRole: string;
  team: string;
  teamRole: string;
  attendanceRate: string;
  tasksDone: number;
  tasksTotal: number;
  projectStatus: string;
  projectHealth: string;
  projectDeadline: string;
}

const TEAM_ROLE_LABELS: Record<MembershipTeamRole, string> = {
  pm: "PM",
  sc: "SC",
  member: "Member",
};

/** One row per member: roster, attendance rate, task completion, and project outcome -- for board records. */
export async function getQuarterExportRows(quarterId: string): Promise<QuarterExportRow[]> {
  const supabase = await createClient();

  const [projects, directoryRows] = await Promise.all([
    getProjects(quarterId),
    getDirectory(quarterId),
  ]);
  const rates = await getQuarterAttendanceRates(quarterId, directoryRows);

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const projectIds = projects.map((p) => p.id);

  const taskCounts = new Map<string, { done: number; total: number }>();
  const teamRoleByUser = new Map<string, MembershipTeamRole>();

  if (projectIds.length > 0) {
    const [tasks, memberships] = await Promise.all([
      fetchInChunks(projectIds, (chunk, from, to) =>
        supabase.from("tasks").select("assignee_id, status").in("project_id", chunk).order("id").range(from, to),
      ),
      fetchInChunks(projectIds, (chunk, from, to) =>
        supabase.from("memberships").select("user_id, team_role").in("project_id", chunk).order("id").range(from, to),
      ),
    ]);

    for (const t of tasks) {
      if (!t.assignee_id) continue;
      const entry = taskCounts.get(t.assignee_id) ?? { done: 0, total: 0 };
      entry.total += 1;
      if (t.status === "done") entry.done += 1;
      taskCounts.set(t.assignee_id, entry);
    }
    for (const m of memberships) {
      teamRoleByUser.set(m.user_id, m.team_role);
    }
  }

  return directoryRows.map((row) => {
    const project = row.project_id ? projectById.get(row.project_id) : undefined;
    const counts = taskCounts.get(row.user_id) ?? { done: 0, total: 0 };
    const rate = rates[row.user_id]?.rate ?? null;
    const teamRole = teamRoleByUser.get(row.user_id);

    return {
      name: row.name,
      email: row.email,
      orgRole: roleLabel(row.role),
      team: row.client_name ?? "Unassigned",
      teamRole: teamRole ? TEAM_ROLE_LABELS[teamRole] : "",
      attendanceRate: rate === null ? "" : `${Math.round(rate * 100)}%`,
      tasksDone: counts.done,
      tasksTotal: counts.total,
      projectStatus: project ? statusLabel(project.status) : "",
      projectHealth: project ? HEALTH_LABELS[project.health_manual_override ?? project.health] : "",
      projectDeadline: project?.deadline ?? "",
    };
  });
}
