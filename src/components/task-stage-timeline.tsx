"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { updateTaskStageStep, resetTaskStage, markExecReviewDone } from "@/actions/tasks";
import { Button } from "@/components/ui/button";
import {
  TASK_STAGE_STEPS,
  TASK_STAGE_STEP_LABELS,
  TASK_STAGE_STEP_SHORT_LABELS,
} from "@/lib/project-labels";
import { cn } from "@/lib/utils";
import type { TaskStageStep } from "@/lib/supabase/database.types";
import type { TaskExecReview } from "@/lib/data/types";

export function TaskStageTimeline({
  taskId,
  projectId,
  currentStep,
  editable,
  execReviews = [],
  currentUserId,
}: {
  taskId: string;
  projectId: string;
  currentStep: TaskStageStep;
  editable: boolean;
  /** Execs assigned to review this task; only shown at the awaiting-exec step. */
  execReviews?: TaskExecReview[];
  currentUserId?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const currentIndex = TASK_STAGE_STEPS.indexOf(currentStep);
  const awaitingExec = currentStep === "awaiting_exec_revision";
  const reviewsDone = execReviews.filter((r) => r.reviewed_at).length;
  const myPendingReview = execReviews.some((r) => r.exec_id === currentUserId && !r.reviewed_at);
  const reviewerSummary = execReviews
    .map((r) => `${r.exec?.name ?? "Exec"} (${r.reviewed_at ? "done" : "pending"})`)
    .join(", ");

  function setStep(step: TaskStageStep) {
    if (!editable || isPending) return;
    startTransition(async () => {
      const result = await updateTaskStageStep(taskId, projectId, step);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      if (result.notice) toast.warning(result.notice);
      router.refresh();
    });
  }

  function markReviewed() {
    startTransition(async () => {
      const result = await markExecReviewDone(taskId, projectId);
      if (result?.error) toast.error(result.error);
      else router.refresh();
    });
  }

  function reset() {
    if (!editable || isPending) return;
    startTransition(async () => {
      const result = await resetTaskStage(taskId, projectId);
      if (result?.error) toast.error(result.error);
      else router.refresh();
    });
  }

  return (
    <div
      className="flex items-center"
      title={
        awaitingExec && reviewerSummary
          ? `${TASK_STAGE_STEP_LABELS[currentStep]}. Exec reviewers: ${reviewerSummary}`
          : TASK_STAGE_STEP_LABELS[currentStep]
      }
    >
      {TASK_STAGE_STEPS.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={step} className="flex items-center">
            <button
              type="button"
              disabled={!editable || isPending}
              onClick={() => setStep(step)}
              aria-label={TASK_STAGE_STEP_LABELS[step]}
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-full border-2 text-[9px] leading-none font-bold transition-colors",
                done && "border-(--primary-border) bg-primary text-primary-foreground",
                active && "border-link bg-background text-link",
                !done && !active && "border-muted-foreground/30 bg-background",
                editable && !isPending && "cursor-pointer",
                (!editable || isPending) && "cursor-default",
              )}
            >
              {done ? "✓" : ""}
            </button>
            {i < TASK_STAGE_STEPS.length - 1 && (
              <div
                className={cn(
                  "h-0.5 w-3 shrink-0 sm:w-4",
                  i < currentIndex ? "bg-foreground" : "bg-muted-foreground/30",
                )}
              />
            )}
          </div>
        );
      })}
      <span className="ml-2 truncate text-xs text-muted-foreground">
        {awaitingExec && execReviews.length > 0
          ? `Exec review ${reviewsDone}/${execReviews.length}`
          : TASK_STAGE_STEP_SHORT_LABELS[currentStep]}
      </span>
      {awaitingExec && myPendingReview && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={markReviewed}
          disabled={isPending}
          className="ml-2 h-6 shrink-0 px-2 text-xs"
        >
          Mark reviewed
        </Button>
      )}
      {editable && (
        <button
          type="button"
          onClick={reset}
          disabled={isPending}
          aria-label="Reset to not started"
          title="Reset to not started"
          className="ml-1 shrink-0 rounded p-0.5 text-muted-foreground/50 hover:bg-muted hover:text-muted-foreground"
        >
          <RotateCcw className="size-3" />
        </button>
      )}
    </div>
  );
}
