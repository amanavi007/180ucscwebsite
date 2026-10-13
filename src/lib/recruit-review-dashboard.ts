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
