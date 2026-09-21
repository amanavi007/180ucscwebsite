import type { Metadata } from "next";
import { getQuarters, getActiveQuarter } from "@/lib/data/quarters";
import { getConsultantStatsRollup } from "@/lib/data/consultant-stats";
import { getAttendanceAlertThreshold } from "@/lib/data/org-settings";
import { QuarterSelect } from "@/components/quarter-select";
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

  const selectedQuarterId = quarter || activeQuarter?.id;

  const [rows, attendanceThreshold] = await Promise.all([
    selectedQuarterId ? getConsultantStatsRollup(selectedQuarterId) : Promise.resolve([]),
    getAttendanceAlertThreshold(true),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Consultant Stats</h1>
          <p className="text-sm text-muted-foreground">
            Attendance and task completion, rolled up per consultant.
          </p>
        </div>
        {quarters.length > 0 && (
          <QuarterSelect
            quarters={quarters}
            selectedId={selectedQuarterId ?? ""}
            basePath="/portal/admin/stats"
          />
        )}
      </div>

      <ConsultantStatsView rows={rows} attendanceThreshold={attendanceThreshold} />
    </div>
  );
}
