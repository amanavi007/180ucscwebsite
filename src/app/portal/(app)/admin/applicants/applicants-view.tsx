"use client";

import { Fragment, useMemo, useState } from "react";
import { Copy, ListFilter, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { ApplicantRow, RecruitCategory, RecruitEvent } from "@/lib/data/recruit";
import type { ApplicantReviewState } from "@/lib/recruit-assignment";
import { combinedTotal, meetsCutoff, pickAboveCutoff, rankByTotal } from "@/lib/recruit";
import { isValidUcscEmail } from "@/lib/coffee-chat";
import { isDisagreement, type StageSummary } from "@/lib/recruit-scoring";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/filter-chip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CutoffBar } from "./interview-cutoff";
import { Segmented } from "./segmented";

type Filter = "all" | "engaged" | "none";
type Sort = "points" | "name";
/** Where someone is in the interview process. Narrows the list like the other filters. */
type Stage = "above" | "notInvited" | "invitedNotBooked" | "booked";

const GRID = "grid-cols-[3rem_minmax(0,1.7fr)_9.5rem_minmax(0,1.3fr)_14rem]";

type ReviewChip = { text: string; variant: "ok" | "warn" | "bad" | "muted" };

/** How an applicant's reviews are going, as a chip with a word. */
function reviewLabel(state: ApplicantReviewState | undefined, hasApplication: boolean): ReviewChip {
  if (!hasApplication) return { text: "Not reviewed", variant: "muted" };
  if (!state || state.status === "unassigned") return { text: "No reviewer", variant: "bad" };
  if (state.status === "not-started") return { text: "Not started", variant: "muted" };
  if (state.status === "revealed") return { text: "Revealed", variant: "ok" };
  if (state.status === "complete") return { text: "All in", variant: "ok" };
  return { text: `${state.submitted} of ${state.assigned} in`, variant: "warn" };
}

/** Divider row between those at or above the cutoff and everyone below. A word, not just a color. */
function CutoffLine({ cutoff, above }: { cutoff: number | null; above: number }) {
  return (
    <li role="separator" aria-label={`Interview cutoff ${cutoff}`} className="flex items-center gap-3 border-b border-dashed border-foreground bg-accent px-5 py-1.5">
      <span className="text-[13px] font-semibold text-accent-foreground tabular-nums">
        Interview cutoff: {cutoff} · {above} at or above
      </span>
    </li>
  );
}

