import "server-only";
import { getActiveQuarter } from "@/lib/data/quarters";
import { getMyProjects } from "@/lib/data/projects";
import { getVisibleTasks } from "@/lib/data/tasks";
import { getExecTodos } from "@/lib/data/exec-todos";
import { getCalendarEvents } from "@/lib/data/calendar";
import { getApplicantRows } from "@/lib/data/recruit";
import { getMyAttendanceSummary, getQuarterAttendanceRates } from "@/lib/data/attendance";
import { getDirectory } from "@/lib/data/directory";
import { getProject, getProjectMembers, getProjects } from "@/lib/data/projects";
import { getWikiPages } from "@/lib/data/wiki";
import { getQuickLinks } from "@/lib/data/quick-links";
import { getMyNotifications } from "@/lib/data/notifications";
import { getConsultantStatsRollup } from "@/lib/data/consultant-stats";
import { getAuditLog } from "@/lib/data/audit";
import { getAdminAttentionItems } from "@/lib/data/admin-attention";
import { globalSearch } from "@/actions/search";
import { roleLabel } from "@/lib/auth/roles";
import type { DataAccess } from "./types";

export function realDataAccess(): DataAccess {
  return {
    activeQuarter: async () => {
      const q = await getActiveQuarter();
      return q ? { id: q.id, name: q.name } : null;
    },
    myProjects: async (userId, quarterId) =>
      (await getMyProjects(userId, quarterId)).map((p) => ({
        id: p.id, client_name: p.client_name, status: p.status, health: p.health, deadline: p.deadline,
      })),
    myOpenTasks: async (userId, quarterId) =>
      (await getVisibleTasks({ assigneeId: userId, quarterId }))
        .filter((t) => t.status !== "done")
        .map((t) => ({
          id: t.id, task_name: t.task_name, due_date: t.due_date, status: t.status,
          priority: t.priority, project: t.project ? { client_name: t.project.client_name } : null,
        })),
    openExecTodos: async () =>
      (await getExecTodos())
        .filter((t) => t.status === "open")
        .map((t) => ({ id: t.id, title: t.title, due_date: t.due_date, assigned_to: t.assigned_to })),
    upcomingEvents: async () =>
      (await getCalendarEvents()).map((e) => ({
        date: e.date, title: e.title, type: e.type, time: e.time, location: e.location,
      })),
    topApplicants: async (quarterId) =>
      (await getApplicantRows(quarterId)).map((a) => ({ name: a.name, total: a.total })),
    attendanceByMember: async (quarterId) => {
      const people = await getDirectory(quarterId);
      const rates = await getQuarterAttendanceRates(quarterId, people);
      return people.map((m) => {
        const r = rates[m.user_id];
        return {
          name: m.name,
          team: m.client_name,
          rate: r?.rate ?? null,
          unexcused: r?.unexcusedCount ?? 0,
          tardy: r?.tardyCount ?? 0,
          excused: r?.excusedCount ?? 0,
        };
      });
    },
    myAttendance: async (userId, quarterId) => {
      const a = await getMyAttendanceSummary(userId, quarterId);
      return {
        rate: a.rate,
        unexcused: a.unexcusedCount,
        tardy: a.tardyCount,
        excused: a.excusedCount,
        totalSessions: a.totalSessions,
      };
    },
    quarterProjects: async (quarterId) =>
      (await getProjects(quarterId)).map((p) => ({
        id: p.id,
        client_name: p.client_name,
        status: p.status,
        health: p.health,
        deadline: p.deadline,
        pm: p.project_manager?.name ?? null,
        sc: p.senior_consultant?.name ?? null,
      })),
    directory: async (quarterId) =>
      (await getDirectory(quarterId)).map((m) => ({
        id: m.user_id,
        name: m.name,
        role: roleLabel(m.role),
        team: m.client_name,
      })),
    tasks: async (quarterId, filters) =>
      (await getVisibleTasks({ quarterId, ...filters })).map((t) => ({
        id: t.id,
        task_name: t.task_name,
        due_date: t.due_date,
        status: t.status,
        priority: t.priority,
        task_type: t.task_type,
        project_id: t.project_id,
        project: t.project?.client_name ?? null,
        assignee_id: t.assignee_id,
        assignee: t.assignee?.name ?? null,
      })),
    projectDetail: async (projectId) => {
      const [p, members] = await Promise.all([getProject(projectId), getProjectMembers(projectId)]);
      return {
        id: p.id,
        client_name: p.client_name,
        status: p.status,
        health: p.health,
        deadline: p.deadline,
        pm: p.project_manager?.name ?? null,
        sc: p.senior_consultant?.name ?? null,
        members: members.map((m) => ({ name: m.profile?.name ?? "Unknown", team_role: m.team_role })),
      };
    },
    wikiPages: async (canViewPm) => {
      const sections = canViewPm ? (["consultant", "pm"] as const) : (["consultant"] as const);
      const pages = (await Promise.all(sections.map((s) => getWikiPages(s)))).flat();
      return pages.map((w) => ({ title: w.title, slug: w.slug, section: w.section, body: w.body, updated_at: w.updated_at }));
    },
    quickLinks: async () =>
      (await getQuickLinks()).map((l) => ({ title: l.title, url: l.url, description: l.description, category: l.category })),
    notifications: async (userId, exec) => getMyNotifications(userId, exec),
    search: async (query) =>
      (await globalSearch(query)).map((r) => ({ type: r.type, title: r.title, subtitle: r.subtitle, href: r.href })),
    memberStats: async (quarterId) =>
      (await getConsultantStatsRollup(quarterId)).map((r) => ({
        name: r.name,
        role: r.orgRole,
        team: r.team,
        attendanceRate: r.attendanceRate,
        tasksDone: r.tasksDone,
        tasksTotal: r.tasksTotal,
        overdueTasks: r.overdueTasks,
      })),
    activityLog: async (limit) =>
      (await getAuditLog(limit)).map((a) => ({
        action: a.action, target: a.targetLabel, detail: a.detail, actor: a.actorName, at: a.createdAt,
      })),
    attentionItems: async (quarterId) =>
      (await getAdminAttentionItems(quarterId)).map((i) => ({ label: i.label, href: i.href })),
  };
}
