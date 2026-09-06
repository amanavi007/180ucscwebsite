import { format } from "date-fns";
import { CheckCircle2, AlertTriangle } from "lucide-react";
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
      <CardContent className="flex flex-wrap gap-2">
        {teams.map((t) => (
          <div
            key={t.projectId}
            className="flex items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-3 text-xs"
          >
            <span className="font-medium">{t.clientName}</span>
            {todayIsMeetingDay &&
              (t.loggedToday ? (
                <CheckCircle2 className="size-3.5 text-primary" />
              ) : (
                <AlertTriangle className="size-3.5 text-destructive" />
              ))}
            {t.missingDates.length > 0 && (
              <span
                className="text-warning"
                title={t.missingDates.map((d) => format(parseLocalDate(d), "MMM d")).join(", ")}
              >
                {t.missingDates.length} gap{t.missingDates.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
