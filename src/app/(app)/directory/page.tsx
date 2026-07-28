import { getDirectory } from "@/lib/data/directory";
import { getActiveQuarter } from "@/lib/data/quarters";
import { getCurrentProfile } from "@/lib/data/profile";
import {
  getQuarterSessionDates,
  getProjectSessionDates,
  getUserMarksInQuarter,
} from "@/lib/data/attendance";
import { computeAttendanceRate, type AttendanceRateResult } from "@/lib/attendance";
import { isExec } from "@/lib/auth/roles";
import { DirectoryView } from "./directory-view";

export default async function DirectoryPage() {
  const profile = await getCurrentProfile();
  const activeQuarter = await getActiveQuarter();
  const rows = await getDirectory(activeQuarter?.id ?? null);

  // Attendance rate is Exec-only, per the org's permission model.
  let rates: Record<string, AttendanceRateResult> | undefined;
  if (isExec(profile.role) && activeQuarter) {
    const totalSessionDates = await getQuarterSessionDates(activeQuarter.id);
    const teamDatesCache = new Map<string, string[]>();
    rates = {};
    for (const row of rows) {
      let teamSessionDates: string[] = [];
      if (row.project_id) {
        if (!teamDatesCache.has(row.project_id)) {
          teamDatesCache.set(row.project_id, await getProjectSessionDates(row.project_id));
        }
        teamSessionDates = teamDatesCache.get(row.project_id)!;
      }
      const marks = await getUserMarksInQuarter(row.user_id, activeQuarter.id);
      rates[row.user_id] = computeAttendanceRate({ totalSessionDates, teamSessionDates, marks });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Directory</h1>
        <p className="text-sm text-muted-foreground">
          Every member and their current team{activeQuarter ? ` · ${activeQuarter.name}` : ""}.
        </p>
      </div>

      <DirectoryView rows={rows} rates={rates} />
    </div>
  );
}
