import { reviewState, type ApplicantReviewState } from "@/lib/recruit-assignment";
import { isDisagreement, type StageSummary } from "@/lib/recruit-scoring";

export interface DashboardInput {
  applicants: { id: string; name: string; email: string | null }[];
  reviewerNames: Map<string, string>;
  assignments: { applicantId: string; reviewerId: string }[];
  /** applicantId -> reviewerIds who have submitted. */
  submitted: Map<string, Set<string>>;
  revealed: Set<string>;
  summaries: Record<string, StageSummary>;
  disagreementThreshold: number;
}

export interface DashboardApplicant {
  id: string;
  name: string;
  email: string | null;
  state: ApplicantReviewState;
  reviewers: { id: string; name: string; submitted: boolean }[];
  raw: number | null;
  normalized: number | null;
  disagree: boolean;
}

export interface DashboardReviewer {
  id: string;
  name: string;
  assigned: number;
  done: number;
}

export interface ReviewDashboard {
  applicants: DashboardApplicant[];
  reviewers: DashboardReviewer[];
  totals: { applicants: number; complete: number; unassigned: number };
}

export function buildReviewDashboard(input: DashboardInput): ReviewDashboard {
  const assignedBy = new Map<string, string[]>();
  for (const a of input.assignments) assignedBy.set(a.applicantId, [...(assignedBy.get(a.applicantId) ?? []), a.reviewerId]);
  const nameOf = (id: string) => input.reviewerNames.get(id) ?? "Unknown";
  const live = new Set(input.applicants.map((a) => a.id));

  const applicants: DashboardApplicant[] = input.applicants.map((a) => {
    const assigned = assignedBy.get(a.id) ?? [];
    const done = input.submitted.get(a.id) ?? new Set<string>();
    const state = reviewState(assigned, [...done], input.revealed.has(a.id));
    // Scores are only ever exposed once the applicant is unlocked.
    const summary = state.unlocked ? (input.summaries[a.id] ?? null) : null;
    return {
      id: a.id,
      name: a.name,
      email: a.email,
      state,
      reviewers: assigned.map((id) => ({ id, name: nameOf(id), submitted: done.has(id) })),
      raw: summary?.raw ?? null,
      normalized: summary?.normalized ?? null,
      disagree: summary ? isDisagreement(summary, input.disagreementThreshold) : false,
    };
  });

  const progress = new Map<string, { assigned: number; done: number }>();
  for (const a of input.assignments) {
    if (!live.has(a.applicantId)) continue;
    const p = progress.get(a.reviewerId) ?? { assigned: 0, done: 0 };
    p.assigned++;
    if (input.submitted.get(a.applicantId)?.has(a.reviewerId)) p.done++;
    progress.set(a.reviewerId, p);
  }
  const reviewers = [...progress].map(([id, p]) => ({ id, name: nameOf(id), ...p })).sort((x, y) => x.name.localeCompare(y.name));

  return {
    applicants,
    reviewers,
    totals: {
      applicants: applicants.length,
      complete: applicants.filter((a) => a.state.status === "complete").length,
      unassigned: applicants.filter((a) => a.state.status === "unassigned").length,
    },
  };
}

export type DashboardFilter = "all" | "needs" | "in-progress" | "complete";

export const STATUS_LABELS: Record<ApplicantReviewState["status"], string> = {
  unassigned: "Needs reviewers",
  "not-started": "Not started",
  "in-progress": "In progress",
  complete: "Complete",
  revealed: "Revealed",
};

const FILTER_STATUSES: Record<Exclude<DashboardFilter, "all">, ApplicantReviewState["status"][]> = {
  needs: ["unassigned"],
  "in-progress": ["not-started", "in-progress"],
  complete: ["complete", "revealed"],
};

export function filterDashboardApplicants(applicants: DashboardApplicant[], filter: DashboardFilter, query: string): DashboardApplicant[] {
  const q = query.trim().toLowerCase();
  return applicants.filter((a) => {
    if (filter !== "all" && !FILTER_STATUSES[filter].includes(a.state.status)) return false;
    return !q || a.name.toLowerCase().includes(q) || (a.email ?? "").toLowerCase().includes(q);
  });
}

/** Scores are only on the applicant when unlocked, so a locked applicant exports blank score cells. */
export function dashboardCsv(applicants: DashboardApplicant[]): { headers: string[]; rows: (string | number)[][] } {
  return {
    headers: ["Applicant", "Email", "Status", "Reviewers submitted", "Reviewers assigned", "Raw", "Adjusted", "Disagree"],
    rows: applicants.map((a) => [
      a.name,
      a.email ?? "",
      STATUS_LABELS[a.state.status],
      a.state.submitted,
      a.state.assigned,
      a.raw === null ? "" : a.raw.toFixed(2),
      a.normalized === null ? "" : a.normalized.toFixed(2),
      a.disagree ? "yes" : "no",
    ]),
  };
}
