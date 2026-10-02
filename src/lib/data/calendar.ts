import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";

export interface CalendarEvent {
  /** Prefixed with the source type so ids stay unique across merged sources. */
  id: string;
  /** Raw row id in its source table -- what edit/delete actions take. */
  sourceId: string;
  date: string;
  title: string;
  type: "meeting" | "deadline" | "event" | "project";
  subtitle: string | null;
  time: string | null;
  location: string | null;
  description: string | null;
  href: string | null;
  /** Whether the current viewer may edit/delete this item (exec for org events, PM/SC for project items). */
  canManage: boolean;
  /** Set only on "project" events -- which project the add/edit dialog should preselect. */
  projectId: string | null;
  /** Set only on "project" events with a specific consultant tagged. */
  consultantId: string | null;
}

export interface LeadProject {
  id: string;
  clientName: string;
  members: { id: string; name: string }[];
}

/** Projects the current user leads (PM or SC on), for the "add my item" dialog. Exec sees none here -- they use org events instead. */
export async function getMyLeadProjects(): Promise<LeadProject[]> {
  const supabase = await createClient();
  const profile = await getCurrentProfile();

  const { data: led, error: ledError } = await supabase
    .from("memberships")
    .select("project:projects(id, client_name)")
    .eq("user_id", profile.id)
    .in("team_role", ["pm", "sc"]);
  if (ledError) throw ledError;

  const projects = (led ?? []) as unknown as { project: { id: string; client_name: string } | null }[];
  const results: LeadProject[] = [];
  for (const { project } of projects) {
    if (!project) continue;
    const { data: members, error: membersError } = await supabase
      .from("memberships")
      .select("profile:profiles(id, name)")
      .eq("project_id", project.id);
    if (membersError) throw membersError;
    results.push({
      id: project.id,
      clientName: project.client_name,
      members: ((members ?? []) as unknown as { profile: { id: string; name: string } | null }[])
        .map((m) => m.profile)
        .filter((p): p is { id: string; name: string } => p !== null),
    });
  }
  return results;
}

/**
 * Everything that belongs on the org calendar: attendance-tracked meeting
 * days, project deadlines, and hand-authored org events. RLS already scopes
 * meeting_dates/org_events to "everyone" and projects to "exec or on the
 * project", so this needs no extra filtering -- each query only returns
 * what the caller is allowed to see.
 */
export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const exec = isExec(profile.role);

  const [meetings, projects, events, projectEvents, leadRows] = await Promise.all([
    supabase.from("meeting_dates").select("id, date, quarter:quarters(name)"),
    supabase
      .from("projects")
      .select("id, client_name, deadline, quarter:quarters(name)")
      .not("deadline", "is", null),
    supabase
      .from("org_events")
      .select("id, title, date, time, location, description")
      .order("date", { ascending: true }),
    supabase
      .from("project_events")
      .select(
        "id, project_id, consultant_id, title, date, time, location, description, project:projects(client_name), consultant:profiles!project_events_consultant_id_fkey(name)",
      )
      .order("date", { ascending: true }),
    supabase
      .from("memberships")
      .select("project_id")
      .eq("user_id", profile.id)
      .in("team_role", ["pm", "sc"]),
  ]);
  if (meetings.error) throw meetings.error;
  if (projects.error) throw projects.error;
  if (events.error) throw events.error;
  if (projectEvents.error) throw projectEvents.error;
  if (leadRows.error) throw leadRows.error;

  const ledProjectIds = new Set((leadRows.data ?? []).map((r) => r.project_id));

  const result: CalendarEvent[] = [];

  for (const m of (meetings.data ?? []) as unknown as {
    id: string;
    date: string;
    quarter: { name: string } | null;
  }[]) {
    result.push({
      id: `meeting-${m.id}`,
      sourceId: m.id,
      date: m.date,
      title: "Meeting day",
      type: "meeting",
      subtitle: m.quarter?.name ?? null,
      time: null,
      location: null,
      description: null,
      href: null,
      canManage: false,
      projectId: null,
      consultantId: null,
    });
  }

  for (const p of (projects.data ?? []) as unknown as {
    id: string;
    client_name: string;
    deadline: string;
    quarter: { name: string } | null;
  }[]) {
    result.push({
      id: `deadline-${p.id}`,
      sourceId: p.id,
      date: p.deadline,
      title: `Deadline: ${p.client_name}`,
      type: "deadline",
      subtitle: p.quarter?.name ?? null,
      time: null,
      location: null,
      description: null,
      href: `/portal/projects/${p.id}`,
      canManage: false,
      projectId: null,
      consultantId: null,
    });
  }

  for (const e of events.data ?? []) {
    result.push({
      id: `event-${e.id}`,
      sourceId: e.id,
      date: e.date,
      title: e.title,
      type: "event",
      subtitle: e.location,
      time: e.time,
      location: e.location,
      description: e.description,
      href: null,
      canManage: exec,
      projectId: null,
      consultantId: null,
    });
  }

  for (const pe of (projectEvents.data ?? []) as unknown as {
    id: string;
    project_id: string;
    consultant_id: string | null;
    title: string;
    date: string;
    time: string | null;
    location: string | null;
    description: string | null;
    project: { client_name: string } | null;
    consultant: { name: string } | null;
  }[]) {
    result.push({
      id: `project-${pe.id}`,
      sourceId: pe.id,
      date: pe.date,
      title: pe.title,
      type: "project",
      subtitle: [pe.project?.client_name, pe.consultant?.name].filter(Boolean).join(" · ") || null,
      time: pe.time,
      location: pe.location,
      description: pe.description,
      href: null,
      // Deliberately not "|| exec" -- these are the PM/SC's own items, not org-wide,
      // and this UI has no project picker populated for exec to edit someone else's.
      // RLS still allows exec to manage them at the DB layer as a defense-in-depth
      // fallback; this just keeps the calendar UI from offering a broken edit dialog.
      canManage: ledProjectIds.has(pe.project_id),
      projectId: pe.project_id,
      consultantId: pe.consultant_id,
    });
  }

  return result;
}
