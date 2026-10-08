"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const R = 7;
const CIRC = 2 * Math.PI * R;

/** Exec-only gauge of the team's assistant messages today. Fills as usage grows; hover or focus for numbers. */
export function UsageRing({ used, cap }: { used: number; cap: number }) {
  const fraction = cap > 0 ? Math.min(used / cap, 1) : 0;
  const tone = fraction >= 1 ? "text-destructive" : fraction >= 0.8 ? "text-warning" : "text-primary";
  return (
    <TooltipProvider delay={100}>
      <Tooltip>
        <TooltipTrigger
          aria-label={`Assistant usage today: ${used} of ${cap} team messages`}
          className="grid size-8 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          render={<button type="button" />}
        >
          <svg viewBox="0 0 20 20" className="size-5 -rotate-90" aria-hidden>
            <circle cx="10" cy="10" r={R} fill="none" strokeWidth="2.5" className="stroke-border" />
            <circle
              cx="10"
              cy="10"
              r={R}
              fill="none"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - fraction)}
              className={cn("stroke-current transition-[stroke-dashoffset] duration-500", tone)}
            />
          </svg>
        </TooltipTrigger>
        <TooltipContent side="top" className="space-y-0.5 px-3 py-2 text-left">
          <p className="font-medium tabular-nums">
            {used} of {cap} team messages today
          </p>
          <p className="opacity-70">Shared by everyone. Resets at midnight Pacific.</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
