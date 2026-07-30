import type { Metadata } from "next";
import { format } from "date-fns";
import { getAuditLog } from "@/lib/data/audit";
import { auditActionLabel } from "@/lib/audit-labels";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Admin · Activity" };

export default async function AdminActivityPage() {
  const entries = await getAuditLog();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>
          Consequential admin actions -- account/role changes, quarter lifecycle, org settings,
          and team-draft finalize/apply. Routine day-to-day usage (task edits, attendance,
          wiki content) isn&apos;t logged here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nothing logged yet.
                </TableCell>
              </TableRow>
            )}
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {format(new Date(e.createdAt), "MMM d, yyyy 'at' h:mm a")}
                </TableCell>
                <TableCell className="font-medium">{e.actorName}</TableCell>
                <TableCell>{auditActionLabel(e.action)}</TableCell>
                <TableCell className="text-muted-foreground">{e.targetLabel ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{e.detail ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
