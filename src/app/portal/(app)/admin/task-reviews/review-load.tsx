import Link from "next/link";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { PersonAvatar } from "@/components/person-avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { roleLabel } from "@/lib/auth/roles";
import type { ExecReviewLoad } from "@/lib/data/task-reviews";

/** Waiting reviews more than one above or below the exec average count as uneven. */
function balance(waiting: number, average: number): { label: string; variant: "ok" | "warn" | "info" } {
  if (waiting > average + 1) return { label: "Heavy", variant: "warn" };
  if (waiting < average - 1) return { label: "Light", variant: "info" };
  return { label: "Even", variant: "ok" };
}

/** Director of Projects only: how pending exec reviews are spread across the exec team. */
export function ReviewLoad({ rows, photos }: { rows: ExecReviewLoad[]; photos: Record<string, string> }) {
  const counts = rows.map((r) => r.waiting.length);
  const total = counts.reduce((a, b) => a + b, 0);
  const average = rows.length ? total / rows.length : 0;
  const spread = rows.length ? Math.max(...counts) - Math.min(...counts) : 0;

  return (
    <section aria-labelledby="load-heading" className="rounded-[22px] border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
        <h2 id="load-heading" className="text-lg">
          Review load by exec
        </h2>
        <Badge variant={spread <= 1 ? "ok" : "warn"}>{spread <= 1 ? "Split evenly" : `Uneven · gap of ${spread}`}</Badge>
      </div>
      <p className="px-5 pb-3 text-sm text-muted-foreground">
        {total} {total === 1 ? "review is" : "reviews are"} waiting across {rows.length} execs, about {average.toFixed(1)} each.
        New reviews go to the two execs with the fewest waiting.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Exec</TableHead>
            <TableHead className="text-right">Waiting</TableHead>
            <TableHead className="text-right">Reviewed</TableHead>
            <TableHead>Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const b = balance(r.waiting.length, average);
            return (
              <TableRow key={r.execId} className="align-top">
                <TableCell>
                  <span className="flex items-start gap-3">
                    <PersonAvatar name={r.name} src={photos[r.execId]} />
                    <span className="min-w-0">
                      <span className="block font-semibold">{r.name}</span>
                      <span className="block text-sm text-muted-foreground">{roleLabel(r.role)}</span>
                      {r.waiting.length > 0 && (
                        <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-sm">
                          {r.waiting.map((w) => (
                            <li key={w.taskId} className="min-w-0 break-words">
                              <Link href={`/portal/projects/${w.projectId}`} className="text-link hover:underline">
                                {w.consultantName} · {w.taskName}
                              </Link>
                              <span className="text-muted-foreground">
                                {" "}
                                · {w.clientName} · since {format(new Date(w.assignedAt), "MMM d")}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </span>
                  </span>
                </TableCell>
                <TableCell className="text-right text-lg font-bold tabular-nums">{r.waiting.length}</TableCell>
                <TableCell className="text-right tabular-nums">{r.reviewedCount}</TableCell>
                <TableCell>
                  <Badge variant={b.variant}>{b.label}</Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}
