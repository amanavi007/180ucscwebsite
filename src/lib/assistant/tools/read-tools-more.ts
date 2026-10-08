import { isExec } from "@/lib/auth/roles";
import { findPerson, findProject } from "./lookup";
import { capped, empty } from "./read-tools";
import { resolveByName } from "./resolve";
import type { ToolDeps } from "./types";

const EXEC_ONLY = (what: string) => empty<never>(`${what} is only available to execs.`);
const NO_QUARTER = "There is no active quarter yet.";

/** One applicant by name with their point breakdown (exec only). */
export async function runApplicantDetail(deps: ToolDeps, name: string) {
  if (!isExec(deps.profile.role)) return { note: "Recruitment data is only available to execs." };
  const quarter = await deps.data.activeQuarter();
  if (!quarter) return { note: NO_QUARTER };
  const rows = await deps.data.applicants(quarter.id);
  const r = resolveByName(name, rows, (a) => a.name);
  if (r.kind === "none") return { note: `No applicant matches "${name}".` };
  if (r.kind === "many") return { note: `More than one applicant matches: ${r.items.slice(0, 6).map((a) => a.name).join("; ")}. Ask which.` };
  const a = r.item;
  const live = a.entries.filter((e) => !e.voided);
  return {
    name: a.name,
    total: a.total,
    major: a.major,
    year: a.year,
    notes: a.notes || null,
    points: live.map((e) => `${e.category}${e.event ? ` @ ${e.event}` : ""}: ${e.points}${e.reason ? ` (${e.reason})` : ""}`).join("; ") || "none yet",
  };
}

/** Point categories and this quarter's recruitment events: what an exec needs to know before awarding points. */
export async function runRecruitSetup(deps: ToolDeps) {
  if (!isExec(deps.profile.role)) return EXEC_ONLY("Recruitment setup");
  const quarter = await deps.data.activeQuarter();
  if (!quarter) return empty<never>(NO_QUARTER);
  const { categories, events } = await deps.data.recruitSetup(quarter.id);
  const rows = [
    ...categories.filter((c) => !c.archived).map((c) => ({ kind: "category", name: c.name, detail: `${c.section}, default ${c.defaultPoints} pts` })),
    ...events.map((e) => ({ kind: "event", name: e.name, detail: e.date })),
  ];
  return capped(rows, deps.rowCap * 3, rows.length === 0 ? "No recruitment categories or events yet." : undefined);
}

export async function runQuarters(deps: ToolDeps) {
  if (!isExec(deps.profile.role)) return EXEC_ONLY("The quarter list");
  const rows = (await deps.data.quarters()).map((q) => ({ name: q.name, start: q.start, end: q.end, active: q.isActive }));
  return capped(rows, deps.rowCap, rows.length === 0 ? "No quarters yet." : undefined);
}

export async function runClients(deps: ToolDeps, query: string | undefined) {
  if (!isExec(deps.profile.role)) return EXEC_ONLY("The client list");
  const needle = query?.trim().toLowerCase();
  const rows = (await deps.data.clients())
    .filter((c) => !needle || c.name.toLowerCase().includes(needle))
    .map((c) => ({ client: c.name, contact: c.contact, projects: c.projects, lastQuarter: c.lastQuarter, current: c.current }));
  return capped(rows, deps.rowCap, rows.length === 0 ? "No clients found." : undefined);
}

export async function runAlumni(deps: ToolDeps, query: string | undefined) {
  const needle = query?.trim().toLowerCase();
  const rows = (await deps.data.alumni())
    .filter((a) => !needle || `${a.name} ${a.company ?? ""} ${a.title ?? ""} ${a.projects.join(" ")}`.toLowerCase().includes(needle))
    .map((a) => ({ name: a.name, title: a.title, company: a.company, projects: a.projects.join(", ") }));
  return capped(rows, deps.rowCap, rows.length === 0 ? "No alumni found." : undefined);
}

/** Upcoming coffee chats, interviews and client meetings (exec only). */
export async function runScheduling(deps: ToolDeps, todayIso: string, kind?: string) {
  if (!isExec(deps.profile.role)) return EXEC_ONLY("Scheduling");
  const rows = (await deps.data.bookings())
    .filter((b) => b.status === "confirmed" && b.date >= todayIso && (!kind || b.kind === kind))
    .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))
    .map((b) => ({ type: b.kind.replace("_", " "), when: `${b.date} ${b.start.slice(0, 5)}`, who: b.who, execs: b.withExecs.join(", ") }));
  return capped(rows, deps.rowCap, rows.length === 0 ? "No upcoming bookings." : undefined);
}

