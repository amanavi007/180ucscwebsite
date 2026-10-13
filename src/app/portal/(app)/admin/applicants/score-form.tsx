"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { saveReviewAction } from "@/actions/recruit";
import type { RubricRow, ScoringApplicant } from "@/lib/data/recruit-scoring";
import type { Stage } from "@/lib/recruit-scoring";
import { parseLevels, type AnswerKey } from "@/lib/recruit-rubric-levels";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Remounted per applicant (key) so drafts reset without effects. */
export function ScoreForm({
  stage,
  rubric,
  applicant,
  onSubmitted,
  onScoredAnswers,
}: {
  stage: Stage;
  rubric: RubricRow;
  applicant: ScoringApplicant;
  onSubmitted: () => void;
  /** Which application answers have a scored criterion, so the reader can tick them. */
  onScoredAnswers?: (keys: AnswerKey[]) => void;
}) {
  const criteria = rubric.criteria.filter((c) => !c.archived);
  const [scores, setScores] = useState<Record<string, number>>(applicant.mine?.scores ?? {});
  const [comment, setComment] = useState(applicant.mine?.comment ?? "");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const firstRender = useRef(true);
  const levels = criteria.map((c) => parseLevels(c.description));
  const options = Array.from({ length: Math.floor(rubric.scaleMax - rubric.scaleMin) + 1 }, (_, i) => rubric.scaleMin + i);
  const complete = criteria.length > 0 && criteria.every((c) => scores[c.id] !== undefined);
  const alreadySubmitted = !!applicant.mine?.submitted;
  // On the resume stage the application card beside the form already shows the name and resume link.
  const showsApplication = stage === "resume" && !!applicant.application;

  const scoredKeys = criteria
    .filter((c) => c.answerKey && scores[c.id] !== undefined)
    .map((c) => c.answerKey as AnswerKey)
    .join(",");
  useEffect(() => {
    onScoredAnswers?.(scoredKeys ? (scoredKeys.split(",") as AnswerKey[]) : []);
  }, [scoredKeys, onScoredAnswers]);

  // Debounced draft autosave; skipped for the initial render and for already-submitted reviews.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (alreadySubmitted) return;
    const timer = setTimeout(async () => {
      setSaved("saving");
      const result = await saveReviewAction({ applicantId: applicant.id, stage, scores, comment, submit: false });
      setSaved(result.error ? "idle" : "saved");
    }, 1200);
    return () => clearTimeout(timer);
  }, [scores, comment, alreadySubmitted, applicant.id, stage]);

  function setScore(criterionId: string, value: number) {
    // Clicking the chosen number again clears it.
    setScores((prev) => {
      const { [criterionId]: current, ...rest } = prev;
      return current === value ? rest : { ...prev, [criterionId]: value };
    });
    setSaved("idle");
  }

  function submit() {
    startTransition(async () => {
      const result = await saveReviewAction({ applicantId: applicant.id, stage, scores, comment, submit: true });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${alreadySubmitted ? "Updated" : "Submitted"} your score for ${applicant.name}.`);
      router.refresh();
      onSubmitted();
    });
  }

  return (
    <div
      className="space-y-5 rounded-xl border bg-card p-6"
      aria-label={`Score ${applicant.name}`}
    >
      <div>
        <h3 className="text-base font-semibold">{showsApplication ? "Your score" : applicant.name}</h3>
        <p className="mt-1 text-[13px] text-muted-foreground">Score each line from {options[0]} to {options[options.length - 1]}. Click a number again to clear it.</p>
      </div>

      {!showsApplication && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {applicant.applicationLink ? (
            <a
              href={applicant.applicationLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
            >
              Open application <ExternalLink className="size-3.5" />
            </a>
          ) : (
            stage === "resume" && <span className="text-muted-foreground">No application link yet. Add one from the applicant&apos;s profile.</span>
          )}
        </div>
      )}

      {criteria.length === 0 ? (
        <p className="text-sm text-muted-foreground">This rubric has no active criteria. Add some in Settings → Rubric.</p>
      ) : (
        <TooltipProvider delay={120}>
          <ul className="space-y-5">
            {criteria.map((c, i) => {
              const meaning = levels[i];
              return (
                <li key={c.id}>
                  <div className="text-sm font-medium">{c.name}</div>
                  {meaning.size === 0 && c.description && (
                    <div className="mt-0.5 text-[13px] leading-snug whitespace-pre-line text-muted-foreground">{c.description}</div>
                  )}
                  <div role="group" aria-label={`${c.name} score`} className="mt-2.5 flex gap-1.5">
                    {options.map((o) => {
                      const button = (
                        <button
                          type="button"
                          aria-pressed={scores[c.id] === o}
                          aria-label={meaning.get(o) ? `${o}: ${meaning.get(o)}` : String(o)}
                          onClick={() => setScore(c.id, o)}
                          className="h-11 min-w-11 flex-1 rounded-lg border bg-card text-[15px] font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:font-semibold aria-pressed:text-background"
                        >
                          {o}
                        </button>
                      );
                      return meaning.get(o) ? (
                        <Tooltip key={o}>
                          <TooltipTrigger render={button} />
                          <TooltipContent side="top" sideOffset={8} className="max-w-60 px-2.5 py-2 text-[13px] leading-snug">
                            <span className="block font-semibold">{o}</span>
                            {meaning.get(o)}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span key={o} className="flex flex-1">{button}</span>
                      );
                    })}
                  </div>
                  {meaning.size > 0 && (
                    <div className="mt-1.5 flex justify-between text-xs text-muted-foreground" >
                      <span>Weak</span>
                      <span>Strong</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </TooltipProvider>
      )}

      <div>
        <label htmlFor={`comment-${applicant.id}`} className="text-sm font-medium">
          Comment <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id={`comment-${applicant.id}`}
          className="mt-2"
          placeholder="Anything the group should know"
          rows={3}
          value={comment}
          onChange={(e) => {
            setComment(e.target.value);
            setSaved("idle");
          }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] text-muted-foreground">
          {alreadySubmitted ? "Submitted. You can still change it." : saved === "saving" ? "Saving draft…" : saved === "saved" ? "Draft saved" : ""}
        </span>
        <Button size="lg" disabled={isPending || !complete} onClick={submit}>
          {alreadySubmitted ? "Update score" : "Submit and next"}
        </Button>
      </div>
      {!complete && criteria.length > 0 && <p className="text-[13px] text-muted-foreground">Score every line to submit.</p>}
    </div>
  );
}
