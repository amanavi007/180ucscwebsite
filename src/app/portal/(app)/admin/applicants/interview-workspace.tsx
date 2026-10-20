"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  getInterviewLiveAction,
  resetInterviewSessionAction,
  saveInterviewNotesAction,
  saveInterviewPlanAction,
} from "@/actions/interview-session";
import type { InterviewRow } from "@/lib/data/interview-sessions";
import {
  BEHAVIORAL_PICK_MAX,
  BEHAVIORAL_PICK_MIN,
  BEHAVIORAL_QUESTIONS,
  CASES,
  CASE_REMINDERS,
  CASE_STEPS,
  DEPTHS,
  ELABORATE_PROMPTS,
  RESEARCH_ASKS,
  RESEARCH_PROMPTS,
  SCRIPT,
  SCRIPT_SECTIONS,
  SUGGESTED_MIX,
  behavioralMix,
  behavioralMixAdvice,
  findCase,
  formatClock,
  timerTargetSeconds,
  type Depth,
  type RubricSection,
  type ScriptSection,
} from "@/lib/interview-guide";
import { useStopwatches, type Stopwatches } from "@/lib/use-stopwatches";
import { playChime } from "@/lib/chime";
import { formatDateLong } from "@/lib/date";
import { formatTimeRange } from "@/lib/coffee-chat";
import { useConfirm } from "@/components/confirm-dialog";
import { useUrlTab } from "@/components/url-tabs";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FilterChip } from "@/components/filter-chip";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SectionTimer } from "./interview-timer";
import { InterviewScorecard, type LiveScore, type ScorePatch } from "./interview-scorecard";
import { Segmented } from "./segmented";

type Session = NonNullable<InterviewRow["session"]>;
type NoteStatus = "idle" | "saving" | "saved" | "error";

/** Local copy of the shared notes. Only the fields you changed are sent, and the server merges them. */
function useSharedNotes(session: Session, onSaved: () => void) {
  const [notes, setNotes] = useState<Record<string, string>>(session.notes);
  const [status, setStatus] = useState<NoteStatus>("idle");
  const dirty = useRef<Set<string>>(new Set());
  const latest = useRef(notes);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    const keys = [...dirty.current];
    if (keys.length === 0) return;
    dirty.current = new Set();
    setStatus("saving");
    const patch = Object.fromEntries(keys.map((k) => [k, latest.current[k] ?? ""]));
    const result = await saveInterviewNotesAction({ sessionId: session.id, patch });
    if (result.error) {
      for (const k of keys) dirty.current.add(k);
      setStatus("error");
      toast.error(result.error);
      return;
    }
    onSaved();
    setStatus(dirty.current.size > 0 ? "saving" : "saved");
  }, [session.id, onSaved]);

  const set = useCallback(
    (key: string, value: string) => {
      latest.current = { ...latest.current, [key]: value };
      setNotes(latest.current);
      dirty.current.add(key);
      setStatus("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 900);
    },
    [flush],
  );

  /** Takes in a partner's changes, except for boxes you have unsaved edits in or are typing in right now. */
  const applyRemote = useCallback((remote: Record<string, string>) => {
    const focused = typeof document !== "undefined" ? document.activeElement?.getAttribute("data-note-key") : null;
    const next = { ...latest.current };
    let changed = false;
    for (const [key, value] of Object.entries(remote)) {
      if (dirty.current.has(key) || key === focused || next[key] === value) continue;
      next[key] = value;
      changed = true;
    }
    if (changed) {
      latest.current = next;
      setNotes(next);
    }
  }, []);

  // Don't lose the last few seconds of typing when leaving the interview.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      void flush();
    },
    [flush],
  );

  return { notes, set, status, applyRemote };
}

