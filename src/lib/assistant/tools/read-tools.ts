import { isExec } from "@/lib/auth/roles";
import type { ReadResult, ToolDeps } from "./types";

function capped<T>(rows: T[], cap: number, note?: string): ReadResult<T> {
  return { items: rows.slice(0, cap), total: rows.length, truncated: rows.length > cap, ...(note ? { note } : {}) };
}
const empty = <T,>(note: string): ReadResult<T> => ({ items: [], total: 0, truncated: false, note });

export async function runMyOpenTasks(deps: ToolDeps) {
  const quarter = await deps.data.activeQuarter();
  if (!quarter) return empty<never>("There is no active quarter yet.");
  const rows = await deps.data.myOpenTasks(deps.profile.id, quarter.id);
  const compact = rows.map((t) => ({
    task: t.task_name,
    project: t.project?.client_name ?? null,
    due: t.due_date,
    status: t.status,
    priority: t.priority,
  }));
  // The exec to-do list is a separate, shared list. Show what is assigned to this exec or to nobody in particular.
  if (isExec(deps.profile.role)) {
    const todos = (await deps.data.openExecTodos())
      .filter((t) => t.assigned_to.length === 0 || t.assigned_to.includes(deps.profile.id))
      .map((t) => ({ task: t.title, project: "Exec to-do list", due: t.due_date, status: "not_started", priority: "medium" }));
    compact.push(...todos);
    compact.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  }
  return capped(compact, deps.rowCap, compact.length === 0 ? "No open tasks." : undefined);
}

export async function runMyProjects(deps: ToolDeps) {
  const quarter = await deps.data.activeQuarter();
  if (!quarter) return empty<never>("There is no active quarter yet.");
  const rows = await deps.data.myProjects(deps.profile.id, quarter.id);
  const compact = rows.map((p) => ({ client: p.client_name, status: p.status, health: p.health, deadline: p.deadline }));
  return capped(compact, deps.rowCap, compact.length === 0 ? "You are not on any projects this quarter (no projects found)." : undefined);
}

export async function runUpcomingEvents(deps: ToolDeps, todayIso: string) {
  const rows = (await deps.data.upcomingEvents())
    .filter((e) => e.date >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date));
  return capped(
    rows.map((e) => ({ date: e.date, title: e.title, type: e.type, time: e.time, location: e.location })),
    deps.rowCap,
    rows.length === 0 ? "No upcoming events." : undefined,
  );
}

export async function runTopApplicants(deps: ToolDeps) {
  if (!isExec(deps.profile.role)) return empty<never>("Recruitment data is only available to execs.");
  const quarter = await deps.data.activeQuarter();
  if (!quarter) return empty<never>("There is no active quarter yet.");
  const rows = (await deps.data.topApplicants(quarter.id)).sort((a, b) => b.total - a.total);
  return capped(rows, deps.rowCap, rows.length === 0 ? "No applicants yet." : undefined);
}

/** Exec only: everyone's attendance, lowest first, so "who has the worst attendance?" is one call. */
export async function runAttendanceReport(deps: ToolDeps) {
  if (!isExec(deps.profile.role)) return empty<never>("Team-wide attendance is only available to execs.");
  const quarter = await deps.data.activeQuarter();
  if (!quarter) return empty<never>("There is no active quarter yet.");
  const rows = (await deps.data.attendanceByMember(quarter.id))
    .filter((m) => m.rate !== null)
    .sort((a, b) => (a.rate as number) - (b.rate as number))
    .map((m) => ({
      name: m.name,
      team: m.team,
      ratePct: Math.round((m.rate as number) * 100),
      unexcused: m.unexcused,
      tardy: m.tardy,
      excused: m.excused,
    }));
  return capped(rows, deps.rowCap, rows.length === 0 ? "No attendance has been logged yet." : undefined);
}

export async function runMyAttendance(deps: ToolDeps) {
  const quarter = await deps.data.activeQuarter();
  if (!quarter) return { ratePct: null, unexcused: 0, tardy: 0, excused: 0, note: "There is no active quarter yet." };
  const a = await deps.data.myAttendance(deps.profile.id, quarter.id);
  return {
    ratePct: a.rate === null ? null : Math.round(a.rate * 100),
    unexcused: a.unexcused,
    tardy: a.tardy,
    excused: a.excused,
    ...(a.rate === null ? { note: "No sessions have been logged yet." } : {}),
  };
}

/** Every project in the quarter that the caller's permissions let them see. */
export async function runQuarterProjects(deps: ToolDeps) {
  const quarter = await deps.data.activeQuarter();
  if (!quarter) return empty<never>("There is no active quarter yet.");
  const rows = await deps.data.quarterProjects(quarter.id);
  const compact = rows.map((p) => ({
    client: p.client_name,
    status: p.status,
    health: p.health,
    deadline: p.deadline,
    pm: p.pm,
    sc: p.sc,
  }));
  return capped(compact, deps.rowCap, compact.length === 0 ? "No projects found this quarter." : undefined);
}

/** Names, roles and teams only. Contact details are deliberately never included. */
export async function runDirectory(deps: ToolDeps, query: string | undefined) {
  const quarter = await deps.data.activeQuarter();
  if (!quarter) return empty<never>("There is no active quarter yet.");
  const needle = query?.trim().toLowerCase();
  const rows = (await deps.data.directory(quarter.id)).filter(
    (p) =>
      !needle ||
      p.name.toLowerCase().includes(needle) ||
      p.role.toLowerCase().includes(needle) ||
      (p.team ?? "").toLowerCase().includes(needle),
  );
  return capped(
    rows.map((p) => ({ name: p.name, role: p.role, team: p.team })),
    deps.rowCap,
    rows.length === 0 ? "No matching people found." : undefined,
  );
}
