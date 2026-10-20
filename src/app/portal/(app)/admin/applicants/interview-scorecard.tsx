"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveScorecardAction } from "@/actions/interview-session";
import type { ScorecardView } from "@/lib/data/interview-sessions";
import {
  RECOMMENDATIONS,
  RUBRIC,
  RUBRIC_TOTAL,
  isScoreComplete,
  sectionMax,
  sectionTotal,
  totalScore,
  type Recommendation,
  type RubricSection,
  type Scores,
} from "@/lib/interview-guide";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Segmented } from "./segmented";

const recommendationBadge: Record<Recommendation, "ok" | "warn" | "bad"> = { yes: "ok", maybe: "warn", no: "bad" };

function SectionTotals({ scores }: { scores: Scores }) {
  return (
    <dl className="grid grid-cols-4 gap-2 text-center">
      {RUBRIC.map((s) => (
        <div key={s.key} className="rounded-xl bg-muted px-2 py-2">
          <dt className="text-[12px] text-muted-foreground">{s.label}</dt>
          <dd className="font-heading text-lg tabular-nums">
            {sectionTotal(scores, s.key)}
            <span className="text-[13px] font-normal text-muted-foreground">/{sectionMax(s.key)}</span>
          </dd>
        </div>
      ))}
      <div className="rounded-xl bg-sidebar px-2 py-2 text-sidebar-primary">
        <dt className="text-[12px]">Total</dt>
        <dd className="font-heading text-lg tabular-nums">
          {totalScore(scores)}
          <span className="text-[13px] font-normal opacity-80">/{RUBRIC_TOTAL}</span>
        </dd>
      </div>
    </dl>
  );
}

/** Remounted per interview (key), so drafts reset without effects. */
export function InterviewScorecard({
  sessionId,
  applicantName,
  mine,
  others,
  activeSection,
}: {
  sessionId: string;
  applicantName: string;
  mine: ScorecardView | null;
  others: ScorecardView[];
  /** The script section on screen, so its rubric lines open with their reminders. */
  activeSection: RubricSection["key"] | null;
}) {
  const [scores, setScores] = useState<Scores>(mine?.scores ?? {});
  const [recommendation, setRecommendation] = useState<Recommendation | null>(mine?.recommendation ?? null);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const firstRender = useRef(true);
  const alreadySubmitted = !!mine?.submitted;
  const complete = isScoreComplete(scores) && recommendation !== null;

  // Debounced draft autosave, skipped for the first render and once the score is submitted (that needs "Update score").
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (alreadySubmitted) return;
    const timer = setTimeout(async () => {
      setSaved("saving");
      const result = await saveScorecardAction({ sessionId, scores, recommendation, submit: false });
      setSaved(result.error ? "idle" : "saved");
    }, 1000);
    return () => clearTimeout(timer);
  }, [scores, recommendation, alreadySubmitted, sessionId]);

  function setScore(key: string, value: number) {
    // Clicking the chosen number again clears it.
    setScores((prev) => {
      const { [key]: current, ...rest } = prev;
      return current === value ? rest : { ...prev, [key]: value };
    });
    setSaved("idle");
  }

  function submit() {
    startTransition(async () => {
      const result = await saveScorecardAction({ sessionId, scores, recommendation, submit: true });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${alreadySubmitted ? "Updated" : "Submitted"} your score for ${applicantName}.`);
      if (result.mirrored === false) {
        toast.message("Saved on the interview. They aren't in the applicants list yet, so it isn't on their review.");
      }
      router.refresh();
    });
  }

  const submittedOthers = others.filter((o) => o.submitted);

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-[22px] border bg-card p-5" aria-label={`Score ${applicantName}`}>
        <div>
          <h3 className="text-base font-semibold">Your score</h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Score on your own, right after they leave. Click a number again to clear it. Out of {RUBRIC_TOTAL}.
          </p>
        </div>

        <SectionTotals scores={scores} />

        <div className="space-y-4">
          {RUBRIC.map((section) => {
            const active = activeSection === section.key;
            return (
              <fieldset key={section.key} className={cn("space-y-3 rounded-2xl p-3", active ? "bg-accent" : "border border-border")}>
                <legend className="px-1 text-[13px] font-semibold tracking-wide text-muted-foreground">
                  {section.label} · {sectionTotal(scores, section.key)}/{sectionMax(section.key)}
                </legend>
                {section.criteria.map((c) => (
                  <div key={c.key}>
                    <div className="flex items-baseline justify-between gap-2 text-sm font-medium">
                      <span>{c.label}</span>
                      <span className="text-[13px] font-normal text-muted-foreground tabular-nums">0 to {c.max}</span>
                    </div>
                    {active && (
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] leading-snug text-muted-foreground">
                        {c.asks.map((a) => (
                          <li key={a}>{a}</li>
                        ))}
                      </ul>
                    )}
                    <div role="group" aria-label={`${c.label} score`} className="mt-2 flex gap-1.5">
                      {Array.from({ length: c.max + 1 }, (_, n) => (
                        <button
                          key={n}
                          type="button"
                          aria-pressed={scores[c.key] === n}
                          aria-label={`${c.label}: ${n}`}
                          onClick={() => setScore(c.key, n)}
                          className="h-9 min-w-9 flex-1 rounded-xl border-[1.5px] border-border-strong bg-card text-[1.0625rem] font-bold transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-(--primary-border) aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:shadow-[0_3px_0_var(--primary-edge)]"
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </fieldset>
            );
          })}
        </div>

        <div>
          <div className="text-sm font-medium">Should they move forward?</div>
          <div className="mt-2">
            <Segmented<Recommendation | "">
              label="Recommendation"
              value={recommendation ?? ""}
              onChange={(v) => {
                if (v) setRecommendation(v);
                setSaved("idle");
              }}
              options={RECOMMENDATIONS.map((r) => ({ value: r.value, label: r.label }))}
              size="sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[13px] text-muted-foreground">
            {alreadySubmitted ? "Submitted. You can still change it." : saved === "saving" ? "Saving draft…" : saved === "saved" ? "Draft saved" : ""}
          </span>
          <Button size="lg" disabled={isPending || !complete} onClick={submit}>
            {alreadySubmitted ? "Update score" : "Submit score"}
          </Button>
        </div>
        {!complete && <p className="text-[13px] text-muted-foreground">Score every line and pick a recommendation to submit.</p>}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Other interviewers</h3>
        {!alreadySubmitted ? (
          <p className="text-[13px] text-muted-foreground">Other scores stay hidden until you submit yours.</p>
        ) : submittedOthers.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Nobody else has submitted yet.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {submittedOthers.map((o) => (
              <li key={o.reviewerId} className="space-y-1 px-3 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{o.reviewerName}</span>
                  <span className="flex items-center gap-2">
                    {o.recommendation && (
                      <Badge variant={recommendationBadge[o.recommendation]}>
                        {RECOMMENDATIONS.find((r) => r.value === o.recommendation)?.label}
                      </Badge>
                    )}
                    <span className="tabular-nums">
                      {totalScore(o.scores)}/{RUBRIC_TOTAL}
                    </span>
                  </span>
                </div>
                <div className="text-[13px] text-muted-foreground tabular-nums">
                  {RUBRIC.map((s) => `${s.label} ${sectionTotal(o.scores, s.key)}/${sectionMax(s.key)}`).join(" · ")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
