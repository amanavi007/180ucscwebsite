"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveScorecardAction } from "@/actions/interview-session";
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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Segmented } from "./segmented";

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

export interface LiveScore {
  scores: Scores;
  recommendation: Recommendation | null;
  scoredAt: string | null;
  scoredBy: string | null;
}

/** What one save changed: lines set, lines cleared, and the recommendation if it changed. */
export interface ScorePatch {
  set: Scores;
  clear: string[];
  recommendation?: Recommendation | null;
}

const emptyPatch = (): ScorePatch => ({ set: {}, clear: [] });
const isEmpty = (p: ScorePatch) => Object.keys(p.set).length === 0 && p.clear.length === 0 && p.recommendation === undefined;

/** What is left of `pending` after `saved` went through. A line you changed again while saving stays pending. */
function remaining(pending: ScorePatch, saved: ScorePatch): ScorePatch {
  return {
    set: Object.fromEntries(Object.entries(pending.set).filter(([k, v]) => saved.set[k] !== v)),
    clear: pending.clear.filter((k) => !saved.clear.includes(k)),
    recommendation: pending.recommendation === saved.recommendation ? undefined : pending.recommendation,
  };
}

/**
 * One shared scorecard per interview. What you see is the last known shared score (`live`, refreshed by the page every few seconds)
 * with your own unsaved clicks on top, so a partner's changes appear without ever undoing something you just clicked.
 */
export function InterviewScorecard({
  sessionId,
  applicantName,
  live,
  onSaved,
  onSubmitted,
  activeSection,
}: {
  sessionId: string;
  applicantName: string;
  live: LiveScore;
  onSaved: (patch: ScorePatch) => void;
  onSubmitted: () => void;
  /** The script section on screen, so its rubric lines open with their reminders. */
  activeSection: RubricSection["key"] | null;
}) {
  const [pending, setPending] = useState<ScorePatch>(emptyPatch);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const scores: Scores = { ...live.scores, ...pending.set };
  for (const k of pending.clear) delete scores[k];
  const recommendation = pending.recommendation !== undefined ? pending.recommendation : live.recommendation;
  const alreadySubmitted = !!live.scoredAt;
  const complete = isScoreComplete(scores) && recommendation !== null;

  // Debounced draft autosave. Once a final score is submitted, edits wait for "Update score".
  useEffect(() => {
    if (isEmpty(pending) || alreadySubmitted) return;
    const timer = setTimeout(async () => {
      setSaved("saving");
      const result = await saveScorecardAction({ sessionId, ...pending, submit: false });
      if (result.error) {
        setSaved("idle");
        return;
      }
      onSaved(pending);
      setPending((p) => remaining(p, pending));
      setSaved("saved");
    }, 1000);
    return () => clearTimeout(timer);
  }, [pending, alreadySubmitted, sessionId, onSaved]);

  function setScore(key: string, value: number) {
    // Clicking the chosen number again clears it.
    const clearing = scores[key] === value;
    setPending((p) => {
      const set = Object.fromEntries(Object.entries(p.set).filter(([k]) => k !== key));
      const clear = p.clear.filter((k) => k !== key);
      return clearing ? { ...p, set, clear: [...clear, key] } : { ...p, set: { ...set, [key]: value }, clear };
    });
    setSaved("idle");
  }

  function pickRecommendation(value: Recommendation) {
    setPending((p) => ({ ...p, recommendation: value }));
    setSaved("idle");
  }

  function submit() {
    startTransition(async () => {
      const patch = pending;
      const result = await saveScorecardAction({ sessionId, ...patch, submit: true });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      onSaved(patch);
      setPending((p) => remaining(p, patch));
      toast.success(`${alreadySubmitted ? "Updated" : "Submitted"} the score for ${applicantName}.`);
      if (result.mirrored === false) {
        toast.message("Saved on the interview. They aren't in the applicants list yet, so it isn't on their review.");
      }
      onSubmitted();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 rounded-[22px] border bg-card p-5" aria-label={`Score ${applicantName}`}>
      <div>
        <h3 className="text-base font-semibold">Final score</h3>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Score together right after they leave, out of {RUBRIC_TOTAL}. If you disagree, talk it out and enter the number you agree on. Click a
          number again to clear it. Your partner&apos;s changes show up here within a few seconds.
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
            onChange={(v) => v && pickRecommendation(v)}
            options={RECOMMENDATIONS.map((r) => ({ value: r.value, label: r.label }))}
            size="sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] text-muted-foreground">
          {alreadySubmitted
            ? `Submitted${live.scoredBy ? ` by ${live.scoredBy}` : ""}. You can still change it.`
            : saved === "saving"
              ? "Saving draft…"
              : saved === "saved"
                ? "Draft saved"
                : ""}
        </span>
        <Button size="lg" disabled={isPending || !complete} onClick={submit}>
          {alreadySubmitted ? "Update score" : "Submit score"}
        </Button>
      </div>
      {!complete && <p className="text-[13px] text-muted-foreground">Score every line and pick a recommendation to submit.</p>}
    </div>
  );
}
