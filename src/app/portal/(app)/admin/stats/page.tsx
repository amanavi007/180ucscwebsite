import type { Metadata } from "next";
import { getQuarters, getActiveQuarter } from "@/lib/data/quarters";
import { getConsultantStatsRollup } from "@/lib/data/consultant-stats";
import { getAttendanceAlertThreshold } from "@/lib/data/org-settings";
import { resolveQuarterId } from "@/lib/admin-nav";
import { ConsultantStatsView } from "./consultant-stats-view";

export const metadata: Metadata = { title: "Consultant Stats" };

export default async function ConsultantStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ quarter?: string }>;
}) {
  const [{ quarter }, quarters, activeQuarter] = await Promise.all([
    searchParams,
    getQuarters(),
    getActiveQuarter(),
  ]);

  // Same fallback the breadcrumb picker uses, so a stale or garbage ?quarter= shows the active quarter.
  const selectedQuarterId = resolveQuarterId(quarter, quarters, activeQuarter?.id ?? null);

  const [rows, attendanceThreshold] = await Promise.all([
    selectedQuarterId ? getConsultantStatsRollup(selectedQuarterId) : Promise.resolve([]),
    getAttendanceAlertThreshold(true),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Consultant Stats</h1>
        <p className="text-sm text-muted-foreground">
          Attendance and task completion, rolled up per consultant.
        </p>
      </div>

      <ConsultantStatsView rows={rows} attendanceThreshold={attendanceThreshold} />
    </div>
  );
}
