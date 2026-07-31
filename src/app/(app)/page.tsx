import type { Metadata } from "next";
import Link from "next/link";
import { addDays, format } from "date-fns";
import { getCurrentProfile } from "@/lib/data/profile";
import { getActiveQuarter } from "@/lib/data/quarters";
import { getProjects, getMyProjects, getMyTeamRole, getProjectMembers } from "@/lib/data/projects";
import { getVisibleTasks } from "@/lib/data/tasks";
import { getDirectory } from "@/lib/data/directory";
import {
  getMyAttendanceSummary,
  getQuarterAttendanceRates,
  getSessionForDate,
  getTeamAttendanceStatus,
} from "@/lib/data/attendance";
import { getAttendanceAlertThreshold } from "@/lib/data/org-settings";
import { getMeetingDatesForQuarter } from "@/lib/data/meeting-dates";
import { getRoomBookingForProject, getRoomBookingsForDate } from "@/lib/data/room-bookings";
import { getExecTodos } from "@/lib/data/exec-todos";
import { isExec, roleLabel } from "@/lib/auth/roles";
import { getOrgTodayDateString, formatOrgDate, parseLocalDate } from "@/lib/date";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HealthBadge } from "@/components/health-badge";
import { RosterAvatars } from "@/components/roster-avatars";
import { ExecTodoList } from "./exec-todo-list";
import { AlertTriangle, MapPin } from "lucide-react";
import { TASK_PRIORITY_LABELS } from "@/lib/project-labels";
import { cn } from "@/lib/utils";
import type { TaskWithProject } from "@/lib/data/types";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  const activeQuarter = await getActiveQuarter();
  const exec = isExec(profile.role);

  if (!activeQuarter) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome, {profile.name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">{roleLabel(profile.role)}</p>
        </div>

        {exec ? (
          <Card className="border-primary/30 bg-accent">
            <CardHeader>
              <CardTitle>Set up your first quarter</CardTitle>
              <CardDescription>
                No active quarter yet. Projects and attendance are scoped to a
                quarter, so create one before adding projects.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button nativeButton={false} render={<Link href="/admin">Go to Admin</Link>} />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>No active quarter yet</CardTitle>
              <CardDescription>
                An exec needs to set up this quarter before projects and
                attendance are available. Check back soon.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    );
  }

  const today = getOrgTodayDateString();
  const weekOut = formatOrgDate(addDays(new Date(), 7));

  const [myProjects, myTasksRaw, meetingDates, attendanceSummary, threshold] = await Promise.all([
    getMyProjects(profile.id, activeQuarter.id),
    getVisibleTasks({ assigneeId: profile.id }),
    getMeetingDatesForQuarter(activeQuarter.id),
    getMyAttendanceSummary(profile.id, activeQuarter.id),
    getAttendanceAlertThreshold(),
  ]);
  const todayIsMeetingDay = meetingDates.includes(today);

  const myProjectIds = new Set(myProjects.map((p) => p.id));
  const myAllTasks = myTasksRaw.filter((t) => t.project_id && myProjectIds.has(t.project_id));
  const doneTaskCount = myAllTasks.filter((t) => t.status === "done").length;
  const openTasks = myAllTasks
    .filter((t) => t.status !== "done")
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  const myTasks = openTasks.slice(0, 8);

  // Roster, attendance nudge, and room-for-next-meeting are all independent per-project
  // lookups -- run all three batches concurrently rather than one after another.
  const nextMeetingDate = meetingDates.find((d) => d >= today) ?? null;

  const [rosterEntries, nudgeChecks, roomChecks] = await Promise.all([
    Promise.all(
      myProjects.map(async (project) => [project.id, await getProjectMembers(project.id)] as const),
    ),
    todayIsMeetingDay
      ? Promise.all(
          myProjects.map(async (project) => {
            const role = await getMyTeamRole(project.id, profile.id);
            if (role !== "pm" && role !== "sc") return null;
            const session = await getSessionForDate(project.id, today);
            return session ? null : { projectId: project.id, clientName: project.client_name };
          }),
        )
      : Promise.resolve([]),
    nextMeetingDate
      ? Promise.all(
          myProjects.map(async (project) => {
            const room = await getRoomBookingForProject(project.id, nextMeetingDate);
            return room
              ? {
                  projectId: project.id,
                  clientName: project.client_name,
                  room,
                  isToday: nextMeetingDate === today,
                }
              : null;
          }),
        )
      : Promise.resolve([]),
  ]);

  const roster = new Map(rosterEntries);

  // Direct nudge for whoever leads one of their own teams: don't let today's attendance slip.
  const pendingAttendanceNudges = nudgeChecks.filter(
    (c): c is { projectId: string; clientName: string } => !!c,
  );

  // Where each of my teams is meeting next (today if it's a meeting day, otherwise
  // the closest upcoming one) -- so a room booked ahead of time is visible right away,
  // not just on the day of.
  const nextRooms = roomChecks.filter(
    (r): r is { projectId: string; clientName: string; room: string; isToday: boolean } => !!r,
  );

  let summary: {
    activeProjects: number;
    tasksDueThisWeek: number;
    atRiskProjects: { id: string; clientName: string }[];
    belowThresholdMembers: { userId: string; name: string; rate: number }[];
    missingAttendanceTeams: { projectId: string; clientName: string }[];
    unbookedRoomTeams: { projectId: string; clientName: string }[];
  } | null = null;
  let execTodos: Awaited<ReturnType<typeof getExecTodos>> = [];
  let execMembers: { id: string; name: string }[] = [];

  if (exec) {
    // All independent of each other -- fire concurrently rather than one round trip at a time.
    const [allProjects, orgTasks, directoryRows, todosResult, teamStatusResult, bookingsResult] =
      await Promise.all([
        getProjects(activeQuarter.id),
        getVisibleTasks({}),
        getDirectory(activeQuarter.id),
        getExecTodos(),
        todayIsMeetingDay ? getTeamAttendanceStatus(activeQuarter.id, today) : Promise.resolve(null),
        nextMeetingDate ? getRoomBookingsForDate(activeQuarter.id, nextMeetingDate) : Promise.resolve(null),
      ]);
    execTodos = todosResult;

    const activeProjectIds = new Set(allProjects.map((p) => p.id));

    const atRiskProjects = allProjects
      .filter((p) => p.health !== "on_track")
      .map((p) => ({ id: p.id, clientName: p.client_name }));
    const tasksDueThisWeek = orgTasks.filter(
      (t) =>
        t.project_id &&
        activeProjectIds.has(t.project_id) &&
        t.status !== "done" &&
        t.due_date &&
        t.due_date >= today &&
        t.due_date <= weekOut,
    ).length;

    // Depends on directoryRows, so this is the one fetch that can't join the batch above.
    const rates = await getQuarterAttendanceRates(activeQuarter.id, directoryRows);
    const belowThresholdMembers = directoryRows
      .filter((m) => {
        const r = rates[m.user_id];
        return r && r.rate !== null && r.rate < threshold;
      })
      .map((m) => ({ userId: m.user_id, name: m.name, rate: rates[m.user_id].rate as number }));

    execMembers = directoryRows.filter((m) => isExec(m.role)).map((m) => ({ id: m.user_id, name: m.name }));

    const missingAttendanceTeams = (teamStatusResult ?? [])
      .filter((t) => !t.loggedToday)
      .map((t) => ({ projectId: t.projectId, clientName: t.clientName }));

    const unbookedRoomTeams = (bookingsResult ?? [])
      .filter((b) => !b.roomName)
      .map((b) => ({ projectId: b.projectId, clientName: b.clientName }));

    summary = {
      activeProjects: allProjects.filter((p) => p.status !== "archived").length,
      tasksDueThisWeek,
      atRiskProjects,
      belowThresholdMembers,
      missingAttendanceTeams,
      unbookedRoomTeams,
    };
  }

  const taskGroups: { label: string; tasks: TaskWithProject[] }[] = [
    { label: "Overdue", tasks: myTasks.filter((t) => t.due_date && t.due_date < today) },
    {
      label: "This week",
      tasks: myTasks.filter((t) => t.due_date && t.due_date >= today && t.due_date <= weekOut),
    },
    {
      label: "Later",
      tasks: myTasks.filter((t) => !t.due_date || t.due_date > weekOut),
    },
  ].filter((g) => g.tasks.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {profile.name.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          {roleLabel(profile.role)} · {activeQuarter.name}
        </p>
      </div>

      {nextRooms.length > 0 && (
        <div className="space-y-2">
          {nextRooms.map((r) => (
            <Alert key={r.projectId} tone="primary">
              <MapPin />
              {r.clientName} meets in <span className="font-medium">{r.room}</span>{" "}
              {r.isToday
                ? "today."
                : `next time (${nextMeetingDate ? format(parseLocalDate(nextMeetingDate), "EEE, MMM d") : ""}).`}
            </Alert>
          ))}
        </div>
      )}

      {pendingAttendanceNudges.length > 0 && (
        <div className="space-y-2">
          {pendingAttendanceNudges.map((n) => (
            <Alert
              key={n.projectId}
              render={<Link href={`/attendance?team=${n.projectId}`} />}
            >
              <AlertTriangle />
              {n.clientName} hasn&apos;t logged today&apos;s attendance yet -- it&apos;s a meeting
              day. Log it now.
            </Alert>
          ))}
        </div>
      )}

      {myProjects.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <StatTile
            label="Your attendance"
            value={attendanceSummary.rate === null ? "--" : `${Math.round(attendanceSummary.rate * 100)}%`}
            detail={
              attendanceSummary.rate === null
                ? "No sessions logged yet"
                : attendanceSummary.rate < threshold
                  ? `Below the ${Math.round(threshold * 100)}% target`
                  : "This quarter"
            }
            tone={attendanceSummary.rate !== null && attendanceSummary.rate < threshold ? "warning" : undefined}
            href="/attendance"
          />
          <StatTile
            label="Tasks this quarter"
            value={`${doneTaskCount}/${myAllTasks.length}`}
            detail={myAllTasks.length === 0 ? "Nothing assigned yet" : "Done"}
            href="/tasks"
          />
        </div>
      )}

      {myProjects.length > 0 && (
        <div className="space-y-2">
          {myProjects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="flex flex-wrap items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{project.client_name}</span>
                <span className="text-xs text-muted-foreground">
                  PM: {project.project_manager?.name ?? "Unassigned"}
                  {project.senior_consultant && ` · SC: ${project.senior_consultant.name}`}
                </span>
              </div>
              <RosterAvatars members={roster.get(project.id) ?? []} />
              <div className="flex shrink-0 items-center gap-2">
                <HealthBadge health={project.health} />
                {project.deadline && (
                  <span className="text-xs text-muted-foreground">
                    Due {format(parseLocalDate(project.deadline), "MMM d")}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">My tasks</CardTitle>
          <CardDescription>Open tasks assigned to you this quarter.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {myProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You&apos;re not on a team this quarter yet.
            </p>
          ) : taskGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing on your plate right now.</p>
          ) : (
            taskGroups.map((group) => (
              <div key={group.label} className="space-y-1">
                <p
                  className={cn(
                    "text-xs font-medium tracking-wide uppercase",
                    group.label === "Overdue" ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {group.label}
                </p>
                {group.tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/projects/${task.project_id}`}
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        {task.task_name}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {task.project?.client_name ?? "Unknown project"}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="secondary">{TASK_PRIORITY_LABELS[task.priority]}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {task.due_date ? format(parseLocalDate(task.due_date), "MMM d") : "No due date"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
          <div>
            <Link href="/tasks" className="text-sm text-primary hover:underline">
              View all tasks
            </Link>
          </div>
        </CardContent>
      </Card>

      {summary && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">Org overview</h2>
              <StatTile size="sm" label="Active projects" value={summary.activeProjects} href="/projects" />
              <StatTile
                size="sm"
                label="Tasks due this week"
                value={summary.tasksDueThisWeek}
                href="/tasks?mine=0"
              />
            </div>

            <Card className="min-w-[280px] flex-1">
              <CardHeader>
                <CardTitle className="text-base">Exec to-dos</CardTitle>
                <CardDescription>Shared admin checklist -- not tied to a project.</CardDescription>
              </CardHeader>
              <CardContent>
                <ExecTodoList todos={execTodos} execMembers={execMembers} today={today} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Needs attention</CardTitle>
              <CardDescription>Org-wide items worth a look right now.</CardDescription>
            </CardHeader>
            <CardContent>
              {summary.atRiskProjects.length === 0 &&
              summary.belowThresholdMembers.length === 0 &&
              summary.missingAttendanceTeams.length === 0 &&
              summary.unbookedRoomTeams.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing needs attention right now -- everything&apos;s on track.
                </p>
              ) : (
                <div>
                  <AttentionRow
                    icon={AlertTriangle}
                    label={`${summary.atRiskProjects.length} project${summary.atRiskProjects.length === 1 ? "" : "s"} at risk`}
                    items={summary.atRiskProjects.map((p) => ({
                      key: p.id,
                      label: p.clientName,
                      href: `/projects/${p.id}`,
                    }))}
                  />
                  <AttentionRow
                    icon={AlertTriangle}
                    label={`${summary.belowThresholdMembers.length} below attendance target`}
                    items={summary.belowThresholdMembers.map((m) => ({
                      key: m.userId,
                      label: `${m.name} (${Math.round(m.rate * 100)}%)`,
                      href: "/directory",
                    }))}
                  />
                  <AttentionRow
                    icon={AlertTriangle}
                    label={`${summary.missingAttendanceTeams.length} haven't logged today's attendance`}
                    items={summary.missingAttendanceTeams.map((t) => ({
                      key: t.projectId,
                      label: t.clientName,
                      href: `/attendance?team=${t.projectId}`,
                    }))}
                  />
                  <AttentionRow
                    icon={MapPin}
                    label={`${summary.unbookedRoomTeams.length} need a room for ${
                      nextMeetingDate ? format(parseLocalDate(nextMeetingDate), "EEE, MMM d") : "the next meeting"
                    }`}
                    items={summary.unbookedRoomTeams.map((t) => ({
                      key: t.projectId,
                      label: t.clientName,
                      href: "/admin/rooms",
                    }))}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function AttentionRow({
  icon: Icon,
  label,
  items,
}: {
  icon: typeof AlertTriangle;
  label: string;
  items: { key: string; label: string; href: string }[];
}) {
  if (items.length === 0) return null;
  const shown = items.slice(0, 8);
  const overflow = items.length - shown.length;

  return (
    <div className="flex flex-wrap items-start gap-2 border-b py-3 last:border-b-0">
      <div className="flex w-full items-center gap-2 text-sm font-medium text-warning sm:w-64 sm:shrink-0">
        <Icon className="size-4 shrink-0" />
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs text-warning hover:bg-warning/20"
          >
            {item.label}
          </Link>
        ))}
        {overflow > 0 && (
          <span className="px-1 py-0.5 text-xs text-muted-foreground">+{overflow} more</span>
        )}
      </div>
    </div>
  );
}

/** One stat idiom, two sizes: "lg" (label + detail + big value) for personal stats, "sm" (compact, inline) for org overview counts. */
function StatTile({
  label,
  value,
  detail,
  tone,
  href,
  size = "lg",
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: "warning";
  href: string;
  size?: "sm" | "lg";
}) {
  const warn = tone === "warning";

  if (size === "sm") {
    return (
      <Link href={href}>
        <Card className="w-fit transition-colors hover:bg-muted/50">
          <CardContent className="flex items-center gap-2 px-3 py-2">
            <p className={cn("text-lg font-semibold", warn && "text-warning")}>{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </CardContent>
        </Card>
      </Link>
    );
  }

  return (
    <Link href={href}>
      <Card className="transition-colors hover:bg-muted/50">
        <CardContent className="flex items-center justify-between py-4">
          <div>
            <p className="text-sm font-medium">{label}</p>
            {detail && (
              <p className={cn("text-xs", warn ? "text-warning" : "text-muted-foreground")}>{detail}</p>
            )}
          </div>
          <p className={cn("text-2xl font-semibold", warn && "text-warning")}>{value}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