function NoteField({
  id,
  noteKey,
  label,
  hint,
  rows = 4,
  value,
  onChange,
}: {
  id: string;
  /** Which shared note this is, so a live update never overwrites the box you're typing in. */
  noteKey: string;
  label: string;
  hint?: string;
  rows?: number;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {hint && <span className="font-normal text-muted-foreground"> {hint}</span>}
      </label>
      <Textarea id={id} data-note-key={noteKey} className="mt-2" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Card({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-4 rounded-[22px] border bg-card p-5", className)}>
      {title && <h3 className="text-lg">{title}</h3>}
      {children}
    </section>
  );
}

function ReadAloud({ lines }: { lines: readonly string[] }) {
  return (
    <ul className="max-w-[66ch] space-y-3">
      {lines.map((l) => (
        <li key={l} className="rounded-2xl bg-accent px-4 py-3 text-[15px] leading-relaxed text-accent-foreground">
          {l}
        </li>
      ))}
    </ul>
  );
}

function DepthBadge({ depth }: { depth: Depth }) {
  const label = DEPTHS.find((d) => d.value === depth)?.label ?? depth;
  return <Badge variant={depth === "deep" ? "info" : depth === "core" ? "muted" : "ok"}>{label}</Badge>;
}

function BeforeSection({
  row,
  behavioralKeys,
  toggleQuestion,
  caseKey,
  setCaseKey,
}: {
  row: InterviewRow;
  behavioralKeys: string[];
  toggleQuestion: (key: string) => void;
  caseKey: string | null;
  setCaseKey: (key: string | null) => void;
}) {
  const advice = behavioralMixAdvice(behavioralKeys);
  const mix = behavioralMix(behavioralKeys);
  const applicant = row.applicant;
  return (
    <div className="space-y-5">
      <Card title="Before they join">
        <ul className="max-w-[66ch] list-disc space-y-1.5 pl-5 text-[15px]">
          {SCRIPT.before.checklist.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        {applicant && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {applicant.resumeUrl && (
                <a href={applicant.resumeUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Open resume <ExternalLink />
                </a>
              )}
              {applicant.applicationLink && (
                <a href={applicant.applicationLink} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Open application <ExternalLink />
                </a>
              )}
              {!applicant.resumeUrl && !applicant.applicationLink && (
                <span className="text-[13px] text-muted-foreground">No resume or application link on file for them.</span>
              )}
            </div>
            {applicant.essays.length > 0 && (
              <details className="rounded-2xl border bg-background px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium">Their application answers, for follow-ups</summary>
                <div className="mt-3 max-w-[100ch] space-y-3">
                  {applicant.essays.map((e) => (
                    <div key={e.label}>
                      <div className="text-[13px] font-semibold text-muted-foreground">{e.label}</div>
                      <p className="mt-0.5 text-[15px] leading-relaxed whitespace-pre-line">{e.text}</p>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </Card>

      <Card title="Pick your behavioral questions">
        <p className="max-w-[66ch] text-sm text-muted-foreground">
          Pick {BEHAVIORAL_PICK_MIN} to {BEHAVIORAL_PICK_MAX} for 12 minutes. A good spread is {SUGGESTED_MIX.warmup} warm-up, {SUGGESTED_MIX.core} core and{" "}
          {SUGGESTED_MIX.deep} deep dive, so not every question needs a long story.
        </p>
        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          <Badge variant={behavioralKeys.length >= BEHAVIORAL_PICK_MIN && behavioralKeys.length <= BEHAVIORAL_PICK_MAX ? "ok" : "warn"}>
            {behavioralKeys.length} picked
          </Badge>
          {DEPTHS.map((d) => (
            <span key={d.value} className="text-[13px] text-muted-foreground tabular-nums">
              {d.label} {mix[d.value]}
            </span>
          ))}
        </div>
        {advice && <p className="text-[13px] text-muted-foreground">{advice}</p>}
        <div className="space-y-5">
          {DEPTHS.map((d) => (
            <div key={d.value}>
              <div className="flex items-baseline gap-2">
                <h4 className="text-sm font-semibold">{d.label}</h4>
                <span className="text-[13px] text-muted-foreground">{d.blurb}</span>
              </div>
              <ul className="mt-2 space-y-1.5">
                {BEHAVIORAL_QUESTIONS.filter((q) => q.depth === d.value).map((q) => {
                  const picked = behavioralKeys.includes(q.key);
                  return (
                    <li key={q.key}>
                      <button
                        type="button"
                        aria-pressed={picked}
                        onClick={() => toggleQuestion(q.key)}
                        className="flex w-full items-start gap-3 rounded-2xl border border-border px-4 py-2.5 text-left text-[15px] transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-border-strong aria-pressed:bg-accent"
                      >
                        <span className="mt-0.5 inline-flex h-5 min-w-14 items-center justify-center rounded-full bg-muted px-2 text-[12px] font-semibold text-muted-foreground">
                          {picked ? "Picked" : "Pick"}
                        </span>
                        <span>{q.text}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Pick the case">
        <p className="max-w-[66ch] text-sm text-muted-foreground">You can change this later, or click the chosen one again to clear it. The prompt shows up in the Case step.</p>
        <div role="group" aria-label="Case" className="flex flex-wrap gap-1.5">
          {CASES.map((c) => (
            <FilterChip key={c.key} selected={caseKey === c.key} onClick={() => setCaseKey(caseKey === c.key ? null : c.key)}>
              {c.title}
            </FilterChip>
          ))}
        </div>
      </Card>

      <Card title="Open the interview">
        <p className="text-sm text-muted-foreground">Read these out. Change the names to yours.</p>
        <ReadAloud lines={SCRIPT.before.welcome} />
      </Card>
    </div>
  );
}

function BehavioralSection({
  keys,
  timers,
  value,
  onNote,
  goBefore,
}: {
  keys: string[];
  timers: Stopwatches;
  value: (key: string) => string;
  onNote: (key: string, v: string) => void;
  goBefore: () => void;
}) {
  const picked = keys.map((k) => BEHAVIORAL_QUESTIONS.find((q) => q.key === k)).filter((q): q is NonNullable<typeof q> => !!q);
  const perQuestion = picked.length > 0 ? Math.round((12 / picked.length) * 10) / 10 : null;
  return (
    <div className="space-y-5">
      <Card>
        <SectionTimer id="behavioral" label="Behavioral" minutes={12} timers={timers} />
        <p className="max-w-[66ch] text-sm text-muted-foreground">
          {SCRIPT.behavioral.intro}
          {perQuestion && ` With ${picked.length} questions, that's about ${perQuestion} minutes each.`}
        </p>
        <div>
          <div className="text-sm font-medium">To ask them to say more</div>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {ELABORATE_PROMPTS.map((p) => (
              <li key={p} className="rounded-full bg-muted px-3 py-1 text-[13px]">
                {p}
              </li>
            ))}
          </ul>
        </div>
      </Card>

      {picked.length === 0 ? (
        <Card>
          <p className="text-sm">You haven&apos;t picked any questions yet.</p>
          <Button variant="outline" onClick={goBefore}>
            <ArrowLeft /> Pick questions
          </Button>
        </Card>
      ) : (
        picked.map((q, i) => (
          <Card key={q.key}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-heading text-lg tabular-nums">{i + 1}.</span>
              <DepthBadge depth={q.depth} />
            </div>
            <p className="max-w-[66ch] text-lg leading-snug font-semibold">{q.text}</p>
            <div>
              <div className="text-[13px] font-semibold text-muted-foreground">Follow-ups</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[15px]">
                {q.followUps.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
            <NoteField id={`note-b-${q.key}`} label="Notes" value={value(`b:${q.key}`)} noteKey={`b:${q.key}`} onChange={(v) => onNote(`b:${q.key}`, v)} />
          </Card>
        ))
      )}

      <Card>
        <NoteField
          id="note-b-resume"
          label="Resume questions"
          hint="Anything you asked from their resume, and what they said."
          value={value("b:resume")}
          noteKey={"b:resume"} onChange={(v) => onNote("b:resume", v)}
        />
      </Card>
    </div>
  );
}

function ResearchSection({
  researchKey,
  setResearchKey,
  timers,
  value,
  onNote,
}: {
  researchKey: string | null;
  setResearchKey: (key: string | null) => void;
  timers: Stopwatches;
  value: (key: string) => string;
  onNote: (key: string, v: string) => void;
}) {
  const prompt = RESEARCH_PROMPTS.find((r) => r.key === researchKey) ?? null;
  return (
    <div className="space-y-5">
      <Card>
        <SectionTimer id="research" label="Research" minutes={8} timers={timers} />
        <p className="max-w-[66ch] text-sm text-muted-foreground">{SCRIPT.research.intro} Aim for 5 to 8 minutes.</p>
      </Card>
      <Card title="Which prompt did they choose?">
        <div role="group" aria-label="Research prompt" className="flex flex-wrap gap-1.5">
          {RESEARCH_PROMPTS.map((r) => (
            <FilterChip key={r.key} selected={researchKey === r.key} onClick={() => setResearchKey(researchKey === r.key ? null : r.key)}>
              {r.title}
            </FilterChip>
          ))}
        </div>
        {prompt ? <p className="max-w-[66ch] text-[15px] leading-relaxed text-muted-foreground">{prompt.text}</p> : null}
      </Card>
      <Card title="Ask them">
        <ul className="list-disc space-y-1 pl-5 text-[15px]">
          {RESEARCH_ASKS.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        <NoteField
          id="note-research"
          label="Notes"
          hint="Number and quality of sources, how they chose their direction, whether it sounds like ChatGPT, how they presented."
          rows={6}
          value={value("research")}
          noteKey={"research"} onChange={(v) => onNote("research", v)}
        />
      </Card>
    </div>
  );
}

function CaseSection({
  caseKey,
  setCaseKey,
  timers,
  value,
  onNote,
}: {
  caseKey: string | null;
  setCaseKey: (key: string | null) => void;
  timers: Stopwatches;
  value: (key: string) => string;
  onNote: (key: string, v: string) => void;
}) {
  const chosen = findCase(caseKey);
  const stepIds = CASE_STEPS.map((s) => `case:${s.key}`);
  const activeIndex = CASE_STEPS.findIndex((s) => timers.running(`case:${s.key}`));
  const total = stepIds.reduce((n, id) => n + timers.seconds(id), 0);

  function next() {
    // Moves on from the running step, or from the last one with time on it.
    const last = CASE_STEPS.reduce((acc, s, i) => (timers.started(`case:${s.key}`) ? i : acc), -1);
    const from = activeIndex >= 0 ? activeIndex : last;
    const target = CASE_STEPS[Math.min(from + 1, CASE_STEPS.length - 1)];
    timers.switchTo(stepIds, `case:${target.key}`);
  }

  return (
    <div className="space-y-5">
      <Card title="Case">
        <p className="max-w-[66ch] text-sm text-muted-foreground">{SCRIPT.case.intro}</p>
        <div role="group" aria-label="Case" className="flex flex-wrap gap-1.5">
          {CASES.map((c) => (
            <FilterChip key={c.key} selected={caseKey === c.key} onClick={() => setCaseKey(caseKey === c.key ? null : c.key)}>
              {c.title}
            </FilterChip>
          ))}
        </div>
        <ul className="max-w-[66ch] list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
          {CASE_REMINDERS.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </Card>

      {chosen ? (
        <>
          <Card title="First, explain how the case works">
            <p className="text-sm text-muted-foreground">Read this to them before you start. Change it to your own words if you like.</p>
            <ReadAloud lines={SCRIPT.case.explain} />
          </Card>

          <Card title="Then read this aloud, slowly, at most twice">
            <p className="max-w-[66ch] text-[17px] leading-relaxed">{chosen.prompt}</p>
            <p className="text-[13px] text-muted-foreground">{chosen.source}</p>
          </Card>

          <Card title="Steps">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <span className="font-heading text-2xl tabular-nums">{formatClock(total)}</span>{" "}
                <span className="text-muted-foreground tabular-nums">of 16:00 for the whole case</span>
              </div>
              <Button variant="outline" onClick={next}>
                {activeIndex < 0 && !stepIds.some((id) => timers.started(id)) ? "Start the case" : "Next step"} <ArrowRight />
              </Button>
            </div>
            <ol className="space-y-3">
              {CASE_STEPS.map((s, i) => (
                <li key={s.key} className={cn("rounded-2xl border p-4", activeIndex === i ? "border-border-strong bg-accent" : "border-border")}>
                  <div className="text-sm font-semibold">
                    {i + 1}. {s.label}
                  </div>
                  <p className="mb-2 text-[13px] text-muted-foreground">{s.hint}</p>
                  <p className="mb-3 rounded-xl bg-accent px-3 py-2 text-[15px] leading-relaxed text-accent-foreground">
                    <span className="font-semibold">Say: </span>
                    {s.say}
                  </p>
                  <SectionTimer id={`case:${s.key}`} label={s.label} minutes={s.minutes} timers={timers} compact />
                </li>
              ))}
            </ol>
          </Card>

          <Card title="Only if they ask">
            <p className="max-w-[66ch] text-sm text-muted-foreground">
              Give this only if they ask. Tick each one they asked, so you can score their questions.{" "}
              <span className="tabular-nums">
                {chosen.ifAsked.filter((_, i) => value(`c:asked:${chosen.key}:${i}`) === "1").length} of {chosen.ifAsked.length} asked.
              </span>
            </p>
            <ul className="max-w-[66ch] space-y-3">
              {chosen.ifAsked.map((a, i) => {
                const key = `c:asked:${chosen.key}:${i}`;
                const asked = value(key) === "1";
                return (
                  <li key={a.question} className={cn("flex gap-3 rounded-2xl border p-3", asked ? "border-border-strong bg-accent" : "border-border")}>
                    <Checkbox
                      id={`asked-${chosen.key}-${i}`}
                      className="mt-0.5 size-5"
                      checked={asked}
                      onCheckedChange={(checked) => onNote(key, checked ? "1" : "")}
                    />
                    <div>
                      <label htmlFor={`asked-${chosen.key}-${i}`} className="block cursor-pointer text-sm font-semibold">
                        {a.question} <span className="font-normal text-muted-foreground">They asked this</span>
                      </label>
                      <p className="text-[15px]">{a.answer}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            {chosen.interviewerNotes && (
              <div>
                <div className="text-[13px] font-semibold text-muted-foreground">For you, not for them</div>
                <ul className="mt-1 max-w-[66ch] list-disc space-y-1 pl-5 text-[15px]">
                  {chosen.interviewerNotes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </>
      ) : (
        <Card>
          <p className="text-sm">Pick a case above to see its prompt.</p>
        </Card>
      )}

      <Card title="Case notes">
        <NoteField
          id="note-case-questions"
          label="Questions they asked"
          hint="Were they relevant? Did they ask enough?"
          value={value("c:questions")}
          noteKey={"c:questions"} onChange={(v) => onNote("c:questions", v)}
        />
        <NoteField
          id="note-case-approach"
          label="Summary of approach and solution"
          rows={6}
          value={value("c:approach")}
          noteKey={"c:approach"} onChange={(v) => onNote("c:approach", v)}
        />
        <NoteField id="note-case-answer" label="Their final answer" rows={3} value={value("c:answer")} noteKey={"c:answer"} onChange={(v) => onNote("c:answer", v)} />
      </Card>
    </div>
  );
}

function WrapUpSection({ value, onNote }: { value: (key: string) => string; onNote: (key: string, v: string) => void }) {
  return (
    <div className="space-y-5">
      <Card title="Close the interview">
        <ReadAloud lines={SCRIPT.wrapup.lines} />
      </Card>
      <Card title="Right after they leave">
        <ul className="max-w-[66ch] list-disc space-y-1.5 pl-5 text-[15px]">
          {SCRIPT.wrapup.after.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        <NoteField
          id="note-overall"
          label="Overall"
          hint="Strengths, concerns, and why you'd move them forward or not."
          rows={6}
          value={value("overall")}
          noteKey={"overall"} onChange={(v) => onNote("overall", v)}
        />
      </Card>
    </div>
  );
}

function timeIsUp(id: string, timers: Stopwatches): boolean {
  const target = timerTargetSeconds(id);
  return target !== null && timers.seconds(id) >= target;
}

const sectionToRubric: Partial<Record<ScriptSection["key"], RubricSection["key"]>> = {
  behavioral: "behavioral",
  research: "research",
  case: "case",
};

/** The working screen for one interview: script and notes on the left, your scorecard on the right. */
export function InterviewWorkspace({ row, session, onBack }: { row: InterviewRow; session: Session; onBack: () => void }) {
  // The step is in the URL, so a reload lands on the same part of the script.
  const [stepParam, setStep] = useUrlTab(SCRIPT_SECTIONS.map((s) => s.key), "before", "step");
  const section = stepParam as ScriptSection["key"];
  const setSection = setStep as (key: ScriptSection["key"]) => void;
  const leave = () => {
    setStep("before");
    onBack();
  };
  const [behavioralKeys, setBehavioralKeys] = useState<string[]>(session.behavioralKeys);
  const [researchKey, setResearchKey] = useState<string | null>(session.researchKey);
  const [caseKey, setCaseKey] = useState<string | null>(session.caseKey);
  const timers = useStopwatches(`interview-timers:${session.id}`);
  const [soundOn, setSoundOn] = useState(() => {
    try {
      return localStorage.getItem("interview-sound") !== "off";
    } catch {
      return true;
    }
  });
  const chimed = useRef<Set<string>>(new Set());

  // One soft chime when a running timer reaches its limit. Resetting a timer lets it chime again.
  useEffect(() => {
    for (const id of timers.runningIds) {
      const target = timerTargetSeconds(id);
      if (target === null) continue;
      if (timers.seconds(id) >= target && !chimed.current.has(id)) {
        chimed.current.add(id);
        if (soundOn) playChime();
      }
    }
    for (const id of [...chimed.current]) {
      const target = timerTargetSeconds(id);
      if (target !== null && timers.seconds(id) < target) chimed.current.delete(id);
    }
  });

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    try {
      localStorage.setItem("interview-sound", next ? "on" : "off");
    } catch {
      // The choice just won't be remembered.
    }
    if (next) playChime();
  }
  // Counts finished saves (notes and score), so a poll already in flight can tell its answer may be stale.
  const saveCount = useRef(0);
  const countSave = useCallback(() => {
    saveCount.current += 1;
  }, []);
  const { notes, set: setNote, status, applyRemote } = useSharedNotes(session, countSave);
  // Last known shared score. Updated by polling and by this page's own saves.
  const [live, setLive] = useState<LiveScore>({
    scores: session.scores,
    recommendation: session.recommendation,
    scoredAt: session.scoredAt,
    scoredBy: session.scoredBy,
  });

  const poll = useCallback(async () => {
    const startedAt = saveCount.current;
    const result = await getInterviewLiveAction(session.id);
    // A save finished while this was in flight, so this answer may be older than what we just wrote.
    if (!result.state || saveCount.current !== startedAt) return;
    applyRemote(result.state.notes);
    setLive({
      scores: result.state.scores,
      recommendation: result.state.recommendation,
      scoredAt: result.state.scoredAt,
      scoredBy: result.state.scoredBy,
    });
  }, [session.id, applyRemote]);

  useEffect(() => {
    const tick = () => {
      if (!document.hidden) void poll();
    };
    const id = setInterval(tick, 5000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, [poll]);

  const onScoreSaved = useCallback((patch: ScorePatch) => {
    countSave();
    setLive((prev) => {
      const scores = { ...prev.scores, ...patch.set };
      for (const k of patch.clear) delete scores[k];
      return { ...prev, scores, recommendation: patch.recommendation !== undefined ? patch.recommendation : prev.recommendation };
    });
  }, [countSave]);
  const planned = useRef(false);
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [resetting, setResetting] = useState(false);

  async function reset() {
    const ok = await confirm({
      title: `Reset ${row.name}'s interview?`,
      description: "Clears the questions you picked, all notes, and every interviewer's score, so it goes back to not started.",
      confirmLabel: "Reset interview",
    });
    if (!ok) return;
    setResetting(true);
    const result = await resetInterviewSessionAction(session.id);
    if (result.error) {
      setResetting(false);
      toast.error(result.error);
      return;
    }
    try {
      sessionStorage.removeItem(`interview-timers:${session.id}`);
    } catch {
      // Nothing to clear if storage is blocked.
    }
    toast.success(`Reset ${row.name}'s interview.`);
    router.refresh();
    leave();
  }

  // The plan saves itself shortly after any change.
  useEffect(() => {
    if (!planned.current) {
      planned.current = true;
      return;
    }
    const t = setTimeout(async () => {
      const result = await saveInterviewPlanAction({ sessionId: session.id, behavioralKeys, researchKey, caseKey });
      if (result.error) toast.error(result.error);
    }, 600);
    return () => clearTimeout(t);
  }, [behavioralKeys, researchKey, caseKey, session.id]);

  const toggleQuestion = useCallback((key: string) => {
    setBehavioralKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }, []);
  const value = useCallback((key: string) => notes[key] ?? "", [notes]);

  const panelRef = useRef<HTMLDivElement>(null);
  const [panelFits, setPanelFits] = useState(true);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const measure = () => setPanelFits(el.offsetHeight <= window.innerHeight - 96);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const runningLabel = useMemo(() => {
    const id = timers.runningIds[0];
    if (!id) return null;
    const label = id.startsWith("case:") ? (CASE_STEPS.find((s) => `case:${s.key}` === id)?.label ?? "Case") : (SCRIPT_SECTIONS.find((s) => s.key === id)?.label ?? id);
    return { id, label };
  }, [timers.runningIds]);

  const when = row.date ? `${formatDateLong(row.date)}${row.startTime && row.endTime ? ` · ${formatTimeRange(row.startTime, row.endTime)}` : ""}` : "Started by hand";

  return (
    <div className="space-y-5">
      {confirmDialog}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" onClick={leave} className="-ml-3">
            <ArrowLeft /> All interviews
          </Button>
          <h2 className="text-2xl">{row.name}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {when}
            {row.applicant && (row.applicant.major || row.applicant.year) && ` · ${[row.applicant.major, row.applicant.year].filter(Boolean).join(", ")}`}
            {row.execs.length > 0 && ` · Panel: ${row.execs.map((e) => e.name).join(", ")}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted-foreground" aria-live="polite">
          <Button variant="destructive" size="sm" disabled={resetting} onClick={reset}>
            Reset interview
          </Button>
          {runningLabel && (
            <Badge variant={timeIsUp(runningLabel.id, timers) ? "warn" : "info"}>
              {runningLabel.label} {formatClock(timers.seconds(runningLabel.id))}
              {timeIsUp(runningLabel.id, timers) ? " · Time's up" : ""}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={soundOn}
            aria-label={soundOn ? "Turn the time's-up chime off" : "Turn the time's-up chime on"}
            onClick={toggleSound}
          >
            {soundOn ? <Volume2 /> : <VolumeX />}
            {soundOn ? "Chime on" : "Chime off"}
          </Button>
          <span>
            {status === "saving" ? "Saving notes…" : status === "saved" ? "Notes saved" : status === "error" ? "Notes didn't save" : "Notes save as you type"}
            {session.notesUpdatedBy && status === "idle" ? ` · last edited by ${session.notesUpdatedBy}` : ""}
          </span>
        </div>
      </div>

      <div className="mx-auto grid max-w-[104rem] items-start gap-8 xl:grid-cols-[minmax(0,1fr)_clamp(26rem,34vw,34rem)]">
        <div className="min-w-0 space-y-5">
          <Segmented<ScriptSection["key"]>
            label="Interview step"
            value={section}
            onChange={setSection}
            options={SCRIPT_SECTIONS.map((s) => ({ value: s.key, label: s.label }))}
          />
          {section === "before" && (
            <BeforeSection row={row} behavioralKeys={behavioralKeys} toggleQuestion={toggleQuestion} caseKey={caseKey} setCaseKey={setCaseKey} />
          )}
          {section === "behavioral" && (
            <BehavioralSection keys={behavioralKeys} timers={timers} value={value} onNote={setNote} goBefore={() => setSection("before")} />
          )}
          {section === "research" && (
            <ResearchSection researchKey={researchKey} setResearchKey={setResearchKey} timers={timers} value={value} onNote={setNote} />
          )}
          {section === "case" && <CaseSection caseKey={caseKey} setCaseKey={setCaseKey} timers={timers} value={value} onNote={setNote} />}
          {section === "wrapup" && <WrapUpSection value={value} onNote={setNote} />}
        </div>

        <div ref={panelRef} className={cn(panelFits && "xl:sticky xl:top-4")}>
          <InterviewScorecard
            key={session.id}
            sessionId={session.id}
            applicantName={row.name}
            live={live}
            onSaved={onScoreSaved}
            onSubmitted={poll}
            activeSection={sectionToRubric[section] ?? null}
          />
        </div>
      </div>
    </div>
  );
}
