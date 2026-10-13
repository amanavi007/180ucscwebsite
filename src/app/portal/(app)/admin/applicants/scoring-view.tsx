"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { Check } from "lucide-react";
import type { ScoringApplicant, StageData } from "@/lib/data/recruit-scoring";
import { STAGES, type Stage } from "@/lib/recruit-scoring";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AnswerKey } from "@/lib/recruit-rubric-levels";
import { ApplicationCard, SECTION_SELECTOR } from "./application-card";
import { isTypingTarget, ScoreForm } from "./score-form";
import { Segmented } from "./segmented";

const fmt = (n: number | null) => (n === null ? "–" : n.toFixed(2));

function OthersPanel({ applicant, disagreeing, stage }: { applicant: ScoringApplicant; disagreeing: boolean; stage: Stage }) {
  if (!applicant.unlocked) {
    return (
      <p className="text-[13px] text-muted-foreground">
        {stage === "resume"
          ? "Other reviewers' scores stay hidden until everyone assigned to this applicant has submitted."
          : "Other reviewers' scores are hidden until you submit yours."}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">All reviewers</span>
        {applicant.visibleSummary && (
          <span className="text-muted-foreground">
            raw {fmt(applicant.visibleSummary.raw)} · adjusted {fmt(applicant.visibleSummary.normalized)} · {applicant.visibleSummary.count} review
            {applicant.visibleSummary.count === 1 ? "" : "s"}
          </span>
        )}
        {disagreeing && <Badge variant="destructive">Reviewers disagree</Badge>}
      </div>
      {applicant.others.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Nobody else has submitted yet.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {applicant.others.map((o) => (
            <li key={o.id} className="space-y-0.5 px-3 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span>{o.reviewerName}</span>
                <span className="tabular-nums">
                  {fmt(o.raw)}
                  {o.wasNormalized && <span className="text-xs text-muted-foreground"> → {fmt(o.normalized)}</span>}
                </span>
              </div>
              {o.comment && <p className="text-[13px] text-muted-foreground">&ldquo;{o.comment}&rdquo;</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QueueFilter({ filter, onChange, todo, all }: { filter: "todo" | "all"; onChange: (f: "todo" | "all") => void; todo: number; all: number }) {
  return (
    <Segmented
      size="sm"
      label="Queue filter"
      value={filter}
      onChange={onChange}
      options={[
        { value: "todo", label: `To score · ${todo}` },
        { value: "all", label: `All · ${all}` },
      ]}
    />
  );
}

function StagePanel({ data }: { data: StageData }) {
  const [filter, setFilter] = useState<"todo" | "all">("todo");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const scored = (a: ScoringApplicant) => !!a.mine?.submitted;
  const todo = data.applicants.filter((a) => !scored(a));
  const list = filter === "todo" ? todo : data.applicants;
  const selected = data.applicants.find((a) => a.id === selectedId) ?? todo[0] ?? data.applicants[0] ?? null;
  const [scoredAnswers, setScoredAnswers] = useState<AnswerKey[]>([]);
  const onScoredAnswers = useCallback((keys: AnswerKey[]) => setScoredAnswers(keys), []);
  const scoredIn: Partial<Record<AnswerKey, string>> = {};
  for (const c of data.rubric.criteria) if (!c.archived && c.answerKey && !scoredIn[c.answerKey]) scoredIn[c.answerKey] = c.name;
  const topRef = useRef<HTMLDivElement>(null);
  const lastSelected = useRef<string | null>(selected?.id ?? null);

  // Opening a different applicant starts at the top of their application.
  useEffect(() => {
    if (!selected || lastSelected.current === selected.id) return;
    lastSelected.current = selected.id;
    topRef.current?.scrollIntoView({ block: "start" });
  }, [selected]);

  // J and K walk the answers, [ and ] walk the queue.
  const onShortcut = useEffectEvent((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
    const key = e.key.toLowerCase();
    if (key === "j" || key === "k") {
      if (data.stage !== "resume") return;
      const sections = [...document.querySelectorAll<HTMLElement>(SECTION_SELECTOR)];
      if (sections.length === 0) return;
      const target =
        key === "j"
          ? sections.find((el) => el.getBoundingClientRect().top > 24)
          : [...sections].reverse().find((el) => el.getBoundingClientRect().top < -24) ?? sections[0];
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      e.preventDefault();
    } else if (key === "[" || key === "]") {
      const at = list.findIndex((a) => a.id === selected?.id);
      const to = list[at + (key === "]" ? 1 : -1)];
      if (to) {
        setSelectedId(to.id);
        e.preventDefault();
      }
    }
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onShortcut(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  function next() {
    const after = data.applicants.filter((a) => !scored(a) && a.id !== selected?.id);
    setSelectedId(after[0]?.id ?? null);
  }

  if (data.applicants.length === 0) {
    return (
      <div className="py-14 text-center">
        <p className="font-medium">{data.stage === "interview" ? "No one to interview-score yet" : "No applicants are assigned to you yet"}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.stage === "interview"
            ? "Applicants show up here once you mark their interview as attended in the Attendance tab."
            : "Import applications, then use Assign reviewers in the Progress view."}
        </p>
      </div>
    );
  }

  const mineCount = data.applicants.length - todo.length;

  return (
    <div className="grid items-start gap-8 xl:grid-cols-[14.5rem_minmax(0,1fr)]">
      {/* Wide screens: the queue is a list on the left. */}
      <aside aria-label="Your queue" className="hidden space-y-3 xl:block">
        <QueueFilter filter={filter} onChange={setFilter} todo={todo.length} all={data.applicants.length} />
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">You&apos;ve scored everyone. Nice work!</p>
        ) : (
          <ul className="max-h-[36rem] space-y-0.5 overflow-y-auto">
            {list.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  aria-current={selected?.id === a.id}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-[current=true]:bg-accent aria-[current=true]:font-semibold aria-[current=true]:text-accent-foreground"
                >
                  <span className="truncate">{a.name}</span>
                  {scored(a) ? (
                    <Check className="size-4 shrink-0 text-primary" aria-label="Scored" />
                  ) : a.mine ? (
                    <span className="text-xs font-medium text-status-warn-foreground">Draft</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="px-3 text-[13px] text-muted-foreground">
          {mineCount} of {data.applicants.length} scored by you
        </p>
      </aside>

      <div className="min-w-0 space-y-5">
        {/* Narrower screens: a compact picker keeps the application and score panel side by side. */}
        <div className="flex flex-wrap items-center gap-3 xl:hidden">
          <QueueFilter filter={filter} onChange={setFilter} todo={todo.length} all={data.applicants.length} />
          {list.length > 0 && selected && (
            <Select value={selected.id} onValueChange={(v) => v && setSelectedId(v)}>
              <SelectTrigger size="sm" className="w-64" aria-label="Applicant">
                <SelectValue>{(value: string) => data.applicants.find((a) => a.id === value)?.name}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {list.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                    {scored(a) ? " · scored" : a.mine ? " · draft" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <span className="text-[13px] text-muted-foreground">
            {mineCount} of {data.applicants.length} scored by you
          </span>
        </div>

        {selected && data.stage === "resume" ? (
          <div ref={topRef} className="grid scroll-mt-4 items-start gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="max-w-[50rem]">
              <ApplicationCard
                key={selected.id}
                name={selected.name}
                email={selected.email}
                application={selected.application}
                applicationLink={selected.applicationLink}
                scoredAnswers={scoredAnswers}
                scoredIn={scoredIn}
              />
            </div>
            <div className="space-y-4 xl:sticky xl:top-4">
              <ScoreForm
                key={`${data.stage}:${selected.id}`}
                stage={data.stage}
                rubric={data.rubric}
                applicant={selected}
                onSubmitted={next}
                onScoredAnswers={onScoredAnswers}
              />
              <OthersPanel applicant={selected} disagreeing={selected.disagree} stage={data.stage} />
            </div>
          </div>
        ) : selected ? (
          <div ref={topRef} className="max-w-xl scroll-mt-4 space-y-4">
            <ScoreForm key={`${data.stage}:${selected.id}`} stage={data.stage} rubric={data.rubric} applicant={selected} onSubmitted={next} />
            <OthersPanel applicant={selected} disagreeing={selected.disagree} stage={data.stage} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">You&apos;ve scored everyone. Nice work!</p>
        )}
      </div>
    </div>
  );
}

export function ScoringView({ stages }: { stages: Record<Stage, StageData> }) {
  const [stage, setStage] = useState<Stage>("resume");
  return (
    <div className="space-y-5">
      <Segmented
        size="sm"
        label="Stage"
        value={stage}
        onChange={setStage}
        options={STAGES.map((s) => ({ value: s.value, label: s.label === "Resume" ? "Applications" : "Interviews" }))}
      />
      {/* Keyed by stage so each stage keeps its own selection and filter. */}
      <StagePanel key={stage} data={stages[stage]} />
    </div>
  );
}
