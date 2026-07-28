import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { parseLocalDate } from "@/lib/date";
import type { AttendanceHistoryRow } from "@/lib/data/attendance";

export function HistoryList({ history }: { history: AttendanceHistoryRow[] }) {
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
        {history.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">
              No sessions logged yet.
            </TableCell>
          </TableRow>
        )}
        {history.map((s) => (
          <TableRow key={s.id}>
            <TableCell className="font-medium">
              {format(parseLocalDate(s.date), "EEE, MMM d, yyyy")}
            </TableCell>
            <TableCell className="text-muted-foreground">{s.taken_by_name}</TableCell>
            <TableCell className="text-muted-foreground">{s.excused}</TableCell>
            <TableCell className="text-muted-foreground">{s.unexcused}</TableCell>
            <TableCell className="text-muted-foreground">{s.tardy}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
