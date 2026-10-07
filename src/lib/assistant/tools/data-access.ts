import "server-only";
import { getActiveQuarter } from "@/lib/data/quarters";
import { getMyProjects } from "@/lib/data/projects";
import { getVisibleTasks } from "@/lib/data/tasks";
import { getCalendarEvents } from "@/lib/data/calendar";
import { getApplicantRows } from "@/lib/data/recruit";
import { getMyAttendanceSummary, getQuarterAttendanceRates } from "@/lib/data/attendance";
import { getDirectory } from "@/lib/data/directory";
import { getProjects } from "@/lib/data/projects";
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
        name: m.name,
        role: roleLabel(m.role),
        team: m.client_name,
      })),
  };
}
