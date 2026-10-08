import { isElevatedOrAbove, isExec } from "@/lib/auth/roles";
import { findPerson, findProject } from "./lookup";
import { resolveByName } from "./resolve";
import { searchWiki, wikiHref } from "./wiki-search";
import type { ReadResult, ToolDeps } from "./types";

export function capped<T>(rows: T[], cap: number, note?: string): ReadResult<T> {
  return { items: rows.slice(0, cap), total: rows.length, truncated: rows.length > cap, ...(note ? { note } : {}) };
}
export const empty = <T,>(note: string): ReadResult<T> => ({ items: [], total: 0, truncated: false, note });

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

export async function runUpcomingEvents(deps: ToolDeps, todayIso: string, opts: { days?: number; query?: string } = {}) {
  const needle = opts.query?.trim().toLowerCase();
  const until = opts.days ? new Date(Date.parse(`${todayIso}T00:00:00Z`) + opts.days * 86_400_000).toISOString().slice(0, 10) : null;
  const rows = (await deps.data.upcomingEvents())
    .filter((e) => e.date >= todayIso)
    .filter((e) => !until || e.date <= until)
    .filter((e) => !needle || `${e.title} ${e.type} ${e.location ?? ""}`.toLowerCase().includes(needle))
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

/** Tasks across the team (RLS decides what the caller may see). Name filters are resolved, never guessed. */
export async function runTasks(
  deps: ToolDeps,
  filters: { project?: string; assignee?: string; status?: string; overdueOnly?: boolean },
  todayIso: string,
) {
  const quarter = await deps.data.activeQuarter();
  if (!quarter) return empty<never>("There is no active quarter yet.");
  const query: { projectId?: string; assigneeId?: string; status?: string } = {};
  if (filters.project) {
    const p = await findProject(deps, filters.project);
    if (!p.ok) return empty<never>(p.reason);
    query.projectId = p.item.id;
  }
  if (filters.assignee) {
    const a = await findPerson(deps, filters.assignee);
    if (!a.ok) return empty<never>(a.reason);
    query.assigneeId = a.item.id;
  }
  if (filters.status) query.status = filters.status;
  let rows = await deps.data.tasks(quarter.id, query);
  if (!filters.status) rows = rows.filter((t) => t.status !== "done");
  if (filters.overdueOnly) rows = rows.filter((t) => t.due_date !== null && t.due_date < todayIso && t.status !== "done");
  const compact = rows.map((t) => ({
    task: t.task_name,
    project: t.project,
    assignee: t.assignee,
    due: t.due_date,
    status: t.status,
    priority: t.priority,
  }));
  return capped(compact, deps.rowCap, compact.length === 0 ? "No matching tasks." : undefined);
}

export async function runProjectDetail(deps: ToolDeps, query: string, todayIso: string) {
  const found = await findProject(deps, query);
  if (!found.ok) return { note: found.reason };
  const [detail, tasks] = await Promise.all([
    deps.data.projectDetail(found.item.id),
    deps.data.tasks((await deps.data.activeQuarter())!.id, { projectId: found.item.id }),
  ]);
  const open = tasks.filter((t) => t.status !== "done");
  return {
    client: detail.client_name,
    status: detail.status,
    health: detail.health,
    deadline: detail.deadline,
    pm: detail.pm,
    sc: detail.sc,
    team: detail.members.map((m) => (m.team_role === "member" ? m.name : `${m.name} (${m.team_role.toUpperCase()})`)).join(", "),
    tasksDone: tasks.length - open.length,
    tasksOpen: open.length,
    tasksOverdue: open.filter((t) => t.due_date !== null && t.due_date < todayIso).length,
    nextTasks: open
      .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))
      .slice(0, 6)
      .map((t) => `${t.task_name} [${t.assignee ?? "unassigned"}, ${t.status}${t.due_date ? `, due ${t.due_date}` : ""}]`)
      .join("; "),
    href: `/portal/projects/${detail.id}`,
  };
}

