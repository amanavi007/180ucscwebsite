import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface NotificationItem {
  id: string;
  message: string;
  href: string;
  occurredAt: string;
}

export interface NotificationFeed {
  items: NotificationItem[];
  unreadCount: number;
}

/**
 * Computed from existing tables (tasks, exec_todos, memberships,
 * room_bookings) -- no event log to write to on every mutation. "Unread"
 * is just "newer than the last time this person opened the bell," tracked
 * in notification_reads. A first-ever open marks the current moment as
 * read so a newly shipped feature doesn't dump old history as unread.
 */
export async function getMyNotifications(
  userId: string,
  isExecUser: boolean,
): Promise<NotificationFeed> {
  const supabase = await createClient();

  // The four selects below are all independent of each other -- fire them
  // concurrently instead of one round trip at a time. Room bookings is the
  // one exception (it needs the project ids from memberships), so it's
  // kicked off in a second wave once memberships resolves.
  const [{ data: readRow }, { data: tasks }, { data: todos }, { data: memberships }] = await Promise.all([
    supabase.from("notification_reads").select("last_read_at").eq("user_id", userId).maybeSingle(),
    supabase
      .from("tasks")
      .select("id, task_name, project_id, updated_at, project:projects(client_name)")
      .eq("assignee_id", userId)
      .order("updated_at", { ascending: false })
      .limit(15),
    isExecUser
      ? supabase
          .from("exec_todos")
          .select("id, title, updated_at")
          .contains("assigned_to", [userId])
          .order("updated_at", { ascending: false })
          .limit(15)
      : Promise.resolve({ data: null }),
    supabase
      .from("memberships")
      .select("project_id, created_at, project:projects(client_name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const membershipRows = (memberships ?? []) as unknown as {
    project_id: string;
    created_at: string;
    project: { client_name: string } | null;
  }[];
  const myProjectIds = membershipRows.map((m) => m.project_id);

  let lastReadAt = readRow?.last_read_at;
  const needsReadMarker = !lastReadAt;
  if (needsReadMarker) {
    lastReadAt = new Date().toISOString();
  }

  const [, { data: bookings }] = await Promise.all([
    needsReadMarker
      ? supabase.from("notification_reads").insert({ user_id: userId, last_read_at: lastReadAt })
      : Promise.resolve(null),
    myProjectIds.length > 0
      ? supabase
          .from("room_bookings")
          .select("project_id, room_name, date, updated_at, project:projects(client_name)")
          .in("project_id", myProjectIds)
          .gte("date", new Date().toISOString().slice(0, 10))
          .order("updated_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: null }),
  ]);

  const items: NotificationItem[] = [];

  for (const t of (tasks ?? []) as unknown as {
    id: string;
    task_name: string;
    project_id: string;
    updated_at: string;
    project: { client_name: string } | null;
  }[]) {
    items.push({
      id: `task-${t.id}`,
      message: `You're assigned "${t.task_name}"${t.project ? ` for ${t.project.client_name}` : ""}.`,
      href: `/portal/projects/${t.project_id}`,
      occurredAt: t.updated_at,
    });
  }

  for (const td of (todos ?? []) as { id: string; title: string; updated_at: string }[]) {
    items.push({
      id: `todo-${td.id}`,
      message: `You're assigned the to-do "${td.title}".`,
      href: "/portal",
      occurredAt: td.updated_at,
    });
  }

  for (const m of membershipRows) {
    items.push({
      id: `team-${m.project_id}`,
      message: `You were added to ${m.project?.client_name ?? "a team"}.`,
      href: `/portal/projects/${m.project_id}`,
      occurredAt: m.created_at,
    });
  }

  for (const b of (bookings ?? []) as unknown as {
    project_id: string;
    room_name: string;
    date: string;
    updated_at: string;
    project: { client_name: string } | null;
  }[]) {
    items.push({
      id: `room-${b.project_id}-${b.date}`,
      message: `${b.project?.client_name ?? "Your team"} is in ${b.room_name} on ${b.date}.`,
      href: "/portal",
      occurredAt: b.updated_at,
    });
  }

  items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const trimmed = items.slice(0, 20);
  const unreadCount = trimmed.filter((i) => i.occurredAt > lastReadAt!).length;

  return { items: trimmed, unreadCount };
}
