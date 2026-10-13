"use client";

import { useState } from "react";
import type { ScoringApplicant, StageData } from "@/lib/data/recruit-scoring";
import type { RecruitSettings } from "@/lib/recruit-settings";
import { STAGES, type Stage } from "@/lib/recruit-scoring";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApplicationCard } from "./application-card";
import { ReviewerInsights } from "./reviewer-insights";
import { ScoreForm } from "./score-form";

const fmt = (n: number | null) => (n === null ? "–" : n.toFixed(2));

function OthersPanel({ applicant, disagreeing, stage }: { applicant: ScoringApplicant; disagreeing: boolean; stage: Stage }) {
  if (!applicant.unlocked) {
    return (
      <p className="text-xs text-muted-foreground">
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
        {disagreeing && <Badge variant="destructive">reviewers disagree</Badge>}
      </div>
      {applicant.others.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nobody else has submitted yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {applicant.others.map((o) => (
            <li key={o.id} className="space-y-0.5 p-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span>{o.reviewerName}</span>
                <span className="tabular-nums">
                  {fmt(o.raw)}
                  {o.wasNormalized && <span className="text-xs text-muted-foreground"> → {fmt(o.normalized)}</span>}
                </span>
              </div>
              {o.comment && <p className="text-xs text-muted-foreground">&ldquo;{o.comment}&rdquo;</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StagePanel({ data, settings }: { data: StageData; settings: RecruitSettings }) {
  const [filter, setFilter] = useState<"todo" | "all">("todo");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const scored = (a: ScoringApplicant) => !!a.mine?.submitted;
  const todo = data.applicants.filter((a) => !scored(a));
  const list = filter === "todo" ? todo : data.applicants;
  const selected = data.applicants.find((a) => a.id === selectedId) ?? todo[0] ?? data.applicants[0] ?? null;

  function next() {
    const after = data.applicants.filter((a) => !scored(a) && a.id !== selected?.id);
    setSelectedId(after[0]?.id ?? null);
  }

  if (data.applicants.length === 0) {
    return (
      <Card className="mt-4">
        <CardContent className="py-10 text-center">
          <p className="font-medium">
            {data.stage === "interview" ? "No one to interview-score yet" : "No applicants are assigned to you yet"}
          </p>
          <p className="text-sm text-muted-foreground">
            {data.stage === "interview"
              ? "Applicants show up here once you mark their interview as attended in the Attendance tab."
              : "Import applications, then use Assign reviewers in the Review progress tab."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const mineCount = data.applicants.length - todo.length;

  return (
    <div className="mt-4 grid items-start gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="text-sm">
          <b>{mineCount}</b> of {data.applicants.length} {data.stage === "resume" ? "assigned to you scored" : "scored by you"}
        </div>
        <div className="flex gap-1.5 text-xs">
          {(["todo", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 ${filter === f ? "bg-foreground text-background" : "bg-muted"}`}
            >
              {f === "todo" ? `To score (${todo.length})` : "Everyone"}
            </button>
          ))}
        </div>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">You&apos;ve scored everyone. Nice work!</p>
        ) : (
          <ul className="max-h-[28rem] divide-y overflow-y-auto rounded-xl border">
            {list.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 ${
                    selected?.id === a.id ? "bg-muted" : ""
                  }`}
                >
                  <span className="truncate">{a.name}</span>
                  {scored(a) ? <Badge variant="secondary">scored</Badge> : a.mine ? <Badge variant="outline">draft</Badge> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="pt-2">
          <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Reviewers</h4>
          <ReviewerInsights reviewers={data.reviewers} minN={settings.normalizeMinN} />
        </div>
      </div>

      <div className="space-y-5">
        {selected && data.stage === "resume" ? (
          <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <ApplicationCard
              key={selected.id}
              name={selected.name}
              email={selected.email}
              application={selected.application}
              applicationLink={selected.applicationLink}
            />
            <div className="space-y-5 xl:sticky xl:top-4">
              <ScoreForm key={`${data.stage}:${selected.id}`} stage={data.stage} rubric={data.rubric} applicant={selected} onSubmitted={next} />
              <OthersPanel applicant={selected} disagreeing={selected.disagree} stage={data.stage} />
            </div>
          </div>
        ) : selected ? (
          <>
            <ScoreForm key={`${data.stage}:${selected.id}`} stage={data.stage} rubric={data.rubric} applicant={selected} onSubmitted={next} />
            <OthersPanel applicant={selected} disagreeing={selected.disagree} stage={data.stage} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Pick an applicant to start scoring.</p>
        )}
      </div>
    </div>
  );
}

export function ScoringView({ stages, settings }: { stages: Record<Stage, StageData>; settings: RecruitSettings }) {
  const [stage, setStage] = useState<Stage>("resume");
  return (
    <div className="mt-4">
      <Tabs value={stage} onValueChange={(v) => v && setStage(v as Stage)}>
        <TabsList>
          {STAGES.map((s) => (
            <TabsTrigger key={s.value} value={s.value}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {/* Keyed by stage so each stage keeps its own selection and filter. */}
      <StagePanel key={stage} data={stages[stage]} settings={settings} />
    </div>
  );
}
