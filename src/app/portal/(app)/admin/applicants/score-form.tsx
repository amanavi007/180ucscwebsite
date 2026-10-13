"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { saveReviewAction } from "@/actions/recruit";
import type { RubricRow, ScoringApplicant } from "@/lib/data/recruit-scoring";
import type { Stage } from "@/lib/recruit-scoring";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** Remounted per applicant (key) so drafts reset without effects. */
export function ScoreForm({
  stage,
  rubric,
  applicant,
  onSubmitted,
}: {
  stage: Stage;
  rubric: RubricRow;
  applicant: ScoringApplicant;
  onSubmitted: () => void;
}) {
  const criteria = rubric.criteria.filter((c) => !c.archived);
  const [scores, setScores] = useState<Record<string, number>>(applicant.mine?.scores ?? {});
  const [comment, setComment] = useState(applicant.mine?.comment ?? "");
  const [active, setActive] = useState(0);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const firstRender = useRef(true);
  const options = Array.from({ length: Math.floor(rubric.scaleMax - rubric.scaleMin) + 1 }, (_, i) => rubric.scaleMin + i);
  const complete = criteria.length > 0 && criteria.every((c) => scores[c.id] !== undefined);
  const alreadySubmitted = !!applicant.mine?.submitted;
  // On the resume stage the application card beside the form already shows the name and resume link.
  const showsApplication = stage === "resume" && !!applicant.application;

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
    setScores((prev) => ({ ...prev, [criterionId]: value }));
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

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
    const digit = Number(e.key);
    if (Number.isInteger(digit) && options.includes(digit) && criteria[active]) {
      setScore(criteria[active].id, digit);
      setActive((a) => Math.min(a + 1, criteria.length - 1));
      e.preventDefault();
    } else if (e.key === "Enter" && complete && !isPending) {
      submit();
      e.preventDefault();
    }
  }

  return (
    <div
      className="space-y-5 rounded-xl border bg-card p-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label={`Score ${applicant.name}`}
    >
      <div>
        <h3 className="text-base font-semibold">{showsApplication ? "Your score" : applicant.name}</h3>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Press {options[0]} to {options[options.length - 1]} to score each line, and Enter to submit.
        </p>
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
        <ul className="space-y-5">
          {criteria.map((c, i) => (
            <li key={c.id} onClick={() => setActive(i)}>
              <div className={`text-sm font-medium ${i === active ? "text-primary" : ""}`}>{c.name}</div>
              {c.description && <div className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{c.description}</div>}
              <div role="group" aria-label={`${c.name} score`} className="mt-2.5 flex gap-1.5">
                {options.map((o) => (
                  <button
                    key={o}
                    type="button"
                    aria-pressed={scores[c.id] === o}
                    onClick={() => setScore(c.id, o)}
                    className="size-11 rounded-lg border bg-card text-[15px] font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:font-semibold aria-pressed:text-background"
                  >
                    {o}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
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
