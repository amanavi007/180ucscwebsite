import { formatOrgDate } from "@/lib/date";
import { pacificInstant } from "../pacing";
import type { ChipVariant } from "../view";
import type { Founder } from "./founders";

/** One company discovery looked at, as the portal shows it. */
export interface CandidateView {
  id: string;
  /** The directory id for the company (its slug). */
  sourceRef: string | null;
  /** The founders the directory lists, so someone adding an email by hand knows who to look for. */
  founders: Founder[];
  company: string;
  website: string | null;
  domain: string;
  outcome: string;
  reason: string | null;
  prospectId: string | null;
  email: string | null;
  emailSourceUrl: string | null;
  createdAt: string;
}

const OUTCOMES: Record<string, { label: string; variant: ChipVariant }> = {
  ready: { label: "Ready", variant: "info" },
  added: { label: "Added", variant: "ok" },
  no_email: { label: "Retrying", variant: "muted" },
  duplicate: { label: "Already known", variant: "muted" },
  unreachable: { label: "Retrying", variant: "warn" },
  no_facts: { label: "Nothing to say", variant: "muted" },
  error: { label: "Retrying", variant: "warn" },
  failed: { label: "Gave up", variant: "muted" },
  retired: { label: "Retired", variant: "muted" },
};

/** The word and color of a candidate's chip. Always a word, never color alone. */
export function outcomeChip(outcome: string): { label: string; variant: ChipVariant } {
  return OUTCOMES[outcome] ?? { label: outcome, variant: "muted" };
}

export const OUTCOME_FILTERS: { key: string; label: string; outcomes: string[] }[] = [
  { key: "all", label: "All", outcomes: [] },
  { key: "ready", label: "Ready", outcomes: ["ready"] },
  { key: "added", label: "Added", outcomes: ["added"] },
  // Everything discovery set aside. Each row's chip says why (Already known, Retrying, Gave up); none of it needs doing by hand.
  { key: "skipped", label: "Skipped", outcomes: ["duplicate", "no_email", "unreachable", "error", "failed", "no_facts", "retired"] },
];

/** Every outcome the database can hold, for counting. */
export const ALL_OUTCOMES = ["ready", "added", "duplicate", "no_email", "unreachable", "no_facts", "error", "failed", "retired"];

// Paging lives in one shared place; re-exported so discovery code keeps its imports.
export { DEFAULT_PAGE_SIZE, PAGE_SIZES, parsePage, parsePageSize } from "@/lib/paging";

/** The database outcomes a filter covers; null means no narrowing (All, or a key we do not know). */
export function outcomesForFilter(key: string): string[] | null {
  const filter = OUTCOME_FILTERS.find((f) => f.key === key);
  return !filter || filter.key === "all" ? null : filter.outcomes;
}

/** How many companies each filter holds, from the count per outcome. */
export function countsByFilter(counts: Record<string, number>): Record<string, number> {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return Object.fromEntries(OUTCOME_FILTERS.map((f) => [f.key, f.key === "all" ? total : f.outcomes.reduce((sum, o) => sum + (counts[o] ?? 0), 0)]));
}

export function filterByOutcome<T extends { outcome: string }>(rows: T[], key: string): T[] {
  const filter = OUTCOME_FILTERS.find((f) => f.key === key);
  if (!filter || filter.key === "all") return rows;
  return rows.filter((r) => filter.outcomes.includes(r.outcome));
}

export interface CandidateSummary {
  addedToday: number;
  lookedAtToday: number;
  addedWeek: number;
  lookedAtWeek: number;
  lastRunAt: Date | null;
}

const DAY_MS = 86_400_000;

/** Today is the Pacific day; the week is the last 7 days. */
export function summarizeCandidates(rows: Pick<CandidateView, "outcome" | "createdAt">[], now: Date): CandidateSummary {
  const startOfToday = pacificInstant(formatOrgDate(now), 0).getTime();
  const weekAgo = now.getTime() - 7 * DAY_MS;
  const summary: CandidateSummary = { addedToday: 0, lookedAtToday: 0, addedWeek: 0, lookedAtWeek: 0, lastRunAt: null };
  for (const r of rows) {
    const at = new Date(r.createdAt);
    const t = at.getTime();
    if (!summary.lastRunAt || t > summary.lastRunAt.getTime()) summary.lastRunAt = at;
    if (t >= weekAgo) {
      summary.lookedAtWeek++;
      if (r.outcome === "added") summary.addedWeek++;
    }
    if (t >= startOfToday) {
      summary.lookedAtToday++;
      if (r.outcome === "added") summary.addedToday++;
    }
  }
  return summary;
}
