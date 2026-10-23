import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { parseLocalDate } from "@/lib/date";
import type { AttendanceHistoryRow } from "@/lib/data/attendance";

export function HistoryList({
  history,
  meetingDates,
  today,
}: {
  history: AttendanceHistoryRow[];
  meetingDates: string[];
  today: string;
}) {
  // Meeting days that have already happened but have no logged session.
  const logged = new Set(history.map((s) => s.date));
  const missing = meetingDates.filter((d) => d <= today && !logged.has(d));
  const rows = [
    ...history.map((s) => ({ date: s.date, session: s })),
    ...missing.map((date) => ({ date, session: null })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Taken by</TableHead>
          <TableHead>Excused</TableHead>
          <TableHead>Unexcused</TableHead>
          <TableHead>Tardy</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">
              No sessions logged yet.
            </TableCell>
          </TableRow>
        )}
        {rows.map(({ date, session: s }) => (
          <TableRow key={date}>
            <TableCell className="font-medium">
              {format(parseLocalDate(date), "EEE, MMM d, yyyy")}
            </TableCell>
            {s ? (
              <>
                <TableCell className="text-muted-foreground">{s.taken_by_name}</TableCell>
                <TableCell className="text-muted-foreground">{s.excused}</TableCell>
                <TableCell className="text-muted-foreground">{s.unexcused}</TableCell>
                <TableCell className="text-muted-foreground">{s.tardy}</TableCell>
              </>
            ) : (
              <TableCell colSpan={4}>
                <Badge variant="bad">Not logged</Badge>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
