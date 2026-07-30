import type { Metadata } from "next";
import Link from "next/link";
import { addDays, format } from "date-fns";
import { getCurrentProfile } from "@/lib/data/profile";
import { getActiveQuarter } from "@/lib/data/quarters";
import { getProjects, getMyProjects, getMyTeamRole } from "@/lib/data/projects";
import { getVisibleTasks } from "@/lib/data/tasks";
import { getDirectory } from "@/lib/data/directory";
import {
  getQuarterAttendanceRates,
  getSessionForDate,
  getTeamAttendanceStatus,
} from "@/lib/data/attendance";
import { getAttendanceAlertThreshold } from "@/lib/data/org-settings";
import { getMeetingDatesForQuarter } from "@/lib/data/meeting-dates";
import { getRoomBookingForProject } from "@/lib/data/room-bookings";
import { isExec, roleLabel } from "@/lib/auth/roles";
import { getOrgTodayDateString, formatOrgDate, parseLocalDate } from "@/lib/date";
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
import { AlertTriangle, MapPin } from "lucide-react";
import { TASK_PRIORITY_LABELS } from "@/lib/project-labels";

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

  const [myProjects, myTasksRaw, meetingDates] = await Promise.all([
    getMyProjects(profile.id, activeQuarter.id),
    getVisibleTasks({ assigneeId: profile.id }),
    getMeetingDatesForQuarter(activeQuarter.id),
  ]);
  const todayIsMeetingDay = meetingDates.includes(today);

  const myProjectIds = new Set(myProjects.map((p) => p.id));
  const myTasks = myTasksRaw
    .filter((t) => t.status !== "done" && t.project_id && myProjectIds.has(t.project_id))
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))
    .slice(0, 6);

  // Direct nudge for whoever leads one of their own teams: don't let today's attendance slip.
  let pendingAttendanceNudges: { projectId: string; clientName: string }[] = [];
  if (todayIsMeetingDay) {
    const checks = await Promise.all(
      myProjects.map(async (project) => {
        const role = await getMyTeamRole(project.id, profile.id);
        if (role !== "pm" && role !== "sc") return null;
        const session = await getSessionForDate(project.id, today);
        return session ? null : { projectId: project.id, clientName: project.client_name };
      }),
    );
    pendingAttendanceNudges = checks.filter((c): c is { projectId: string; clientName: string } => !!c);
  }

  // Where each of my teams is meeting next (today if it's a meeting day, otherwise
  // the closest upcoming one) -- so a room booked ahead of time is visible right away,
  // not just on the day of.
  let nextRooms: { projectId: string; clientName: string; room: string; isToday: boolean }[] = [];
  const nextMeetingDate = meetingDates.find((d) => d >= today) ?? null;
  if (nextMeetingDate) {
    const roomChecks = await Promise.all(
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
    );
    nextRooms = roomChecks.filter(
      (r): r is { projectId: string; clientName: string; room: string; isToday: boolean } => !!r,
    );
  }

  let summary: {
    activeProjects: number;
    atRisk: number;
    tasksDueThisWeek: number;
    belowThreshold: number;
    missingToday: number | null;
  } | null = null;

  if (exec) {
    const weekOut = formatOrgDate(addDays(new Date(), 7));

    const [allProjects, orgTasks] = await Promise.all([
      getProjects(activeQuarter.id),
      getVisibleTasks({}),
    ]);
    const activeProjectIds = new Set(allProjects.map((p) => p.id));

    const atRisk = allProjects.filter((p) => p.health !== "on_track").length;
    const tasksDueThisWeek = orgTasks.filter(
      (t) =>
        t.project_id &&
        activeProjectIds.has(t.project_id) &&
        t.status !== "done" &&
        t.due_date &&
        t.due_date >= today &&
        t.due_date <= weekOut,
    ).length;

    const directoryRows = await getDirectory(activeQuarter.id);
    const [rates, threshold] = await Promise.all([
      getQuarterAttendanceRates(activeQuarter.id, directoryRows),
      getAttendanceAlertThreshold(),
    ]);
    const belowThreshold = Object.values(rates).filter(
      (r) => r.rate !== null && r.rate < threshold,
    ).length;

    let missingToday: number | null = null;
    if (todayIsMeetingDay) {
      const teamStatus = await getTeamAttendanceStatus(activeQuarter.id, today);
      missingToday = teamStatus.filter((t) => !t.loggedToday).length;
    }

    summary = {
      activeProjects: allProjects.filter((p) => p.status !== "archived").length,
      atRisk,
      tasksDueThisWeek,
      belowThreshold,
      missingToday,
    };
  }

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
            <div
              key={r.projectId}
              className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary"
            >
              <MapPin className="size-4 shrink-0" />
              {r.clientName} meets in <span className="font-medium">{r.room}</span>{" "}
              {r.isToday
                ? "today."
                : `next time (${nextMeetingDate ? format(parseLocalDate(nextMeetingDate), "EEE, MMM d") : ""}).`}
            </div>
          ))}
        </div>
      )}

      {pendingAttendanceNudges.length > 0 && (
        <div className="space-y-2">
          {pendingAttendanceNudges.map((n) => (
            <Link
              key={n.projectId}
              href={`/attendance?team=${n.projectId}`}
              className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 hover:bg-amber-500/15 dark:text-amber-400"
            >
              <AlertTriangle className="size-4 shrink-0" />
              {n.clientName} hasn&apos;t logged today&apos;s attendance yet -- it&apos;s a meeting
              day. Log it now.
            </Link>
          ))}
        </div>
      )}

      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile label="Active projects" value={summary.activeProjects} href="/projects" />
          <SummaryTile
            label="At risk"
            value={summary.atRisk}
            href="/projects"
            tone={summary.atRisk > 0 ? "warning" : undefined}
          />
          <SummaryTile
            label="Tasks due this week"
            value={summary.tasksDueThisWeek}
            href="/tasks?mine=0"
          />
          <SummaryTile
            label="Below attendance threshold"
            value={summary.belowThreshold}
            href="/directory"
            tone={summary.belowThreshold > 0 ? "warning" : undefined}
          />
          {summary.missingToday !== null && (
            <SummaryTile
              label="Missing today's attendance"
              value={summary.missingToday}
              href="/attendance"
              tone={summary.missingToday > 0 ? "warning" : undefined}
            />
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">My tasks</CardTitle>
            <CardDescription>Open tasks assigned to you this quarter.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {myTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing on your plate right now.</p>
            ) : (
              myTasks.map((task) => (
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
              ))
            )}
            <div className="pt-2">
              <Link href="/tasks" className="text-sm text-primary hover:underline">
                View all tasks
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">My team{myProjects.length === 1 ? "" : "s"}</CardTitle>
            <CardDescription>Projects you&apos;re on this quarter.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {myProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You&apos;re not on a team this quarter yet.
              </p>
            ) : (
              myProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-b-0 hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {project.client_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      PM: {project.project_manager?.name ?? "Unassigned"}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <HealthBadge health={project.health} />
                    {project.deadline && (
                      <span className="text-xs text-muted-foreground">
                        Due {format(parseLocalDate(project.deadline), "MMM d")}
                      </span>
                    )}
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: number;
  href: string;
  tone?: "warning";
}) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:bg-muted/50">
        <CardContent className="pt-6">
          <p
            className={
              tone === "warning"
                ? "text-3xl font-semibold text-amber-600 dark:text-amber-400"
                : "text-3xl font-semibold"
            }
          >
            {value}
          </p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
