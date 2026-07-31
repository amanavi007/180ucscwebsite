import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { parseLocalDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { MyAttendanceSummary } from "@/lib/data/attendance";

const MARK_LABELS = { excused: "Excused", unexcused: "Unexcused", tardy: "Tardy" } as const;

const MARK_BADGE_CLASS = {
  excused: "bg-muted text-muted-foreground border-transparent",
  unexcused: "bg-destructive/10 text-destructive border-transparent",
  tardy: "bg-warning/10 text-warning border-transparent",
} as const;

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function MyAttendanceStats({
  summary,
  quarterName,
  threshold,
}: {
  summary: MyAttendanceSummary;
  quarterName: string;
  threshold: number;
}) {
  const { rate, totalSessions, presentCount, excusedCount, unexcusedCount, tardyCount, marks } =
    summary;

  const sortedMarks = [...marks].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your attendance -- {quarterName}</CardTitle>
        </CardHeader>
        <CardContent>
          {!summary.projectName ? (
            <p className="text-sm text-muted-foreground">
              You&apos;re not on a team this quarter yet -- nothing to track.
            </p>
          ) : rate === null ? (
            <p className="text-sm text-muted-foreground">
              No sessions have been logged for {quarterName} yet.
            </p>
          ) : (
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
              <div className="flex shrink-0 items-center gap-4 lg:flex-col lg:items-start lg:gap-2">
                <div
                  className={cn(
                    "flex size-24 shrink-0 flex-col items-center justify-center rounded-full border-4",
                    rate < threshold
                      ? "border-destructive/30 text-destructive"
                      : "border-primary/30 text-primary",
                  )}
                >
                  <span className="text-2xl font-semibold">{Math.round(rate * 100)}%</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>{totalSessions} session(s) logged org-wide this quarter</p>
                  {rate < threshold && (
                    <p className="font-medium text-destructive">
                      Below the org&apos;s {Math.round(threshold * 100)}% target.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
                <StatBlock label="Present" value={presentCount} />
                <StatBlock label="Tardy" value={tardyCount} />
                <StatBlock label="Excused" value={excusedCount} />
                <StatBlock label="Unexcused" value={unexcusedCount} />
              </div>
            </div>
          )}

          {summary.missingSessionDates.length > 0 && (
            <p className="mt-4 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              Your team hasn&apos;t logged {summary.missingSessionDates.length} session(s) that
              other teams recorded this quarter -- check with your PM/SC if this looks wrong.
            </p>
          )}
        </CardContent>
      </Card>

      {sortedMarks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Marked sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Mark</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedMarks.map((m, i) => (
                  <TableRow key={i}>
                    <TableCell>{format(parseLocalDate(m.date), "MMM d, yyyy")}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={MARK_BADGE_CLASS[m.mark]}>
                        {MARK_LABELS[m.mark]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
