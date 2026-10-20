"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveScorecardAction } from "@/actions/interview-session";
import type { InterviewRow } from "@/lib/data/interview-sessions";
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

/** One shared scorecard per interview. Remounted per interview (key), so drafts reset without effects. */
export function InterviewScorecard({
  sessionId,
  applicantName,
  session,
  activeSection,
}: {
  sessionId: string;
  applicantName: string;
  session: NonNullable<InterviewRow["session"]>;
  /** The script section on screen, so its rubric lines open with their reminders. */
  activeSection: RubricSection["key"] | null;
}) {
  const [scores, setScores] = useState<Scores>(session.scores);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(session.recommendation);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  // Only what you changed is sent, so a partner's clicks on other lines are never overwritten.
  const pending = useRef<{ set: Scores; clear: Set<string>; recommendation?: Recommendation | null }>({ set: {}, clear: new Set() });
  const [edits, setEdits] = useState(0);
  const alreadySubmitted = !!session.scoredAt;
  const complete = isScoreComplete(scores) && recommendation !== null;

  function takePending() {
    const taken = pending.current;
    pending.current = { set: {}, clear: new Set() };
    return { set: taken.set, clear: [...taken.clear], recommendation: taken.recommendation };
  }

  // Debounced draft autosave. Once a final score is submitted, edits wait for "Update score".
  useEffect(() => {
    if (edits === 0 || alreadySubmitted) return;
    const timer = setTimeout(async () => {
      setSaved("saving");
      const patch = takePending();
      const result = await saveScorecardAction({ sessionId, ...patch, submit: false });
      if (result.error) {
        // Put the changes back so the next save retries them.
        for (const [k, v] of Object.entries(patch.set)) if (!pending.current.clear.has(k) && pending.current.set[k] === undefined) pending.current.set[k] = v;
        for (const k of patch.clear) if (pending.current.set[k] === undefined) pending.current.clear.add(k);
        if (patch.recommendation !== undefined && pending.current.recommendation === undefined) pending.current.recommendation = patch.recommendation;
        setSaved("idle");
        return;
      }
      setSaved("saved");
    }, 1000);
    return () => clearTimeout(timer);
  }, [edits, alreadySubmitted, sessionId]);

  function setScore(key: string, value: number) {
    // Clicking the chosen number again clears it.
    const current = scores[key];
    if (current === value) {
      setScores((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)));
      delete pending.current.set[key];
      pending.current.clear.add(key);
    } else {
      setScores((prev) => ({ ...prev, [key]: value }));
      pending.current.set[key] = value;
      pending.current.clear.delete(key);
    }
    setEdits((n) => n + 1);
    setSaved("idle");
  }

  function pickRecommendation(value: Recommendation) {
    setRecommendation(value);
    pending.current.recommendation = value;
    setEdits((n) => n + 1);
    setSaved("idle");
  }

  function submit() {
    startTransition(async () => {
      const patch = takePending();
      const result = await saveScorecardAction({ sessionId, ...patch, submit: true });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${alreadySubmitted ? "Updated" : "Submitted"} the score for ${applicantName}.`);
      if (result.mirrored === false) {
        toast.message("Saved on the interview. They aren't in the applicants list yet, so it isn't on their review.");
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 rounded-[22px] border bg-card p-5" aria-label={`Score ${applicantName}`}>
      <div>
        <h3 className="text-base font-semibold">Final score</h3>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Score together right after they leave, out of {RUBRIC_TOTAL}. If you disagree, talk it out and enter the number you agree on. One of you
          fills this in. Click a number again to clear it.
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
            ? `Submitted${session.scoredBy ? ` by ${session.scoredBy}` : ""}. You can still change it.`
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
      <p className="text-[13px] text-muted-foreground">If your partner is also scoring, refresh to see their changes.</p>
    </div>
  );
}
