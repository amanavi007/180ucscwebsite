"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  previewInterviewRebalanceAction,
  rebalanceInterviewExecsAction,
  type RebalancePreview,
} from "@/actions/interview";
import { formatDateLong } from "@/lib/date";
import { formatTimeRange } from "@/lib/coffee-chat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Shows which interview execs would be swapped to even out the load, then applies it. */
export function RebalanceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [preview, setPreview] = useState<RebalancePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    previewInterviewRebalanceAction().then((result) => {
      if (cancelled) return;
      if (result.error || !result.preview) setError(result.error ?? "Couldn't work out a plan. Try again.");
      else setPreview(result.preview);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function close() {
    setPreview(null);
    setError(null);
    onOpenChange(false);
  }

  function apply() {
    startTransition(async () => {
      const result = await rebalanceInterviewExecsAction();
      if (result.error) toast.error(result.error);
      else toast.success(`Swapped execs on ${result.swappedCount ?? 0} interview(s).`);
      close();
      router.refresh();
    });
  }

  const bookedCount = preview?.rows.filter((r) => r.applicantName).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Rebalance interview execs</DialogTitle>
          <DialogDescription>
            Moves interviews from the busiest execs to execs who are free at that time and have fewer. Nothing changes until you apply.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {!error && !preview && <p className="text-sm text-muted-foreground">Working out a plan…</p>}
        {preview && preview.rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Already even. No exec who is free has two or more fewer interviews than someone on a slot they could take.</p>
        )}
        {preview && preview.rows.length > 0 && (
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Interviews per exec</p>
              <ul className="flex flex-wrap gap-2">
                {preview.loads.map((l) => (
                  <li key={l.name}>
                    <Badge variant="muted">
                      {l.name}: {l.before} → {l.after}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">{preview.rows.length} swaps</p>
              <ul className="max-h-72 space-y-2 overflow-y-auto">
                {preview.rows.map((r) => (
                  <li key={`${r.slotId}-${r.outExecId}`} className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border px-3 py-2 text-sm">
                    <div>
                      <p className="font-bold">
                        {r.outName} → {r.inName}
                      </p>
                      <p className="text-muted-foreground">
                        {formatDateLong(r.date)}, {formatTimeRange(r.startTime, r.endTime)}
                      </p>
                    </div>
                    <Badge variant={r.applicantName ? "info" : "muted"}>{r.applicantName ? `Booked: ${r.applicantName}` : "Open"}</Badge>
                  </li>
                ))}
              </ul>
            </div>
            {bookedCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {bookedCount} booked interview(s) change. The execs newly added get the booking email with calendar links.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Close
          </Button>
          <Button onClick={apply} disabled={isPending || !preview || preview.rows.length === 0}>
            {isPending ? "Swapping…" : `Apply ${preview?.rows.length ?? 0} swaps`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
