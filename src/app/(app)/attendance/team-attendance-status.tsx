import { format } from "date-fns";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parseLocalDate } from "@/lib/date";
import type { TeamAttendanceStatus } from "@/lib/data/attendance";

export function TeamAttendanceStatusCard({
  teams,
  todayIsMeetingDay,
}: {
  teams: TeamAttendanceStatus[];
  todayIsMeetingDay: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Team check-in status</CardTitle>
        <CardDescription>
          {todayIsMeetingDay
            ? "Today's a meeting day -- who's logged attendance so far."
            : "Not a meeting day today. Showing any gaps from this quarter's meeting days so far."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {teams.map((t) => (
          <div key={t.projectId} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-b-0">
            <span className="text-sm font-medium">{t.clientName}</span>
            <div className="flex items-center gap-2">
              {todayIsMeetingDay && (
                <Badge
                  variant="outline"
                  className={
                    t.loggedToday
                      ? "gap-1 border-transparent bg-primary/10 text-primary"
                      : "gap-1 border-transparent bg-destructive/10 text-destructive"
                  }
                >
                  {t.loggedToday ? (
                    <CheckCircle2 className="size-3" />
                  ) : (
                    <AlertTriangle className="size-3" />
                  )}
                  {t.loggedToday ? "Logged today" : "Missing today"}
                </Badge>
              )}
              {t.missingDates.length > 0 && (
                <span
                  className="text-xs text-warning"
                  title={t.missingDates
                    .map((d) => format(parseLocalDate(d), "MMM d"))
                    .join(", ")}
                >
                  {t.missingDates.length} gap{t.missingDates.length === 1 ? "" : "s"} this quarter
                </span>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
