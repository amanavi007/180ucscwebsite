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
import { AlertTriangle } from "lucide-react";
import { TASK_PRIORITY_LABELS } from "@/lib/project-labels";
import { cn } from "@/lib/utils";
import type { TaskWithProject } from "@/lib/data/types";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const [profile, activeQuarter] = await Promise.all([getCurrentProfile(), getActiveQuarter()]);
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
              <Button nativeButton={false} render={<Link href="/portal/admin">Go to Admin</Link>} />
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
    getAttendanceAlertThreshold(exec),
  ]);
  const todayIsMeetingDay = meetingDates.includes(today);

  const myProjectIds = new Set(myProjects.map((p) => p.id));
  const myAllTasks = myTasksRaw.filter((t) => t.project_id && myProjectIds.has(t.project_id));
  const doneTaskCount = myAllTasks.filter((t) => t.status === "done").length;
  const openTasks = myAllTasks
    .filter((t) => t.status !== "done")
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  const myTasks = openTasks.slice(0, 8);

  // Roster and attendance nudge are independent per-project lookups -- run both batches
  // concurrently rather than one after another.
  const [rosterEntries, nudgeChecks] = await Promise.all([
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
  ]);

  const roster = new Map(rosterEntries);

  // Direct nudge for whoever leads one of their own teams: don't let today's attendance slip.
  const pendingAttendanceNudges = nudgeChecks.filter(
    (c): c is { projectId: string; clientName: string } => !!c,
  );

  let summary: {
    atRiskProjects: { id: string; clientName: string }[];
    belowThresholdMembers: { userId: string; name: string; rate: number }[];
    missingAttendanceTeams: { projectId: string; clientName: string }[];
  } | null = null;
  let execTodos: Awaited<ReturnType<typeof getExecTodos>> = [];
  let execMembers: { id: string; name: string }[] = [];

  if (exec) {
    // All independent of each other -- fire concurrently rather than one round trip at a time.
    const [allProjects, directoryRows, todosResult, teamStatusResult] =
      await Promise.all([
        getProjects(activeQuarter.id),
        getDirectory(activeQuarter.id),
        getExecTodos(),
        todayIsMeetingDay ? getTeamAttendanceStatus(activeQuarter.id, today) : Promise.resolve(null),
      ]);
    execTodos = todosResult;

    const atRiskProjects = allProjects
      .filter((p) => p.health !== "on_track")
      .map((p) => ({ id: p.id, clientName: p.client_name }));

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

    summary = {
      atRiskProjects,
      belowThresholdMembers,
      missingAttendanceTeams,
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
    <div>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome, {profile.name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">
            {roleLabel(profile.role)} · {activeQuarter.name}
          </p>
        </div>



        {pendingAttendanceNudges.length > 0 && (
          <div className="space-y-2">
            {pendingAttendanceNudges.map((n) => (
              <Alert
                key={n.projectId}
                render={<Link href={`/portal/attendance?team=${n.projectId}`} />}
              >
                <AlertTriangle />
                {n.clientName} hasn&apos;t logged today&apos;s attendance yet -- it&apos;s a meeting
                day. Log it now.
              </Alert>
            ))}
          </div>
        )}

        {myProjects.length > 0 && (
          <div className="flex flex-wrap gap-x-10 gap-y-4">
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
              href="/portal/attendance"
            />
            <StatTile
              label="Tasks this quarter"
              value={`${doneTaskCount}/${myAllTasks.length}`}
              detail={myAllTasks.length === 0 ? "Nothing assigned yet" : "Done"}
              href="/portal/tasks"
            />
          </div>
        )}
      </div>

      {myProjects.length > 0 && (
        <Section title="My teams">
          <div className="divide-y">
            {myProjects.map((project) => (
              <Link
                key={project.id}
                href={`/portal/projects/${project.id}`}
                className="-mx-2 flex flex-wrap items-center gap-3 rounded-md px-2 py-3 transition-colors first:pt-0 hover:bg-muted/50"
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
        </Section>
      )}

      <Section title="My tasks" description="Open tasks assigned to you this quarter.">
        <div className="space-y-4">
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
                    "text-xs font-medium",
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
                        href={`/portal/projects/${task.project_id}`}
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
            <Link href="/portal/tasks" className="text-sm text-primary hover:underline">
              View all tasks
            </Link>
          </div>
        </div>
      </Section>

      {summary && (
        <>
          <Section title="Exec to-dos" description="Shared admin checklist -- not tied to a project.">
            <ExecTodoList todos={execTodos} execMembers={execMembers} today={today} />
          </Section>

          <Section title="Needs attention" description="Org-wide items worth a look right now.">
            {summary.atRiskProjects.length === 0 &&
            summary.belowThresholdMembers.length === 0 &&
            summary.missingAttendanceTeams.length === 0 ? (
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
                    href: `/portal/projects/${p.id}`,
                  }))}
                />
                <AttentionRow
                  icon={AlertTriangle}
                  label={`${summary.belowThresholdMembers.length} below attendance target`}
                  items={summary.belowThresholdMembers.map((m) => ({
                    key: m.userId,
                    label: `${m.name} (${Math.round(m.rate * 100)}%)`,
                    href: "/portal/directory",
                  }))}
                />
                <AttentionRow
                  icon={AlertTriangle}
                  label={`${summary.missingAttendanceTeams.length} haven't logged today's attendance`}
                  items={summary.missingAttendanceTeams.map((t) => ({
                    key: t.projectId,
                    label: t.clientName,
                    href: `/portal/attendance?team=${t.projectId}`,
                  }))}
                />
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10 border-t pt-8">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
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

function StatTile({
  label,
  value,
  detail,
  tone,
  href,
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: "warning";
  href: string;
}) {
  const warn = tone === "warning";

  return (
    <Link href={href} className="group min-w-32">
      <p className={cn("text-2xl font-semibold tabular-nums", warn && "text-warning")}>{value}</p>
      <p className="text-sm font-medium group-hover:underline">{label}</p>
      {detail && (
        <p className={cn("text-xs", warn ? "text-warning" : "text-muted-foreground")}>{detail}</p>
      )}
    </Link>
  );
}
