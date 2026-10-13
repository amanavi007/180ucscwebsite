import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { MyAttendanceSummary } from "@/lib/data/attendance";

/** Your own attendance for the quarter at a glance; the full breakdown is on the Attendance page. */
export function HomeAttendanceCard({ summary, threshold }: { summary: MyAttendanceSummary; threshold: number }) {
  const { rate, presentCount, tardyCount, excusedCount, unexcusedCount } = summary;

  return (
    <section className="rounded-[22px] border bg-card p-5" aria-labelledby="home-attendance">
      <div className="flex items-center justify-between">
        <h2 id="home-attendance" className="text-lg">
          Your attendance
        </h2>
        <Link href="/portal/attendance" className="text-sm font-semibold text-link underline-offset-4 hover:underline">
          Details
        </Link>
      </div>
      {!summary.projectName ? (
        <p className="mt-2 text-sm text-muted-foreground">You aren&apos;t on a team this quarter yet.</p>
      ) : rate === null ? (
        <p className="mt-2 text-sm text-muted-foreground">No sessions logged yet.</p>
      ) : (
        <>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-3xl font-semibold">{Math.round(rate * 100)}%</span>
            <Badge variant={rate < threshold ? "bad" : "ok"}>{rate < threshold ? "Below target" : "On track"}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {presentCount} present · {tardyCount} tardy · {excusedCount} excused · {unexcusedCount} unexcused
          </p>
        </>
      )}
    </section>
  );
}
