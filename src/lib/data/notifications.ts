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
 * coffee_chat_bookings, interview_bookings) -- no event log to write to on every mutation. "Unread"
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
  // concurrently instead of one round trip at a time. The read marker and
  // coffee-chat bookings are kicked off in a second wave once those resolve.
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

  let lastReadAt = readRow?.last_read_at;
  const needsReadMarker = !lastReadAt;
  if (needsReadMarker) {
    lastReadAt = new Date().toISOString();
  }

  const [, { data: coffeeChatBookings }, { data: interviewBookings }, { data: clientMeetings }] = await Promise.all([
    needsReadMarker
      ? supabase.from("notification_reads").insert({ user_id: userId, last_read_at: lastReadAt })
      : Promise.resolve(null),
    // Inner-joined + filtered to slots this exec is on *in the query*, so the
    // limit applies to their own bookings rather than everyone's.
    isExecUser
      ? supabase
          .from("coffee_chat_bookings")
          .select(
            "id, applicant_name, status, created_at, cancelled_at, slot:coffee_chat_slots!inner(id, exec_id_1, exec_id_2)",
          )
          .or(`exec_id_1.eq.${userId},exec_id_2.eq.${userId}`, { referencedTable: "slot" })
          .order("created_at", { ascending: false })
          .limit(15)
      : Promise.resolve({ data: null }),
    isExecUser
      ? (async () => {
          const { data: mine } = await supabase.from("interview_slot_execs").select("slot_id").eq("exec_id", userId);
          const slotIds = (mine ?? []).map((r) => r.slot_id);
          if (slotIds.length === 0) return { data: [] };
          return supabase
            .from("interview_bookings")
            .select("id, applicant_name, status, created_at, cancelled_at")
            .in("slot_id", slotIds)
            .order("created_at", { ascending: false })
            .limit(15);
        })()
      : Promise.resolve({ data: null }),
    isExecUser
      ? supabase
          .from("client_meetings")
          .select("id, business_name, status, meeting_url, created_at, cancelled_at")
          .contains("panel_exec_ids", [userId])
          .order("created_at", { ascending: false })
          .limit(15)
      : Promise.resolve({ data: null }),
  ]);

  // Review pipeline: PM/SC hear when a draft is ready for their comments, and
  // execs hear when they're auto-assigned to review a finished PM/SC revision.
  const [{ data: leadMemberships }, { data: execReviews }] = await Promise.all([
    supabase
      .from("memberships")
      .select("project_id")
      .eq("user_id", userId)
      .in("team_role", ["pm", "sc"]),
    isExecUser
      ? supabase
          .from("task_exec_reviews")
          .select(
            "assigned_at, task:tasks!inner(id, task_name, project_id, stage_step, assignee:profiles(name), project:projects(client_name))",
          )
          .eq("exec_id", userId)
          .is("reviewed_at", null)
          .order("assigned_at", { ascending: false })
          .limit(15)
      : Promise.resolve({ data: null }),
  ]);

  const leadProjectIds = (leadMemberships ?? []).map((m) => m.project_id);
  const { data: commentTasks } =
    leadProjectIds.length > 0
      ? await supabase
          .from("tasks")
          .select("id, task_name, project_id, updated_at, assignee:profiles(name), project:projects(client_name)")
          .in("project_id", leadProjectIds)
          .eq("stage_step", "pm_sc_comments")
          .neq("assignee_id", userId)
          .order("updated_at", { ascending: false })
          .limit(15)
      : { data: null };

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

  for (const t of (commentTasks ?? []) as unknown as {
    id: string;
    task_name: string;
    project_id: string;
    updated_at: string;
    assignee: { name: string } | null;
    project: { client_name: string } | null;
  }[]) {
    items.push({
      id: `pm-sc-comments-${t.id}`,
      message: `${t.assignee?.name ?? "A consultant"}'s "${t.task_name}"${t.project ? ` for ${t.project.client_name}` : ""} is ready for PM/SC comments.`,
      href: `/portal/projects/${t.project_id}`,
      occurredAt: t.updated_at,
    });
  }

  for (const r of (execReviews ?? []) as unknown as {
    assigned_at: string;
    task: {
      id: string;
      task_name: string;
      project_id: string;
      stage_step: string | null;
      assignee: { name: string } | null;
      project: { client_name: string } | null;
    } | null;
  }[]) {
    // A task sent back a step keeps its stale assignment rows; only live reviews notify.
    if (!r.task || r.task.stage_step !== "awaiting_exec_revision") continue;
    items.push({
      id: `exec-review-${r.task.id}`,
      message: `Review ${r.task.assignee?.name ?? "a consultant"}'s "${r.task.task_name}"${r.task.project ? ` for ${r.task.project.client_name}` : ""}.`,
      href: `/portal/projects/${r.task.project_id}`,
      occurredAt: r.assigned_at,
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

  interface CoffeeChatBookingNotificationRow {
    id: string;
    applicant_name: string;
    status: string;
    created_at: string;
    cancelled_at: string | null;
    slot: { id: string; exec_id_1: string; exec_id_2: string | null } | null;
  }

  const myCoffeeChatBookings = ((coffeeChatBookings ?? []) as unknown as CoffeeChatBookingNotificationRow[]).filter(
    (b) => b.slot && (b.slot.exec_id_1 === userId || b.slot.exec_id_2 === userId),
  );

  for (const b of myCoffeeChatBookings) {
    if (b.status === "confirmed") {
      items.push({
        id: `coffee-chat-booked-${b.id}`,
        message: `${b.applicant_name} booked a coffee chat with you.`,
        href: "/portal/admin/coffee-chats",
        occurredAt: b.created_at,
      });
    } else if (b.status === "cancelled" && b.cancelled_at) {
      items.push({
        id: `coffee-chat-cancelled-${b.id}`,
        message: `${b.applicant_name} cancelled their coffee chat with you.`,
        href: "/portal/admin/coffee-chats",
        occurredAt: b.cancelled_at,
      });
    }
  }

  for (const b of (interviewBookings ?? []) as { id: string; applicant_name: string; status: string; created_at: string; cancelled_at: string | null }[]) {
    if (b.status === "confirmed") {
      items.push({
        id: `interview-booked-${b.id}`,
        message: `${b.applicant_name} booked an interview with you.`,
        href: "/portal/admin/interviews?tab=schedule",
        occurredAt: b.created_at,
      });
    } else if (b.status === "cancelled" && b.cancelled_at) {
      items.push({
        id: `interview-cancelled-${b.id}`,
        message: `${b.applicant_name}'s interview with you was cancelled.`,
        href: "/portal/admin/interviews?tab=schedule",
        occurredAt: b.cancelled_at,
      });
    }
  }

  for (const b of (clientMeetings ?? []) as { id: string; business_name: string; status: string; meeting_url: string | null; created_at: string; cancelled_at: string | null }[]) {
    if (b.status === "confirmed") {
      items.push({
        id: `client-meeting-booked-${b.id}`,
        message: `${b.business_name} booked an intro call with you${b.meeting_url ? "." : ". Add the video link."}`,
        href: "/portal/admin/client-meetings?tab=bookings",
        occurredAt: b.created_at,
      });
    } else if (b.status === "cancelled" && b.cancelled_at) {
      items.push({
        id: `client-meeting-cancelled-${b.id}`,
        message: `${b.business_name}'s intro call with you was cancelled.`,
        href: "/portal/admin/client-meetings?tab=bookings",
        occurredAt: b.cancelled_at,
      });
    }
  }

  items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const trimmed = items.slice(0, 20);
  const unreadCount = trimmed.filter((i) => i.occurredAt > lastReadAt!).length;

  return { items: trimmed, unreadCount };
}