const flat = (body: string, max: number) => {
  const text = body.replace(/^#{1,6}\s+/gm, "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/**
 * The Resources wiki as the consultants' guide. A question returns the best-matching passages from up to
 * three pages (so the model can answer from them and cite the page); `read` returns one page's full text.
 */
export async function runWiki(deps: ToolDeps, query: string, read: boolean) {
  const pages = await deps.data.wikiPages(isElevatedOrAbove(deps.profile.role));
  if (read) {
    const exact = resolveByName(query, pages, (p) => p.title);
    const page = exact.kind === "one" ? exact.item : exact.kind === "many" ? exact.items[0] : searchWiki(pages, query, { maxPages: 1 }).map((h) => pages.find((p) => p.slug === h.slug && p.section === h.section)!)[0];
    if (!page) return { note: "No resources page matches that." };
    return { title: page.title, section: page.section, updated: page.updated_at.slice(0, 10), content: flat(page.body, 6000), href: wikiHref(page.section, page.slug) };
  }
  const hits = searchWiki(pages, query);
  return capped(
    hits.map((h) => ({ title: h.title, section: h.section, excerpt: h.excerpt, href: wikiHref(h.section, h.slug) })),
    deps.rowCap,
    hits.length === 0 ? "No resources page covers that. Say so; do not invent a process, and suggest asking a PM or exec." : undefined,
  );
}

/** "What should I do now?": each of the user's projects with its stage, nearest tasks, and the guide passage for that stage. */
export async function runNextSteps(deps: ToolDeps, todayIso: string) {
  const quarter = await deps.data.activeQuarter();
  if (!quarter) return empty<never>("There is no active quarter yet.");
  const [projects, tasks, pages] = await Promise.all([
    deps.data.myProjects(deps.profile.id, quarter.id),
    deps.data.myOpenTasks(deps.profile.id, quarter.id),
    deps.data.wikiPages(isElevatedOrAbove(deps.profile.role)),
  ]);
  const rows = projects.map((p) => {
    const mine = tasks
      .filter((t) => t.project?.client_name === p.client_name)
      .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
    const stage = p.status.replace(/_/g, " ");
    const guide = searchWiki(pages, stage, { maxPages: 1, excerptChars: 450 })[0];
    return {
      project: p.client_name,
      stage,
      health: p.health,
      deadline: p.deadline,
      overdue: mine.filter((t) => t.due_date !== null && t.due_date < todayIso).length,
      nextTasks: mine.slice(0, 3).map((t) => `${t.task_name}${t.due_date ? ` (due ${t.due_date})` : ""}`).join("; ") || "none open",
      guide: guide ? `${guide.title}: ${guide.excerpt}` : null,
      guideHref: guide ? wikiHref(guide.section, guide.slug) : null,
    };
  });
  return capped(rows, deps.rowCap, rows.length === 0 ? "You are not on any projects this quarter." : undefined);
}

export async function runQuickLinks(deps: ToolDeps, query: string | undefined) {
  const needle = query?.trim().toLowerCase();
  const rows = (await deps.data.quickLinks()).filter(
    (l) => !needle || `${l.title} ${l.description ?? ""} ${l.category ?? ""}`.toLowerCase().includes(needle),
  );
  return capped(rows, deps.rowCap, rows.length === 0 ? "No quick links found." : undefined);
}

export async function runNotifications(deps: ToolDeps) {
  const feed = await deps.data.notifications(deps.profile.id, isExec(deps.profile.role));
  return capped(
    feed.items.map((n) => ({ message: n.message, when: n.occurredAt.slice(0, 10), href: n.href })),
    deps.rowCap,
    feed.items.length === 0 ? "No notifications." : `${feed.unreadCount} unread.`,
  );
}

export async function runSearch(deps: ToolDeps, query: string) {
  const rows = await deps.data.search(query);
  return capped(rows, deps.rowCap, rows.length === 0 ? "No results." : undefined);
}

/** Exec only: per-member attendance and task completion for the quarter. */
export async function runMemberStats(deps: ToolDeps, sortBy: "overdue" | "attendance" | "completion") {
  if (!isExec(deps.profile.role)) return empty<never>("Member stats are only available to execs.");
  const quarter = await deps.data.activeQuarter();
  if (!quarter) return empty<never>("There is no active quarter yet.");
  const rows = (await deps.data.memberStats(quarter.id)).map((r) => ({
    name: r.name,
    team: r.team,
    attendancePct: r.attendanceRate === null ? null : Math.round(r.attendanceRate * 100),
    done: r.tasksDone,
    total: r.tasksTotal,
    overdue: r.overdueTasks,
  }));
  rows.sort((a, b) =>
    sortBy === "overdue"
      ? b.overdue - a.overdue
      : sortBy === "attendance"
        ? (a.attendancePct ?? 101) - (b.attendancePct ?? 101)
        : (a.total ? a.done / a.total : 2) - (b.total ? b.done / b.total : 2),
  );
  return capped(rows, deps.rowCap, rows.length === 0 ? "No member stats yet." : undefined);
}

export async function runActivityLog(deps: ToolDeps) {
  if (!isExec(deps.profile.role)) return empty<never>("The activity log is only available to execs.");
  const rows = await deps.data.activityLog(Math.max(deps.rowCap, 10));
  return capped(
    rows.map((a) => ({ when: a.at.slice(0, 16).replace("T", " "), who: a.actor, action: a.action, target: a.target, detail: a.detail })),
    deps.rowCap,
    rows.length === 0 ? "No activity yet." : undefined,
  );
}

export async function runNeedsAttention(deps: ToolDeps) {
  if (!isExec(deps.profile.role)) return empty<never>("This is only available to execs.");
  const quarter = await deps.data.activeQuarter();
  if (!quarter) return empty<never>("There is no active quarter yet.");
  const rows = await deps.data.attentionItems(quarter.id);
  return capped(rows, deps.rowCap, rows.length === 0 ? "Nothing needs attention right now." : undefined);
}
