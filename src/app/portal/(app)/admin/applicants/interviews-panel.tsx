"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { startInterviewSessionAction } from "@/actions/interview-session";
import type { InterviewRow, InterviewWorkspace } from "@/lib/data/interview-sessions";
import { RUBRIC_TOTAL, totalScore } from "@/lib/interview-guide";
import { formatDateLong } from "@/lib/date";
import { formatTimeRange } from "@/lib/coffee-chat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/filter-chip";
import { useUrlParam } from "@/components/url-tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InterviewWorkspace as Workspace } from "./interview-workspace";

type MyState = "todo" | "draft" | "scored";

function myState(row: InterviewRow): MyState {
  const s = row.session;
  if (s?.scoredAt) return "scored";
  // Just opening an interview isn't progress: it counts once something has been picked, written or scored.
  const started =
    !!s &&
    (s.behavioralKeys.length > 0 ||
      !!s.researchKey ||
      !!s.caseKey ||
      Object.keys(s.scores).length > 0 ||
      Object.values(s.notes).some((n) => n.trim() !== ""));
  return started ? "draft" : "todo";
}

const STATE_CHIP: Record<MyState, { label: string; variant: "muted" | "warn" | "ok" }> = {
  todo: { label: "Not started", variant: "muted" },
  draft: { label: "In progress", variant: "warn" },
  scored: { label: "Scored", variant: "ok" },
};

function groupRows(rows: InterviewRow[], today: string): { title: string; rows: InterviewRow[] }[] {
  const when = (r: InterviewRow) => `${r.date ?? "9999-12-31"} ${r.startTime ?? ""}`;
  const dated = rows.filter((r) => r.date);
  const todayRows = dated.filter((r) => r.date === today).sort((a, b) => when(a).localeCompare(when(b)));
  const upcoming = dated.filter((r) => (r.date as string) > today).sort((a, b) => when(a).localeCompare(when(b)));
  const earlier = dated.filter((r) => (r.date as string) < today).sort((a, b) => when(b).localeCompare(when(a)));
  const byHand = rows.filter((r) => !r.date);
  return [
    { title: "Today", rows: todayRows },
    { title: "Upcoming", rows: upcoming },
    { title: "Earlier", rows: earlier },
    { title: "Started by hand", rows: byHand },
  ].filter((g) => g.rows.length > 0);
}

function InterviewListRow({ row, onOpen }: { row: InterviewRow; onOpen: () => void }) {
  const state = STATE_CHIP[myState(row)];
  const scored = row.session?.scoredAt ? row.session : null;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <span className="w-44 shrink-0 text-[0.9375rem] font-bold tabular-nums">
          {row.date ? (
            <>
              <span className="block text-[13px] font-normal text-muted-foreground">{formatDateLong(row.date)}</span>
              {row.startTime && row.endTime ? formatTimeRange(row.startTime, row.endTime) : ""}
            </>
          ) : (
            "No time set"
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{row.name}</span>
          <span className="block truncate text-[13px] text-muted-foreground">
            {row.execs.length > 0 ? `With ${row.execs.map((e) => e.name).join(", ")}` : (row.email ?? "")}
          </span>
        </span>
        <span className="flex items-center gap-2">
          {!row.applicant && <Badge variant="bad">Not in applicants</Badge>}
          {row.mine && <Badge variant="info">Yours</Badge>}
          {scored && (
            <span className="text-sm tabular-nums text-muted-foreground">
              {totalScore(scored.scores)}/{RUBRIC_TOTAL}
            </span>
          )}
          <Badge variant={state.variant}>{state.label}</Badge>
        </span>
      </button>
    </li>
  );
}

export function InterviewsPanel({ workspace }: { workspace: InterviewWorkspace }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const mineRows = workspace.rows.filter((r) => r.mine);
  const [scope, setScope] = useState<"mine" | "all">(mineRows.length > 0 ? "mine" : "all");
  // The open interview lives in the URL, so a reload lands back inside it.
  const [openKey, setOpenKey] = useUrlParam("interview");
  const [starting, setStarting] = useState(false);
  const [manualId, setManualId] = useState<string | null>(null);

  const rows = scope === "mine" ? mineRows : workspace.rows;
  const open = workspace.rows.find((r) => r.key === openKey) ?? null;

  function start(input: { bookingId?: string; applicantId?: string }, key: string) {
    setStarting(true);
    startTransition(async () => {
      const result = await startInterviewSessionAction(input);
      if (result.error) {
        setStarting(false);
        toast.error(result.error);
        return;
      }
      setOpenKey(key);
      router.refresh();
    });
  }

  function openRow(row: InterviewRow) {
    if (row.session) {
      setOpenKey(row.key);
      return;
    }
    start(row.bookingId ? { bookingId: row.bookingId } : { applicantId: row.applicant?.id }, row.key);
  }

  if (open?.session) {
    return <Workspace key={open.session.id} row={open} session={open.session} onBack={() => setOpenKey(null)} />;
  }
  if (openKey && starting) return <p className="py-14 text-center text-sm text-muted-foreground">Setting up the interview…</p>;

  const groups = groupRows(rows, workspace.today);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Whose interviews" className="flex gap-1.5">
          <FilterChip selected={scope === "mine"} onClick={() => setScope("mine")} count={mineRows.length}>
            Mine
          </FilterChip>
          <FilterChip selected={scope === "all"} onClick={() => setScope("all")} count={workspace.rows.length}>
            Everyone
          </FilterChip>
        </div>
        <span className="text-[13px] text-muted-foreground">
          {scope === "mine" ? "Interviews where you are on the panel." : "Every booked interview."} Open one to see the script, take notes and score.
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-[22px] border bg-card py-14 text-center">
          <p className="font-medium">{scope === "mine" ? "No interviews are assigned to you" : "No interviews are booked yet"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {scope === "mine"
              ? "Switch to Everyone to open someone else's, or start one by hand below."
              : "Booked slots show up here. You can also start one by hand below."}
          </p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.title} className="space-y-2">
            <h3 className="px-1 text-[13px] font-semibold tracking-wide text-muted-foreground">{g.title}</h3>
            <ul className="divide-y overflow-hidden rounded-[22px] border bg-card">
              {g.rows.map((r) => (
                <InterviewListRow key={r.key} row={r} onOpen={() => openRow(r)} />
              ))}
            </ul>
          </section>
        ))
      )}

      <section className="space-y-3 rounded-[22px] border bg-card p-5">
        <div>
          <h3 className="text-base font-semibold">Start one by hand</h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">For an interview that wasn&apos;t booked through a slot, or one that isn&apos;t listed above.</p>
        </div>
        {workspace.pickable.length === 0 ? (
          <p className="text-sm text-muted-foreground">Everyone in this quarter&apos;s applicants already has an interview listed.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Select value={manualId} onValueChange={(v) => setManualId(v)}>
              <SelectTrigger className="w-72" aria-label="Applicant">
                <SelectValue placeholder="Choose an applicant">{(value: string) => workspace.pickable.find((a) => a.id === value)?.name}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {workspace.pickable.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" disabled={!manualId || isPending} onClick={() => manualId && start({ applicantId: manualId }, manualId)}>
              Open interview
            </Button>
            {!manualId && <span className="text-[13px] text-muted-foreground">Choose an applicant first.</span>}
          </div>
        )}
      </section>
    </div>
  );
}
