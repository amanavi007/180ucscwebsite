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
