import { getCurrentProfile } from "@/lib/data/profile";
import { getActiveQuarter } from "@/lib/data/quarters";
import { getProjects, getProjectMembers } from "@/lib/data/projects";
import { getAttendanceHistory, getSessionForDate } from "@/lib/data/attendance";
import { isExec } from "@/lib/auth/roles";
import { getOrgTodayDateString } from "@/lib/date";
import { AttendanceView } from "./attendance-view";

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

  // RLS already scopes this to "my team(s)" for non-exec users, all teams for exec.
  const projects = await getProjects(activeQuarter.id);
  const selectedProjectId = team && projects.some((p) => p.id === team) ? team : projects[0]?.id;
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  const canSubmit =
    !!selectedProject &&
    (isExec(profile.role) ||
      selectedProject.project_manager_id === profile.id ||
      selectedProject.senior_consultant_id === profile.id);

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
