import type { Metadata } from "next";
import { getCurrentProfile } from "@/lib/data/profile";
import { getActiveQuarter } from "@/lib/data/quarters";
import { getProjects, getProjectMembers } from "@/lib/data/projects";
import {
  getAttendanceHistory,
  getMyAttendanceSummary,
  getSessionForDate,
} from "@/lib/data/attendance";
import { getAttendanceAlertThreshold } from "@/lib/data/org-settings";
import { isExec, isElevatedOrAbove } from "@/lib/auth/roles";
import { isProjectLead } from "@/lib/auth/project-access";
import { getOrgTodayDateString } from "@/lib/date";
import { AttendanceView } from "./attendance-view";
import { MyAttendanceStats } from "./my-attendance-stats";

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

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
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

  const [roster, history, todaySession] = selectedProject
    ? await Promise.all([
        getProjectMembers(selectedProject.id),
        getAttendanceHistory(selectedProject.id),
        getSessionForDate(selectedProject.id, today),
      ])
    : [[], [], null];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
        <p className="text-sm text-muted-foreground">{activeQuarter.name}</p>
      </div>

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
