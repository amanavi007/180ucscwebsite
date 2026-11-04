"use client";

import { useMemo, useTransition } from "react";
import { toast } from "sonner";
import { removeOnboardingJc, restoreOnboardingJc } from "@/actions/jc-onboarding";
import type { OnboardingData } from "@/lib/data/onboarding";
import {
  computeOnboardingStats,
  onboardingFlagReasons,
  type OnboardingThresholds,
} from "@/lib/onboarding-attendance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PersonAvatar } from "@/components/person-avatar";
import { useConfirm } from "@/components/confirm-dialog";

export function RosterTab({ data, thresholds }: { data: OnboardingData; thresholds: OnboardingThresholds }) {
  const [pending, startTransition] = useTransition();
  const [confirm, dialog] = useConfirm();

  const rows = useMemo(() => {
    const takenIds = new Set(data.meetings.filter((m) => m.taken).map((m) => m.id));
    return data.jcs
      .filter((j) => !j.removedAt)
      .map((j) => {
        const marks = data.marks.filter((m) => m.jcId === j.id && takenIds.has(m.meetingId)).map((m) => m.mark);
        const stats = computeOnboardingStats(marks);
        return { jc: j, stats, reasons: onboardingFlagReasons(stats, thresholds) };
      });
  }, [data, thresholds]);
  const removed = data.jcs.filter((j) => j.removedAt);

  async function remove(id: string, name: string) {
    const ok = await confirm({
      title: `Remove ${name}?`,
      description: "They leave the roster and future meetings. Their past attendance is kept, and you can restore them.",
      confirmLabel: "Remove",
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await removeOnboardingJc(id);
      if (result.error) toast.error(result.error);
      else toast.success(`${name} removed.`);
    });
  }

  function restore(id: string, name: string) {
    startTransition(async () => {
      const result = await restoreOnboardingJc(id);
      if (result.error) toast.error(result.error);
      else toast.success(`${name} is back on the roster.`);
    });
  }

  if (rows.length === 0 && removed.length === 0) {
    return <p className="text-sm text-muted-foreground">No JCs yet. Use Add JCs to paste your list.</p>;
  }

  return (
    <div className="space-y-6">
      {dialog}
      <div className="overflow-x-auto rounded-[22px] border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>JC</TableHead>
              <TableHead className="text-right">Present</TableHead>
              <TableHead className="text-right">Late</TableHead>
              <TableHead className="text-right">Excused</TableHead>
              <TableHead className="text-right">Unexcused</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ jc, stats, reasons }) => (
              <TableRow key={jc.id}>
                <TableCell>
                  <div className="flex min-w-0 items-center gap-3">
                    <PersonAvatar name={jc.name} />
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{jc.name}</div>
                      <div className="truncate text-[13px] text-muted-foreground">{jc.email ?? "No email"}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{stats.present}</TableCell>
                <TableCell className="text-right tabular-nums">{stats.tardy}</TableCell>
                <TableCell className="text-right tabular-nums">{stats.excused}</TableCell>
                <TableCell className="text-right tabular-nums">{stats.unexcused}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {stats.rate === null ? "–" : `${Math.round(stats.rate * 100)}%`}
                </TableCell>
                <TableCell>
                  {stats.meetings === 0 ? (
                    <Badge variant="muted">No meetings yet</Badge>
                  ) : reasons.length > 0 ? (
                    <div className="flex flex-col items-start gap-0.5">
                      <Badge variant="bad">Flagged</Badge>
                      <span className="text-[13px] text-muted-foreground">{reasons.join(" · ")}</span>
                    </div>
                  ) : (
                    <Badge variant="ok">Good standing</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => remove(jc.id, jc.name)}>
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {removed.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg">Removed</h2>
          <ul className="max-h-64 divide-y overflow-auto rounded-[18px] border bg-card">
            {removed.map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0 truncate">{j.name}</span>
                <Button variant="outline" size="sm" disabled={pending} onClick={() => restore(j.id, j.name)}>
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
