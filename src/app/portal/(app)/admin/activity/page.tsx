import type { Metadata } from "next";
import Link from "next/link";
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
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Admin · Activity" };

const PAGE_SIZE = 200;

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ offset?: string }>;
}) {
  const { offset: offsetParam } = await searchParams;
  const offset = Math.max(0, Number(offsetParam) || 0);
  const entries = await getAuditLog(PAGE_SIZE, offset);
  const hasPrev = offset > 0;
  const hasNext = entries.length === PAGE_SIZE;
  const prevOffset = Math.max(0, offset - PAGE_SIZE);
  const nextOffset = offset + PAGE_SIZE;

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
                  {offset > 0 ? "Nothing further back." : "Nothing logged yet."}
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

        <div className="mt-4 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={!hasPrev}
            nativeButton={false}
            render={<Link href={`/portal/admin/activity?offset=${prevOffset}`}>Newer</Link>}
          />
          <p className="text-xs text-muted-foreground">
            Showing {entries.length === 0 ? 0 : offset + 1}–{offset + entries.length}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasNext}
            nativeButton={false}
            render={<Link href={`/portal/admin/activity?offset=${nextOffset}`}>Older / Load more</Link>}
          />
        </div>
      </CardContent>
    </Card>
  );
}
