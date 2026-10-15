"use client";

import { format } from "date-fns";
import { ExternalLink, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PrelimReviewRow } from "@/lib/data/prelim-review";
import { RUN_CHIP, STATUS_CHIP, VERDICT_CHIP } from "@/lib/prelim-review/labels";
import { KIND_LABELS, type Rubric } from "@/lib/prelim-review/rubric";

export function ReviewPanel({
  review,
  rubric,
  busy,
  onReviewAgain,
  onClose,
}: {
  review: PrelimReviewRow;
  rubric: Rubric;
  busy: boolean;
  onReviewAgain: () => void;
  onClose: () => void;
}) {
  const titles = new Map(rubric.criteria.map((c) => [c.id, c.title]));
  const chip = review.status === "done" && review.verdict ? VERDICT_CHIP[review.verdict] : RUN_CHIP[review.status === "running" ? "running" : "error"];

  return (
    <aside aria-label="Review details" className="w-full shrink-0 space-y-5 rounded-[22px] border bg-card p-5 lg:w-[410px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-xl">{review.fileName}</h2>
          <p className="text-sm text-muted-foreground">
            {review.projectName} · {KIND_LABELS[review.kind]} · {review.authorName} · {format(new Date(review.createdAt), "MMM d, h:mm a")}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close review" onClick={onClose}>
          <X />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={chip.variant}>{chip.label}</Badge>
        <a
          href={review.fileUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="Open in Google Drive"
          className="inline-flex items-center gap-1 text-sm text-link hover:underline"
        >
          Open in Drive <ExternalLink className="size-3.5" />
        </a>
      </div>
      <p className="text-sm text-muted-foreground">
        Checked against rules {review.rubricVersion === 0 ? "(starter)" : `version ${review.rubricVersion}`}.
      </p>

      {review.status === "error" && (
        <p className="max-w-prose text-[15px]">{review.errorMessage ?? "The review could not be completed. Please try again."}</p>
      )}

      {review.status === "done" && (
        <ul className="space-y-4">
          {review.results.map((r) => {
            const s = STATUS_CHIP[r.status];
            return (
              <li key={r.criterionId} className="space-y-1.5 border-t pt-4 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{titles.get(r.criterionId) ?? r.criterionId}</span>
                  <Badge variant={s.variant}>{s.label}</Badge>
                </div>
                {r.evidence && <p className="max-w-prose text-sm italic text-muted-foreground">&ldquo;{r.evidence}&rdquo;</p>}
                {r.suggestion && <p className="max-w-prose text-[15px]">{r.suggestion}</p>}
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-t pt-4">
        <Button variant="outline" onClick={onReviewAgain} disabled={busy}>
          Review again
        </Button>
      </div>
    </aside>
  );
}
