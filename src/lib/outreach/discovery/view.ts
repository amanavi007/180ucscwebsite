import { formatOrgDate } from "@/lib/date";
import { pacificInstant } from "../pacing";
import type { ChipVariant } from "../view";

/** One company discovery looked at, as the portal shows it. */
export interface CandidateView {
  id: string;
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
  added: { label: "Added", variant: "ok" },
  no_email: { label: "No email", variant: "muted" },
  duplicate: { label: "Already known", variant: "muted" },
  unreachable: { label: "Couldn't reach", variant: "warn" },
  no_facts: { label: "Nothing to say", variant: "warn" },
  error: { label: "Error", variant: "bad" },
};

/** The word and color of a candidate's chip. Always a word, never color alone. */
export function outcomeChip(outcome: string): { label: string; variant: ChipVariant } {
  return OUTCOMES[outcome] ?? { label: outcome, variant: "muted" };
}

export const OUTCOME_FILTERS: { key: string; label: string; outcomes: string[] }[] = [
  { key: "all", label: "All", outcomes: [] },
  { key: "added", label: "Added", outcomes: ["added"] },
  { key: "no_email", label: "No email", outcomes: ["no_email"] },
  { key: "duplicate", label: "Already known", outcomes: ["duplicate"] },
  { key: "problems", label: "Problems", outcomes: ["unreachable", "no_facts", "error"] },
];

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
