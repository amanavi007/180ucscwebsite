import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/paginate";
import { getRecruitSettings } from "@/lib/data/recruit-settings";
import { getReviewContext, type ApplicationAnswers, type ReviewerProfile } from "@/lib/data/recruit-review";
import type { AnswerKey } from "@/lib/recruit-rubric-levels";
import { resumeVisibility, reviewState } from "@/lib/recruit-assignment";
import { buildReviewDashboard, type ReviewDashboard } from "@/lib/recruit-review-dashboard";
import type { ReviewSettings } from "@/lib/recruit-review-settings";
import type { RecruitSettings } from "@/lib/recruit-settings";
import {
  isDisagreement,
  maskReviewerInsights,
  normalizeReviews,
  reviewerInsights,
  reviewScore,
  summarizeApplicants,
  visibleReviews,
  type MaskedReviewerInsight,
  type ReviewInput,
  type Stage,
  type StageSummary,
} from "@/lib/recruit-scoring";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface CriterionRow {
  id: string;
  stage: Stage;
  name: string;
  description: string;
  answerKey: AnswerKey | null;
  weight: number;
  sortOrder: number;
  archived: boolean;
}

export interface RubricRow {
  id: string;
  stage: Stage;
  scaleMin: number;
  scaleMax: number;
  criteria: CriterionRow[];
}

export async function getRubrics(): Promise<Record<Stage, RubricRow>> {
  const supabase = await createClient();
  const [{ data: rubrics, error }, { data: criteria, error: criteriaError }] = await Promise.all([
    supabase.from("recruit_rubrics").select("*"),
    supabase.from("recruit_rubric_criteria").select("*").order("sort_order").order("created_at"),
  ]);
  if (error) throw error;
  if (criteriaError) throw criteriaError;

  const build = (stage: Stage): RubricRow => {
    const rubric = (rubrics ?? []).find((r) => r.stage === stage);
    if (!rubric) throw new Error(`Missing ${stage} rubric. Has the scoring migration been applied?`);
    return {
      id: rubric.id,
      stage,
      scaleMin: Number(rubric.scale_min),
      scaleMax: Number(rubric.scale_max),
      criteria: (criteria ?? [])
        .filter((c) => c.rubric_id === rubric.id)
        .map((c) => ({
          id: c.id,
          stage,
          name: c.name,
          description: c.description,
          answerKey: c.answer_key,
          weight: Number(c.weight),
          sortOrder: c.sort_order,
          archived: c.archived_at !== null,
        })),
    };
  };
  return { resume: build("resume"), interview: build("interview") };
}

export interface ReviewView {
  id: string;
  reviewerId: string;
  reviewerName: string;
  submitted: boolean;
  raw: number | null;
  normalized: number | null;
  wasNormalized: boolean;
  comment: string;
  scores: Record<string, number>;
  mine: boolean;
}

export interface ScoringApplicant {
  id: string;
  name: string;
  email: string | null;
  applicationLink: string | null;
  mine: ReviewView | null;
  others: ReviewView[];
  /** Aggregate shown only once the applicant is unlocked for this viewer (blind scoring). */
  visibleSummary: StageSummary | null;
  disagree: boolean;
  application: ApplicationAnswers | null;
  /** True when the viewer may see other reviewers' scores for this applicant. */
  unlocked: boolean;
}

export interface ReviewerInsightRow extends MaskedReviewerInsight {
  name: string;
}

export interface StageData {
  stage: Stage;
  rubric: RubricRow;
  applicants: ScoringApplicant[];
  reviewers: ReviewerInsightRow[];
}

export interface ScoringBundle {
  stages: Record<Stage, StageData>;
  /** Un-blinded aggregates for the decision view and the side panel. */
  summaries: Record<Stage, Record<string, StageSummary>>;
  settings: RecruitSettings;
  dashboard: ReviewDashboard;
  reviewSetup: {
    settings: ReviewSettings;
    /** Every active exec; `pool` is the subset currently allowed to review. */
    execs: ReviewerProfile[];
    pool: ReviewerProfile[];
    detail: Record<string, { assigned: string[]; conflicts: string[] }>;
  };
}

