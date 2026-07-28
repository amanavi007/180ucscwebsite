import type { Metadata } from "next";
import { getDirectory } from "@/lib/data/directory";
import { getActiveQuarter } from "@/lib/data/quarters";
import { getCurrentProfile } from "@/lib/data/profile";
import { getQuarterAttendanceRates } from "@/lib/data/attendance";
import { getAttendanceAlertThreshold } from "@/lib/data/org-settings";
import type { AttendanceRateResult } from "@/lib/attendance";
import { isExec } from "@/lib/auth/roles";
import { DirectoryView } from "./directory-view";

export const metadata: Metadata = { title: "Directory" };

export default async function DirectoryPage() {
  const profile = await getCurrentProfile();
  const activeQuarter = await getActiveQuarter();
  const rows = await getDirectory(activeQuarter?.id ?? null);
  const exec = isExec(profile.role);

  // Attendance rate is Exec-only, per the org's permission model.
  const [rates, attendanceThreshold]: [Record<string, AttendanceRateResult> | undefined, number] =
    exec && activeQuarter
      ? await Promise.all([
          getQuarterAttendanceRates(activeQuarter.id, rows),
          getAttendanceAlertThreshold(),
        ])
      : [undefined, 0.8];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Directory</h1>
        <p className="text-sm text-muted-foreground">
          Every member and their current team{activeQuarter ? ` · ${activeQuarter.name}` : ""}.
        </p>
      </div>

      <DirectoryView rows={rows} rates={rates} attendanceThreshold={attendanceThreshold} />
    </div>
  );
}