export async function runMeetingDates(deps: ToolDeps, todayIso: string) {
  const quarter = await deps.data.activeQuarter();
  if (!quarter) return empty<never>(NO_QUARTER);
  const dates = (await deps.data.meetingDates(quarter.id)).sort();
  const upcoming = dates.filter((d) => d >= todayIso);
  return capped(
    upcoming.map((d) => ({ date: d })),
    deps.rowCap,
    dates.length === 0 ? "No meeting days are set for this quarter." : upcoming.length === 0 ? "All meeting days this quarter have passed." : undefined,
  );
}

export async function runTeamPlans(deps: ToolDeps) {
  if (!isExec(deps.profile.role)) return EXEC_ONLY("Team Builder");
  const quarter = await deps.data.activeQuarter();
  if (!quarter) return empty<never>(NO_QUARTER);
  const rows = (await deps.data.teamPlans(quarter.id)).map((p) => ({ plan: p.name, status: p.finalized ? "finalized" : "draft" }));
  return capped(rows, deps.rowCap, rows.length === 0 ? "No team plans yet." : undefined);
}

/** A team's logged attendance sessions, newest first. */
export async function runProjectAttendance(deps: ToolDeps, project: string) {
  const p = await findProject(deps, project);
  if (!p.ok) return empty<never>(p.reason);
  const rows = (await deps.data.attendanceHistory(p.item.id)).sort((a, b) => b.date.localeCompare(a.date));
  return capped(
    rows.map((h) => ({ date: h.date, takenBy: h.takenBy, excused: h.excused, unexcused: h.unexcused, tardy: h.tardy })),
    deps.rowCap,
    rows.length === 0 ? `${p.item.client_name} has no attendance logged yet.` : undefined,
  );
}

/** Exec only: which teams have not logged attendance for meeting days so far. */
export async function runTeamAttendanceStatus(deps: ToolDeps, todayIso: string) {
  if (!isExec(deps.profile.role)) return EXEC_ONLY("Team attendance status");
  const quarter = await deps.data.activeQuarter();
  if (!quarter) return empty<never>(NO_QUARTER);
  const rows = (await deps.data.teamAttendance(quarter.id, todayIso))
    .filter((t) => !t.loggedToday || t.missingDates.length > 0)
    .map((t) => ({ team: t.client, loggedToday: t.loggedToday, missingDates: t.missingDates.join(", ") || null }));
  return capped(rows, deps.rowCap, rows.length === 0 ? "Every team is up to date on attendance." : undefined);
}

/** One person: role, team, task load, and (exec or self only) attendance. */
export async function runPersonDetail(deps: ToolDeps, name: string, todayIso: string) {
  const quarter = await deps.data.activeQuarter();
  if (!quarter) return { note: NO_QUARTER };
  const who = /^(me|myself)$/i.test(name.trim()) ? { ok: true as const, item: { id: deps.profile.id, name: deps.profile.name, role: "", team: null } } : await findPerson(deps, name);
  if (!who.ok) return { note: who.reason };
  const [dir, tasks] = await Promise.all([
    deps.data.directory(quarter.id),
    deps.data.tasks(quarter.id, { assigneeId: who.item.id }),
  ]);
  const rows = dir.filter((d) => d.id === who.item.id);
  const open = tasks.filter((t) => t.status !== "done");
  const out: Record<string, unknown> = {
    name: who.item.name,
    role: rows[0]?.role ?? null,
    teams: rows.map((r) => r.team).filter(Boolean).join(", ") || null,
    tasksOpen: open.length,
    tasksOverdue: open.filter((t) => t.due_date !== null && t.due_date < todayIso).length,
    tasksDone: tasks.length - open.length,
  };
  if (isExec(deps.profile.role) || who.item.id === deps.profile.id) {
    const att = who.item.id === deps.profile.id
      ? await deps.data.myAttendance(deps.profile.id, quarter.id)
      : (await deps.data.attendanceByMember(quarter.id)).find((m) => m.name === who.item.name);
    if (att && att.rate !== null) out.attendancePct = Math.round(att.rate * 100);
  }
  return out;
}
