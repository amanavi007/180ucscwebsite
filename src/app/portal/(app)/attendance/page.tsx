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
import { getOnboardingData } from "@/lib/data/onboarding";
import { AttendanceView, JC_GROUP_ID, type JcGroup } from "./attendance-view";
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
  const execUser = isExec(profile.role);
  const jcSelected = execUser && (team === JC_GROUP_ID || projects.length === 0);
  const selectedProjectId = jcSelected
    ? JC_GROUP_ID
    : team && projects.some((p) => p.id === team)
      ? team
      : projects[0]?.id;
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;
  const onboarding = execUser ? await getOnboardingData(activeQuarter.id) : null;

  const canSubmit =
    jcSelected ||
    (!!selectedProject && (await isProjectLead(selectedProject.id, profile.id, isExec(profile.role))));

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

  let jc: JcGroup | null = null;
  let jcNudge = false;
  if (onboarding) {
    const active = onboarding.jcs.filter((j) => !j.removedAt);
    const activeIds = new Set(active.map((j) => j.id));
    const taken = onboarding.meetings.filter((m) => m.taken);
    const todayMeeting = onboarding.meetings.find((m) => m.date === today);
    jcNudge = !!todayMeeting && !todayMeeting.taken;
    jc = {
      roster: active.map((j) => ({ id: j.id, name: j.name })),
      meetingDates: onboarding.meetings.map((m) => m.date),
      history: [...taken]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((m) => {
          const marks = onboarding.marks.filter((x) => x.meetingId === m.id);
          const count = (k: string) => marks.filter((x) => x.mark === k).length;
          return {
            id: m.id,
            date: m.date,
            taken_by_name: m.takenByName ?? "Unknown",
            excused: count("excused"),
            unexcused: count("unexcused"),
            tardy: count("tardy"),
          };
        }),
      initialSession:
        todayMeeting?.taken
          ? {
              marks: onboarding.marks
                .filter((x) => x.meetingId === todayMeeting.id && x.mark !== "present" && activeIds.has(x.jcId))
                .map((x) => ({ id: x.jcId, mark: x.mark as "excused" | "unexcused" | "tardy" })),
            }
          : null,
    };
  }

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

      {jcNudge && execUser && (
        <Alert>
          <AlertTriangle />
          <span>JC onboarding hasn&apos;t logged today&apos;s attendance yet. Pick JC Onboarding in the list below.</span>
        </Alert>
      )}

      {projects.length === 0 && !jc ? (
        <p className="text-sm text-muted-foreground">
          You&apos;re not on a team this quarter yet.
        </p>
      ) : (
        <AttendanceView
          projects={projects}
          selectedProjectId={selectedProjectId ?? null}
          canSubmit={canSubmit}
          roster={roster}
          history={history}
          meetingDates={meetingDates}
          today={today}
          initialSession={todaySession}
          jc={jc}
        />
      )}
    </div>
  );
}
