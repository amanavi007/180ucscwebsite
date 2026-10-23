import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { Alert } from "@/components/ui/alert";
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
  const [{ team }, profile, activeQuarter] = await Promise.all([
    searchParams,
    getCurrentProfile(),
    getActiveQuarter(),
  ]);

  if (!activeQuarter) {
    return (
      <div className="space-y-2">
        <h1 className="text-4xl leading-tight">Attendance</h1>
        <p className="text-sm text-muted-foreground">
          No active quarter yet. An exec needs to set one up first.
        </p>
      </div>
    );
  }

  // Base-tier consultants get a personal stats view instead of the team quick-entry/history tool.
  if (!isElevatedOrAbove(profile.role)) {
    const [summary, threshold] = await Promise.all([
      getMyAttendanceSummary(profile.id, activeQuarter.id),
      getAttendanceAlertThreshold(isExec(profile.role)),
    ]);

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl leading-tight">Attendance</h1>
          <p className="text-sm text-muted-foreground">{activeQuarter.name}</p>
        </div>
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

  const [roster, history, todaySession, meetingDates] = await Promise.all([
    selectedProject ? getProjectMembers(selectedProject.id) : Promise.resolve([]),
    selectedProject ? getAttendanceHistory(selectedProject.id) : Promise.resolve([]),
    selectedProject ? getSessionForDate(selectedProject.id, today) : Promise.resolve(null),
    getMeetingDatesForQuarter(activeQuarter.id),
  ]);
  const todayIsMeetingDay = meetingDates.includes(today);

  const teamStatus = exec ? await getTeamAttendanceStatus(activeQuarter.id, today) : null;

  const needsTodayNudge = canSubmit && todayIsMeetingDay && !todaySession;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl leading-tight">Attendance</h1>
        <p className="text-sm text-muted-foreground">{activeQuarter.name}</p>
      </div>

      {needsTodayNudge && selectedProject && (
        <Alert>
          <AlertTriangle />
          <span>
            {selectedProject.client_name}{" "}hasn&apos;t logged today&apos;s attendance yet. It&apos;s
            a meeting day.
          </span>
        </Alert>
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
          meetingDates={meetingDates}
          today={today}
          initialSession={todaySession}
        />
      )}
    </div>
  );
}
