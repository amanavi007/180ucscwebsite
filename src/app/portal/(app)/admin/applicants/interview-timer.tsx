"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { formatClock } from "@/lib/interview-guide";
import type { Stopwatches } from "@/lib/use-stopwatches";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function timerStatus(seconds: number, targetSeconds: number, running: boolean, started: boolean) {
  if (seconds > targetSeconds) return { label: "Over time", variant: "warn" as const };
  if (running) return { label: "Running", variant: "info" as const };
  if (started) return { label: "Paused", variant: "muted" as const };
  return { label: "Not started", variant: "muted" as const };
}

/** A countdown-style stopwatch: counts up, shows the target, and says "Over time" in words when it passes it. */
export function SectionTimer({
  id,
  label,
  minutes,
  timers,
  compact = false,
}: {
  id: string;
  label: string;
  minutes: number;
  timers: Stopwatches;
  compact?: boolean;
}) {
  const target = minutes * 60;
  const seconds = timers.seconds(id);
  const running = timers.running(id);
  const status = timerStatus(seconds, target, running, timers.started(id));
  const percent = Math.min(100, Math.round((seconds / target) * 100));

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-0">
        <div className="text-[13px] text-muted-foreground">{label}</div>
        <div className="flex items-baseline gap-2">
          <span className="font-heading text-2xl tabular-nums" aria-live="off">
            {formatClock(seconds)}
          </span>
          <span className="text-sm text-muted-foreground tabular-nums">of {formatClock(target)}</span>
        </div>
      </div>
      <Badge variant={status.variant}>{status.label}</Badge>
      <div className="flex items-center gap-1.5">
        {running ? (
          <Button variant="outline" size="sm" onClick={() => timers.pause(id)}>
            <Pause /> Pause
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => timers.start(id)}>
            <Play /> {timers.started(id) ? "Resume" : "Start"}
          </Button>
        )}
        <Button variant="ghost" size="sm" aria-label={`Reset ${label} timer`} onClick={() => timers.reset(id)} disabled={!timers.started(id)}>
          <RotateCcw />
        </Button>
      </div>
      {!compact && (
        <div
          role="progressbar"
          aria-label={`${label} time used`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-foreground transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}
