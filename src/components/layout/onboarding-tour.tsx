"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { completeOnboarding } from "@/actions/onboarding";

export interface TourStep {
  href: string;
  label: string;
  description: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const CALLOUT_WIDTH = 288;
const CALLOUT_GAP = 16;

/**
 * A "spotlight" walkthrough of the sidebar: a box-shadow ring highlights one
 * nav link at a time (no scrim element or z-index juggling needed -- the
 * shadow itself dims everything else) while a callout bubble next to it
 * explains the page. Clicking anywhere outside the callout, Escape, or
 * finishing the last step all mark the tour done via completeOnboarding().
 */
export function OnboardingTour({
  steps,
  run,
  onFinish,
}: {
  steps: TourStep[];
  run: boolean;
  onFinish: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (run) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset to step 0 whenever a new tour run starts
      setStepIndex(0);
    }
  }, [run]);

  useEffect(() => {
    if (!run) return;
    const step = steps[stepIndex];
    if (!step) return;

    function measure() {
      const el = document.getElementById(`nav-link-${step.href}`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [run, stepIndex, steps]);

  const isLast = stepIndex === steps.length - 1;

  function close() {
    completeOnboarding();
    onFinish();
  }

  function next() {
    if (isLast) {
      close();
      return;
    }
    // Clamped rather than a bare increment: `isLast` above is captured from
    // the render that created this handler, so a rapid double-click before
    // React re-renders would otherwise push stepIndex past the last step.
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  function back() {
    setStepIndex((i) => Math.max(0, i - 1));
  }

  useEffect(() => {
    if (!run) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, stepIndex, steps]);

  if (!run || !rect) return null;

  const step = steps[stepIndex];
  const calloutTop = Math.min(Math.max(rect.top - 8, 16), window.innerHeight - 200);
  const calloutLeft = Math.min(rect.left + rect.width + CALLOUT_GAP, window.innerWidth - CALLOUT_WIDTH - 16);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={close} aria-hidden="true" />
      <div
        className="pointer-events-none fixed z-40 rounded-md transition-all duration-200"
        style={{
          top: rect.top - 4,
          left: rect.left - 4,
          width: rect.width + 8,
          height: rect.height + 8,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.65)",
        }}
      />
      <div
        role="dialog"
        aria-label={`${step.label}, step ${stepIndex + 1} of ${steps.length}`}
        className="fixed z-50 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg transition-all duration-200"
        style={{ top: calloutTop, left: calloutLeft, width: CALLOUT_WIDTH }}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium">{step.label}</p>
          <button
            type="button"
            onClick={close}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Close tour"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">{step.description}</p>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {stepIndex + 1} of {steps.length}
          </span>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <Button variant="ghost" size="sm" onClick={back}>
                Back
              </Button>
            )}
            <Button size="sm" onClick={next}>
              {isLast ? "Done" : "Next"}
            </Button>
          </div>
        </div>
        {!isLast && (
          <button
            type="button"
            onClick={close}
            className="mt-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Skip tour
          </button>
        )}
      </div>
    </>
  );
}