export function ApplicantsView({
  quarterId,
  rows,
  duplicateCount,
  toMarkCount,
  onReviewDuplicates,
  onReviewAttendance,
  onSelect,
  reviewStatus,
  summaries,
  disagreementThreshold,
  interviewCutoff,
  invitedEmails,
  bookedEmails,
  onAdd,
}: {
  quarterId: string;
  rows: ApplicantRow[];
  categories: RecruitCategory[];
  events: RecruitEvent[];
  duplicateCount: number;
  toMarkCount: number;
  onReviewDuplicates: () => void;
  onReviewAttendance: () => void;
  onSelect: (id: string) => void;
  reviewStatus: Record<string, ApplicantReviewState>;
  /** Adjusted review scores per stage; the rank counts them on top of points. */
  summaries: Record<"resume" | "interview", Record<string, StageSummary>>;
  disagreementThreshold: number;
  interviewCutoff: number | null;
  /** Lowercased emails already on the interview invite list. */
  invitedEmails: string[];
  /** Lowercased emails with a confirmed interview booking. */
  bookedEmails: string[];
  onAdd: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("points");
  const [stage, setStage] = useState<Stage | null>(null);

  const scored = useMemo(
    () => rows.map((r) => ({ ...r, total: combinedTotal(r.total, summaries.resume[r.id], summaries.interview[r.id]) })),
    [rows, summaries],
  );
  const max = Math.max(1, ...scored.map((r) => r.total));
  const invited = useMemo(() => new Set(invitedEmails), [invitedEmails]);
  const booked = useMemo(() => new Set(bookedEmails), [bookedEmails]);

  const inStage = (r: { email: string | null; total: number }, which: Stage) => {
    const email = (r.email ?? "").trim().toLowerCase();
    const isInvited = invited.has(email);
    const isBooked = booked.has(email);
    if (which === "above") return meetsCutoff(r.total, interviewCutoff);
    if (which === "notInvited") return meetsCutoff(r.total, interviewCutoff) && !isInvited;
    if (which === "booked") return isBooked;
    return isInvited && !isBooked;
  };
  const stageCounts = useMemo(() => {
    const counts: Record<Stage, number> = { above: 0, notInvited: 0, invitedNotBooked: 0, booked: 0 };
    for (const r of scored) {
      if (!r.hasApplication) continue;
      for (const k of Object.keys(counts) as Stage[]) if (inStage(r, k)) counts[k]++;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scored, invited, booked, interviewCutoff]);

  const { visible, noApplication } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (r: ApplicantRow) => {
      const engaged = r.entries.some((e) => !e.voidedAt && e.points > 0);
      if (filter === "engaged" && !engaged) return false;
      if (filter === "none" && engaged) return false;
      if (stage && !inStage(r, stage)) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || (r.email ?? "").includes(q) || r.aliases.some((a) => a.includes(q));
    };
    const filtered = scored.filter((r) => r.hasApplication && matches(r));
    return {
      visible:
        sort === "points"
          ? rankByTotal(filtered)
          : [...filtered].sort((a, b) => a.name.localeCompare(b.name)).map((r) => ({ ...r, rank: 0 })),
      noApplication: scored.filter((r) => !r.hasApplication && matches(r)).sort((a, b) => a.name.localeCompare(b.name)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scored, search, filter, sort, stage, invited, booked, interviewCutoff]);
  const cutoffStats = useMemo(() => {
    const { eligible, noEmail } = pickAboveCutoff(scored, interviewCutoff, (e) => isValidUcscEmail(e.trim().toLowerCase()));
    const alreadyInvited = eligible.filter((r) => invited.has(r.email.trim().toLowerCase())).length;
    return {
      above: eligible.length + noEmail.length,
      alreadyInvited,
      newInvites: eligible.length - alreadyInvited,
      noEmail: noEmail.length,
    };
  }, [scored, interviewCutoff, invited]);
  // The line only means something in the full ranking, so it hides while the list is sorted by name or narrowed.
  const showLine = interviewCutoff !== null && sort === "points" && filter === "all" && stage === null && search.trim() === "";
  const lineIndex = showLine ? visible.findIndex((r) => !meetsCutoff(r.total, interviewCutoff)) : -1;
  // Emails of whoever is on screen, so a filtered list can go straight into a reminder.
  const emails = useMemo(
    () => [...new Set(visible.map((r) => (r.email ?? "").trim().toLowerCase()).filter(Boolean))],
    [visible],
  );
  async function copyEmails() {
    try {
      await navigator.clipboard.writeText(emails.join(", "));
      toast.success(`Copied ${emails.length} ${emails.length === 1 ? "email" : "emails"}.`);
    } catch {
      toast.error("Couldn't copy. Select the emails by hand instead.");
    }
  }
  const activeFilters = (filter !== "all" ? 1 : 0) + (stage ? 1 : 0);
  const applicantCount = rows.filter((r) => r.hasApplication).length;

  function renderRow(r: ApplicantRow, rankLabel: string) {
    const resume = summaries.resume[r.id];
    const interview = summaries.interview[r.id];
    const disagree = [resume, interview].some((x) => x && isDisagreement(x, disagreementThreshold));
    const came = [...new Set(r.entries.filter((e) => !e.voidedAt).map((e) => e.categoryName))];
              const review = reviewLabel(reviewStatus[r.id], r.hasApplication);
              return (
    <li key={r.id} className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => onSelect(r.id)}
        className={`grid w-full ${GRID} items-center gap-4 px-5 py-3 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/50`}
      >
        <span className="text-sm text-muted-foreground tabular-nums">{rankLabel}</span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium">{r.name}</span>
            {r.hasPrevious && <Badge variant="secondary">Previously applied</Badge>}
            {!r.email && <Badge variant="outline">No email yet</Badge>}
            {r.email && booked.has(r.email.trim().toLowerCase()) ? (
              <Badge variant="ok">Booked</Badge>
            ) : (
              r.email && invited.has(r.email.trim().toLowerCase()) && <Badge variant="info">Invited</Badge>
            )}
          </span>
          <span className="block truncate text-[13px] text-muted-foreground">{r.email}</span>
        </span>
        <span className="flex items-center gap-2.5">
          <span className="w-10 text-sm font-semibold tabular-nums">{r.total}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span
              className="block h-full bg-foreground"
              style={{ width: `${Math.max(0, Math.min(100, (r.total / max) * 100))}%` }}
            />
          </span>
        </span>
        <span className="truncate text-[13px] text-foreground/80">{came.length > 0 ? came.join(", ") : "Nothing yet"}</span>
        <span className="flex flex-wrap items-center gap-2 text-[13px] text-foreground/80">
          <Badge variant={review.variant}>{review.text}</Badge>
          {resume && <span className="tabular-nums" title="Adjusted resume score">R {resume.normalized.toFixed(1)}</span>}
          {interview && <span className="tabular-nums" title="Adjusted interview score">I {interview.normalized.toFixed(1)}</span>}
          {disagree && <Badge variant="destructive">Reviewers disagree</Badge>}
        </span>
      </button>
    </li>
              );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <UserPlus className="size-8 text-muted-foreground" />
        <div>
          <p className="font-medium">No applicants yet this quarter</p>
          <p className="text-sm text-muted-foreground">
            Import the application spreadsheet, or add the first person by hand. Applicants are also created as you give points.
          </p>
        </div>
        <Button onClick={onAdd}>Add one person</Button>
      </div>
    );
  }

  const needsYou = [
    toMarkCount > 0 && { label: `${toMarkCount} booking${toMarkCount === 1 ? "" : "s"} to mark`, onClick: onReviewAttendance },
    duplicateCount > 0 && { label: `${duplicateCount} possible duplicate${duplicateCount === 1 ? "" : "s"}`, onClick: onReviewDuplicates },
  ].filter((x): x is { label: string; onClick: () => void } => !!x);

  return (
    <section aria-label="Applicant list" className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label="Search applicants"
              placeholder="Search name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-72 pl-9"
            />
          </div>
          <Select value={sort} onValueChange={(v) => v && setSort(v as Sort)}>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue>{(value: string) => (value === "name" ? "Name A–Z" : "Most points")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="points">Most points</SelectItem>
              <SelectItem value="name">Name A–Z</SelectItem>
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger render={<Button variant="outline" size="sm" />}>
              <ListFilter />
              Filters
              {activeFilters > 0 && <span className="tabular-nums">({activeFilters})</span>}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 gap-4 p-4">
              <div className="space-y-2">
                <p className="text-[13px] font-medium text-muted-foreground">Points</p>
                <Segmented
                  label="Filter applicants"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: "all", label: "All" },
                    { value: "engaged", label: "Has points" },
                    { value: "none", label: "No points yet" },
                  ]}
                />
              </div>
              <div className="space-y-2">
                <p className="text-[13px] font-medium text-muted-foreground">Interview stage</p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Interview stage">
                  <FilterChip selected={stage === "above"} onClick={() => setStage(stage === "above" ? null : "above")} count={stageCounts.above}>
                    Above cutoff
                  </FilterChip>
                  <FilterChip selected={stage === "notInvited"} onClick={() => setStage(stage === "notInvited" ? null : "notInvited")} count={stageCounts.notInvited}>
                    Not invited yet
                  </FilterChip>
                  <FilterChip
                    selected={stage === "invitedNotBooked"}
                    onClick={() => setStage(stage === "invitedNotBooked" ? null : "invitedNotBooked")}
                    count={stageCounts.invitedNotBooked}
                  >
                    Invited, not booked
                  </FilterChip>
                  <FilterChip selected={stage === "booked"} onClick={() => setStage(stage === "booked" ? null : "booked")} count={stageCounts.booked}>
                    Booked
                  </FilterChip>
                </div>
              </div>
              {activeFilters > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start text-link"
                  onClick={() => {
                    setFilter("all");
                    setStage(null);
                  }}
                >
                  Clear filters
                </Button>
              )}
            </PopoverContent>
          </Popover>
          {stage && (
            <Button variant="outline" size="sm" onClick={copyEmails} disabled={emails.length === 0}>
              <Copy />
              Copy {emails.length} {emails.length === 1 ? "email" : "emails"}
            </Button>
          )}
        </div>
        {needsYou.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Needs you:{" "}
            {needsYou.map((n, i) => (
              <span key={n.label}>
                {i > 0 && <span aria-hidden="true"> · </span>}
                <button type="button" onClick={n.onClick} className="font-medium text-link underline-offset-2 hover:underline">
                  {n.label}
                </button>
              </span>
            ))}
          </p>
        )}
      </div>

      <CutoffBar
        quarterId={quarterId}
        cutoff={interviewCutoff}
        aboveCount={cutoffStats.above}
        newInviteCount={cutoffStats.newInvites}
        alreadyInvitedCount={cutoffStats.alreadyInvited}
        noEmailCount={cutoffStats.noEmail}
      />

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No one matches that.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className={`grid ${GRID} items-center gap-4 border-b px-5 py-3 text-[13px] font-medium text-muted-foreground`}>
            <span>#</span>
            <span>Applicant</span>
            <span>Points</span>
            <span>Came to</span>
            <span>Reviews</span>
          </div>
          <ul>
            {visible.map((r, i) => (
              <Fragment key={r.id}>
                {showLine && i === lineIndex && <CutoffLine cutoff={interviewCutoff} above={i} />}
                {renderRow(r, sort === "points" ? String(r.rank) : "")}
              </Fragment>
            ))}
            {showLine && lineIndex === -1 && <CutoffLine cutoff={interviewCutoff} above={visible.length} />}
          </ul>
        </div>
      )}
      <p className="text-[13px] text-muted-foreground">
        Showing {visible.length} of {applicantCount}. Select a row to see their application, points and notes.
      </p>

      {!stage && noApplication.length > 0 && (
        <details className="overflow-hidden rounded-xl border bg-card">
          <summary className="cursor-pointer px-5 py-3 text-sm font-medium">
            No application submitted ({noApplication.length})
          </summary>
          <p className="border-t px-5 py-3 text-[13px] text-muted-foreground">
            These people are in the system from attendance or points but didn&apos;t submit the form. They aren&apos;t applicants and aren&apos;t reviewed.
          </p>
          <ul>{noApplication.map((r) => renderRow(r, ""))}</ul>
        </details>
      )}
    </section>
  );
}
