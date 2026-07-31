import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface CalendarEvent {
  /** Prefixed with the source type so ids stay unique across merged sources. */
  id: string;
  /** Raw row id in its source table -- what edit/delete actions take. */
  sourceId: string;
  date: string;
  title: string;
  type: "meeting" | "deadline" | "event";
  subtitle: string | null;
  time: string | null;
  location: string | null;
  description: string | null;
  href: string | null;
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

  const [meetings, projects, events] = await Promise.all([
    supabase.from("meeting_dates").select("id, date, quarter:quarters(name)"),
    supabase
      .from("projects")
      .select("id, client_name, deadline, quarter:quarters(name)")
      .not("deadline", "is", null),
    supabase
      .from("org_events")
      .select("id, title, date, time, location, description")
      .order("date", { ascending: true }),
  ]);
  if (meetings.error) throw meetings.error;
  if (projects.error) throw projects.error;
  if (events.error) throw events.error;

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
      href: `/projects/${p.id}`,
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
    });
  }

  return result;
}
