"use client";

import { useMemo, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import type { ApplicantRow, RecruitCategory, RecruitEvent } from "@/lib/data/recruit";
import type { ApplicantReviewState } from "@/lib/recruit-assignment";
import { combinedTotal, rankByTotal } from "@/lib/recruit";
import { isDisagreement, type StageSummary } from "@/lib/recruit-scoring";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Segmented } from "./segmented";

type Filter = "all" | "engaged" | "none";
type Sort = "points" | "name";

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

export function ApplicantsView({
  rows,
  duplicateCount,
  toMarkCount,
  onReviewDuplicates,
  onReviewAttendance,
  onSelect,
  reviewStatus,
  summaries,
  disagreementThreshold,
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
  onAdd: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("points");

  const scored = useMemo(
    () => rows.map((r) => ({ ...r, total: combinedTotal(r.total, summaries.resume[r.id], summaries.interview[r.id]) })),
    [rows, summaries],
  );
  const max = Math.max(1, ...scored.map((r) => r.total));

  const { visible, noApplication } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (r: ApplicantRow) => {
      const engaged = r.entries.some((e) => !e.voidedAt && e.points > 0);
      if (filter === "engaged" && !engaged) return false;
      if (filter === "none" && engaged) return false;
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
  }, [scored, search, filter, sort]);
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
          <Select value={sort} onValueChange={(v) => v && setSort(v as Sort)}>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue>{(value: string) => (value === "name" ? "Name A–Z" : "Most points")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="points">Most points</SelectItem>
              <SelectItem value="name">Name A–Z</SelectItem>
            </SelectContent>
          </Select>
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
            {visible.map((r) => renderRow(r, sort === "points" ? String(r.rank) : ""))}
          </ul>
        </div>
      )}
      <p className="text-[13px] text-muted-foreground">
        Showing {visible.length} of {applicantCount}. Select a row to see their application, points and notes.
      </p>

      {noApplication.length > 0 && (
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
