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
    <div className="space-y-4 outline-none" tabIndex={0} onKeyDown={onKeyDown} aria-label={`Score ${applicant.name}`}>
      {!showsApplication && (
        <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">{applicant.name}</h3>
          {applicant.applicationLink && (
            <a
              href={applicant.applicationLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
            >
              Open application <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
        {!applicant.applicationLink && stage === "resume" && (
          <p className="text-xs text-muted-foreground">No application link yet — add one from the applicant&apos;s profile.</p>
        )}
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Tip: click this form, then press {options[0]}–{options[options.length - 1]} to score each criterion in turn, and Enter to submit.
      </p>

      {criteria.length === 0 ? (
        <p className="text-sm text-muted-foreground">This rubric has no active criteria. Add some in the Setup tab.</p>
      ) : (
        <ul className="space-y-3">
          {criteria.map((c, i) => (
            <li key={c.id} className={`rounded-lg border p-3 ${i === active ? "border-foreground" : ""}`} onClick={() => setActive(i)}>
              <div className="font-medium">{c.name}</div>
              {c.description && <div className="mb-2 text-xs text-muted-foreground">{c.description}</div>}
              <div className="flex flex-wrap gap-1.5">
                {options.map((o) => (
                  <Button
                    key={o}
                    type="button"
                    size="sm"
                    variant={scores[c.id] === o ? "default" : "outline"}
                    aria-pressed={scores[c.id] === o}
                    onClick={() => setScore(c.id, o)}
                  >
                    {o}
                  </Button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Textarea
        aria-label="Comment"
        placeholder="Anything the group should know (optional)"
        rows={3}
        value={comment}
        onChange={(e) => {
          setComment(e.target.value);
          setSaved("idle");
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {alreadySubmitted ? "Submitted — you can still change it." : saved === "saving" ? "Saving draft…" : saved === "saved" ? "Draft saved" : ""}
        </span>
        <Button disabled={isPending || !complete} onClick={submit}>
          {alreadySubmitted ? "Update score" : "Submit & next"}
        </Button>
      </div>
      {!complete && criteria.length > 0 && <p className="text-xs text-muted-foreground">Score every criterion to submit.</p>}
    </div>
  );
}
