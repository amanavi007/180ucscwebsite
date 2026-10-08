import "server-only";
import { getActiveQuarter } from "@/lib/data/quarters";
import { getMyProjects } from "@/lib/data/projects";
import { getVisibleTasks } from "@/lib/data/tasks";
import { getExecTodos } from "@/lib/data/exec-todos";
import { getCalendarEvents } from "@/lib/data/calendar";
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
import { getApplicantRows, getRecruitCategories, getRecruitEvents } from "@/lib/data/recruit";
import { getQuarters } from "@/lib/data/quarters";
import { getClients } from "@/lib/data/clients";
import { getAlumni } from "@/lib/data/alumni";
import { getAllBookings } from "@/lib/data/coffee-chat";
import { getInterviewBookings } from "@/lib/data/interview";
import { getClientMeetingBookings } from "@/lib/data/client-meeting";
import { getMeetingDatesForQuarter } from "@/lib/data/meeting-dates";
import { getPlansForQuarter } from "@/lib/data/team-builder";
import { getAttendanceHistory, getTeamAttendanceStatus } from "@/lib/data/attendance";
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
    calendarItems: async () =>
      (await getCalendarEvents()).map((e) => ({
        id: e.sourceId, kind: e.type, date: e.date, title: e.title, time: e.time, location: e.location,
        description: e.description, canManage: e.canManage, projectId: e.projectId,
      })),
    applicants: async (quarterId) =>
      (await getApplicantRows(quarterId)).map((a) => ({
        id: a.id, name: a.name, email: a.email, major: a.major, year: a.year, notes: a.notes, total: a.total,
        entries: a.entries.map((e) => ({
          id: e.id, category: e.categoryName, event: e.eventName, points: e.points, reason: e.reason, voided: e.voidedAt !== null,
        })),
      })),
    recruitSetup: async (quarterId) => {
      const [categories, events] = await Promise.all([getRecruitCategories(), getRecruitEvents(quarterId)]);
      return {
        categories: categories.map((c) => ({ id: c.id, name: c.name, section: c.section, defaultPoints: c.defaultPoints, archived: c.archived })),
        events: events.map((e) => ({ id: e.id, name: e.name, date: e.date, categoryId: e.categoryId })),
      };
    },
    quarters: async () =>
      (await getQuarters()).map((q) => ({ id: q.id, name: q.name, start: q.start_date, end: q.end_date, isActive: q.is_active })),
    clients: async () =>
      (await getClients()).map((c) => ({
        id: c.id, name: c.name, contact: c.contactName, projects: c.projectCount, lastQuarter: c.lastQuarterName, current: c.isCurrent,
      })),
    alumni: async () =>
      (await getAlumni()).map((a) => ({
        userId: a.userId, name: a.name, title: a.currentTitle, company: a.currentCompany, linkedin: a.linkedinUrl,
        projects: a.projects.map((p) => p.clientName),
      })),
    bookings: async () => {
      const [coffee, interviews, clients] = await Promise.all([getAllBookings(), getInterviewBookings(), getClientMeetingBookings()]);
      return [
        ...coffee.map((b) => ({
          kind: "coffee_chat" as const, id: b.id, who: b.applicantName, date: b.date, start: b.startTime, end: b.endTime,
          status: b.status, withExecs: [b.exec1Name, b.exec2Name].filter((n): n is string => !!n),
        })),
        ...interviews.map((b) => ({
          kind: "interview" as const, id: b.id, who: b.applicantName, date: b.date, start: b.startTime, end: b.endTime,
          status: b.status, withExecs: b.execNames,
        })),
        ...clients.map((b) => ({
          kind: "client_meeting" as const, id: b.id, who: `${b.contactName} (${b.businessName})`, date: b.date, start: b.startTime,
          end: b.endTime, status: b.status, withExecs: b.panelNames,
        })),
      ];
    },
    meetingDates: async (quarterId) => getMeetingDatesForQuarter(quarterId),
    teamPlans: async (quarterId) =>
      (await getPlansForQuarter(quarterId)).map((p) => ({ id: p.id, name: p.name, finalized: p.isFinalized })),
    attendanceHistory: async (projectId) =>
      (await getAttendanceHistory(projectId)).map((h) => ({
        date: h.date, takenBy: h.taken_by_name, excused: h.excused, unexcused: h.unexcused, tardy: h.tardy,
      })),
    teamAttendance: async (quarterId, todayIso) =>
      (await getTeamAttendanceStatus(quarterId, todayIso)).map((t) => ({
        projectId: t.projectId, client: t.clientName, loggedToday: t.loggedToday, missingDates: t.missingDates,
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
        members: members.map((m) => ({ id: m.user_id, name: m.profile?.name ?? "Unknown", team_role: m.team_role })),
      };
    },
    wikiPages: async (canViewPm) => {
      const sections = canViewPm ? (["consultant", "pm"] as const) : (["consultant"] as const);
      const pages = (await Promise.all(sections.map((s) => getWikiPages(s)))).flat();
      return pages.map((w) => ({ id: w.id, parent_id: w.parent_id, title: w.title, slug: w.slug, section: w.section, body: w.body, updated_at: w.updated_at }));
    },
    quickLinks: async () =>
      (await getQuickLinks()).map((l) => ({ id: l.id, title: l.title, url: l.url, description: l.description, category: l.category })),
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
