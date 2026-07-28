import { getDirectory } from "@/lib/data/directory";
import { getActiveQuarter } from "@/lib/data/quarters";
import { getCurrentProfile } from "@/lib/data/profile";
import { getQuarterAttendanceRates } from "@/lib/data/attendance";
import type { AttendanceRateResult } from "@/lib/attendance";
import { isExec } from "@/lib/auth/roles";
import { DirectoryView } from "./directory-view";

export default async function DirectoryPage() {
  const profile = await getCurrentProfile();
  const activeQuarter = await getActiveQuarter();
  const rows = await getDirectory(activeQuarter?.id ?? null);

  // Attendance rate is Exec-only, per the org's permission model.
  const rates: Record<string, AttendanceRateResult> | undefined =
    isExec(profile.role) && activeQuarter
      ? await getQuarterAttendanceRates(activeQuarter.id, rows)
      : undefined;

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