const CHUNK = 100;

async function chunked<R>(ids: string[], load: (chunk: string[]) => Promise<R[]>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await load(ids.slice(i, i + CHUNK))));
  return out;
}

async function profileNames(supabase: Supabase, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from("profiles").select("id, name").in("id", ids);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id, p.name]));
}

export async function getScoringBundle(quarterId: string, viewerId: string): Promise<ScoringBundle> {
  const supabase = await createClient();
  const [rubrics, settings, everyone, links] = await Promise.all([
    getRubrics(),
    getRecruitSettings(),
    fetchAllPages((from, to) =>
      supabase
        .from("recruit_applicants")
        .select("id, name, email, application_link")
        .eq("quarter_id", quarterId)
        .is("archived_at", null)
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("recruit_booking_links")
        .select("applicant_id")
        .eq("booking_kind", "interview")
        .eq("status", "attended")
        .order("id")
        .range(from, to),
    ),
  ]);

  const review = await getReviewContext(everyone.map((a) => a.id));
  // Only people who submitted the application form are reviewed; anyone else (event imports, manual adds) is left out.
  const applicants = everyone.filter((a) => review.answers.has(a.id));
  const applicantIds = applicants.map((a) => a.id);
  const interviewed = new Set(links.map((l) => l.applicant_id));

  const reviews = await chunked(applicantIds, (chunk) =>
    fetchAllPages((from, to) =>
      supabase.from("recruit_reviews").select("*").in("applicant_id", chunk).order("id").range(from, to),
    ),
  );
  const scoreRows = await chunked(
    reviews.map((r) => r.id),
    (chunk) =>
      fetchAllPages((from, to) =>
        supabase.from("recruit_review_scores").select("*").in("review_id", chunk).order("id").range(from, to),
      ),
  );
  const names = await profileNames(supabase, [
    ...new Set([...reviews.map((r) => r.reviewer_id), ...review.pool.map((p) => p.id), ...review.assignments.map((a) => a.reviewerId)]),
  ]);

  const submittedResume = new Map<string, Set<string>>();
  for (const r of reviews) {
    if (r.stage !== "resume" || r.submitted_at === null) continue;
    submittedResume.set(r.applicant_id, (submittedResume.get(r.applicant_id) ?? new Set()).add(r.reviewer_id));
  }
  const stateOf = (applicantId: string) =>
    reviewState(
      review.assignedByApplicant.get(applicantId) ?? [],
      [...(submittedResume.get(applicantId) ?? [])],
      review.revealed.has(applicantId),
    );

  const scoresByReview = new Map<string, { criterionId: string; score: number }[]>();
  for (const s of scoreRows) {
    scoresByReview.set(s.review_id, [
      ...(scoresByReview.get(s.review_id) ?? []),
      { criterionId: s.criterion_id, score: Number(s.score) },
    ]);
  }

  const build = (stage: Stage): { data: StageData; summary: Record<string, StageSummary> } => {
    const rubric = rubrics[stage];
    const weighted = rubric.criteria.map((c) => ({ id: c.id, weight: c.weight }));
    const stageReviews = reviews.filter((r) => r.stage === stage);

    const rawById = new Map<string, number | null>(
      stageReviews.map((r) => [r.id, reviewScore(scoresByReview.get(r.id) ?? [], weighted)]),
    );
    const submittedInputs: ReviewInput[] = stageReviews
      .filter((r) => r.submitted_at !== null && rawById.get(r.id) !== null)
      .map((r) => ({ id: r.id, applicantId: r.applicant_id, reviewerId: r.reviewer_id, raw: rawById.get(r.id)! }));

    const normalized = normalizeReviews(submittedInputs, {
      minN: settings.normalizeMinN,
      scaleMin: rubric.scaleMin,
      scaleMax: rubric.scaleMax,
    });
    const normById = new Map(normalized.map((n) => [n.id, n]));
    const summary = summarizeApplicants(normalized);

    const toView = (r: (typeof stageReviews)[number]): ReviewView => {
      const n = normById.get(r.id);
      return {
        id: r.id,
        reviewerId: r.reviewer_id,
        reviewerName: names.get(r.reviewer_id) ?? "Unknown",
        submitted: r.submitted_at !== null,
        raw: rawById.get(r.id) ?? null,
        normalized: n?.normalized ?? null,
        wasNormalized: n?.wasNormalized ?? false,
        comment: r.comment,
        scores: Object.fromEntries((scoresByReview.get(r.id) ?? []).map((s) => [s.criterionId, s.score])),
        mine: r.reviewer_id === viewerId,
      };
    };

    const eligible =
      stage === "interview"
        ? applicants.filter((a) => interviewed.has(a.id))
        : applicants.filter((a) => (review.assignedByApplicant.get(a.id) ?? []).includes(viewerId));

    const rows: ScoringApplicant[] = eligible.map((a) => {
      const views = stageReviews.filter((r) => r.applicant_id === a.id).map(toView);
      const aggregate = summary[a.id] ?? null;
      const base = {
        id: a.id,
        name: a.name,
        email: a.email,
        applicationLink: a.application_link,
        application: review.answers.get(a.id) ?? null,
      };
      if (stage === "interview") {
        const visible = visibleReviews(viewerId, views);
        const iSubmitted = views.some((v) => v.mine && v.submitted);
        return {
          ...base,
          mine: visible.find((v) => v.mine) ?? null,
          others: visible.filter((v) => !v.mine),
          visibleSummary: iSubmitted ? aggregate : null,
          disagree: iSubmitted && aggregate ? isDisagreement(aggregate, settings.disagreementThreshold) : false,
          unlocked: iSubmitted,
        };
      }
      // Blind resume scoring: nothing about other reviewers until every assigned reviewer has submitted.
      const unlocked = stateOf(a.id).unlocked;
      const { mine, others } = resumeVisibility(viewerId, views, unlocked);
      return {
        ...base,
        mine,
        others,
        visibleSummary: unlocked ? aggregate : null,
        disagree: unlocked && aggregate ? isDisagreement(aggregate, settings.disagreementThreshold) : false,
        unlocked,
      };
    });

    const insights = reviewerInsights(submittedInputs, settings.normalizeMinN);
    // Resume scoring is blind, so other reviewers' averages stay hidden until they have enough scores.
    const shown: MaskedReviewerInsight[] =
      stage === "resume" ? maskReviewerInsights(insights, viewerId, settings.normalizeMinN) : insights;
    const reviewers = shown.map((i) => ({ ...i, name: names.get(i.reviewerId) ?? "Unknown" }));

    return { data: { stage, rubric, applicants: rows, reviewers }, summary };
  };

  const resume = build("resume");
  const interview = build("interview");

  // The decision view and side panel only ever see unlocked resume applicants.
  const unlockedResume = Object.fromEntries(
    Object.entries(resume.summary).filter(([applicantId]) => stateOf(applicantId).unlocked),
  );

  const detail: Record<string, { assigned: string[]; conflicts: string[] }> = {};
  for (const a of applicants) detail[a.id] = { assigned: review.assignedByApplicant.get(a.id) ?? [], conflicts: [] };
  for (const e of review.exclusions) detail[e.applicantId]?.conflicts.push(e.reviewerId);

  return {
    stages: { resume: resume.data, interview: interview.data },
    summaries: { resume: unlockedResume, interview: interview.summary },
    settings,
    dashboard: buildReviewDashboard({
      applicants: applicants.map((a) => ({ id: a.id, name: a.name, email: a.email })),
      reviewerNames: names,
      assignments: review.assignments,
      submitted: submittedResume,
      revealed: review.revealed,
      summaries: resume.summary,
      disagreementThreshold: settings.disagreementThreshold,
    }),
    reviewSetup: { settings: review.settings, execs: review.execs, pool: review.pool, detail },
  };
}
