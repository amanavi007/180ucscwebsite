import type { Metadata } from "next";
import { AlertTriangle, MapPin } from "lucide-react";
import { getCurrentProfile } from "@/lib/data/profile";
import { getActiveQuarter } from "@/lib/data/quarters";
import { getProjects, getProjectMembers } from "@/lib/data/projects";
import {
  getAttendanceHistory,
  getMyAttendanceSummary,
  getSessionForDate,
  getTeamAttendanceStatus,
} from "@/lib/data/attendance";
import { getAttendanceAlertThreshold } from "@/lib/data/org-settings";
import { getMeetingDatesForQuarter } from "@/lib/data/meeting-dates";
import { getRoomBookingForProject } from "@/lib/data/room-bookings";
import { isExec, isElevatedOrAbove } from "@/lib/auth/roles";
import { isProjectLead } from "@/lib/auth/project-access";
import { getOrgTodayDateString } from "@/lib/date";
import { AttendanceView } from "./attendance-view";
import { MyAttendanceStats } from "./my-attendance-stats";
import { TeamAttendanceStatusCard } from "./team-attendance-status";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const { team } = await searchParams;
  const profile = await getCurrentProfile();
  const activeQuarter = await getActiveQuarter();

  if (!activeQuarter) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
        <p className="text-sm text-muted-foreground">
          No active quarter yet -- an exec needs to set one up first.
        </p>
      </div>
    );
  }

  // Base-tier consultants get a personal stats view instead of the team quick-entry/history tool.
  if (!isElevatedOrAbove(profile.role)) {
    const [summary, threshold] = await Promise.all([
      getMyAttendanceSummary(profile.id, activeQuarter.id),
      getAttendanceAlertThreshold(),
    ]);
    const todayForRoom = getOrgTodayDateString();
    const todayRoom = summary.projectId
      ? await getRoomBookingForProject(summary.projectId, todayForRoom)
      : null;

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
          <p className="text-sm text-muted-foreground">{activeQuarter.name}</p>
        </div>
        {todayRoom && (
          <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
            <MapPin className="size-4 shrink-0" />
            {summary.projectName} meets in <span className="font-medium">{todayRoom}</span> today.
          </div>
        )}
        <MyAttendanceStats summary={summary} quarterName={activeQuarter.name} threshold={threshold} />
      </div>
    );
  }

  // RLS already scopes this to "my team(s)" for non-exec users, all teams for exec.
  const projects = await getProjects(activeQuarter.id);
  const selectedProjectId = team && projects.some((p) => p.id === team) ? team : projects[0]?.id;
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  const canSubmit =
    !!selectedProject &&
    (await isProjectLead(selectedProject.id, profile.id, isExec(profile.role)));

  const today = getOrgTodayDateString();
  const exec = isExec(profile.role);

  const [roster, history, todaySession, meetingDates, todayRoom] = await Promise.all([
    selectedProject ? getProjectMembers(selectedProject.id) : Promise.resolve([]),
    selectedProject ? getAttendanceHistory(selectedProject.id) : Promise.resolve([]),
    selectedProject ? getSessionForDate(selectedProject.id, today) : Promise.resolve(null),
    getMeetingDatesForQuarter(activeQuarter.id),
    selectedProject ? getRoomBookingForProject(selectedProject.id, today) : Promise.resolve(null),
  ]);
  const todayIsMeetingDay = meetingDates.includes(today);

  const teamStatus = exec ? await getTeamAttendanceStatus(activeQuarter.id, today) : null;

  const needsTodayNudge = canSubmit && todayIsMeetingDay && !todaySession;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
        <p className="text-sm text-muted-foreground">{activeQuarter.name}</p>
      </div>

      {todayRoom && selectedProject && (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
          <MapPin className="size-4 shrink-0" />
          {selectedProject.client_name} meets in <span className="font-medium">{todayRoom}</span>{" "}
          today.
        </div>
      )}

      {needsTodayNudge && selectedProject && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-4 shrink-0" />
          {selectedProject.client_name} hasn&apos;t logged today&apos;s attendance yet -- it&apos;s a
          meeting day.
        </div>
      )}

      {teamStatus && teamStatus.length > 0 && (
        <TeamAttendanceStatusCard teams={teamStatus} todayIsMeetingDay={todayIsMeetingDay} />
      )}

      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You&apos;re not on a team this quarter yet.
        </p>
      ) : (
        <AttendanceView
          projects={projects}
          selectedProjectId={selectedProject?.id ?? null}
          canSubmit={canSubmit}
          roster={roster}
          history={history}
          today={today}
          initialSession={todaySession}
        />
      )}
    </div>
  );
}
