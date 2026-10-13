import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/paginate";
import { EXEC_ROLES } from "@/lib/auth/roles";
import { parseReviewSettings, REVIEW_SETTING_KEYS, type ReviewSettings } from "@/lib/recruit-review-settings";
import type { Assignment } from "@/lib/recruit-assignment";

export interface ReviewerProfile {
  id: string;
  name: string;
  email: string;
}

export interface ApplicationAnswers {
  submittedAt: string | null;
  graduationTerm: string | null;
  howHeard: string | null;
  essayWhy: string | null;
  essayTeamwork: string | null;
  essayBring: string | null;
  resumeUrl: string | null;
}

export interface ReviewContext {
  settings: ReviewSettings;
  execs: ReviewerProfile[];
  pool: ReviewerProfile[];
  assignments: Assignment[];
  assignedByApplicant: Map<string, string[]>;
  exclusions: Assignment[];
  revealed: Set<string>;
  answers: Map<string, ApplicationAnswers>;
}

const CHUNK = 100;

async function chunked<R>(ids: string[], load: (chunk: string[]) => Promise<R[]>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await load(ids.slice(i, i + CHUNK))));
  return out;
}

export async function getReviewSettings(): Promise<ReviewSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("org_settings")
    .select("key, value")
    .in("key", Object.values(REVIEW_SETTING_KEYS));
  if (error) throw error;
  return parseReviewSettings(data ?? []);
}

/** Every active exec, whether or not they are in the reviewer pool. */
export async function getAllExecs(): Promise<ReviewerProfile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email")
    .in("role", EXEC_ROLES)
    .is("archived_at", null)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export function poolFrom(execs: ReviewerProfile[], settings: ReviewSettings): ReviewerProfile[] {
  return settings.pool.length === 0 ? execs : execs.filter((p) => settings.pool.includes(p.id));
}

export async function getReviewerPool(settings: ReviewSettings): Promise<ReviewerProfile[]> {
  return poolFrom(await getAllExecs(), settings);
}

export async function getReviewContext(applicantIds: string[]): Promise<ReviewContext> {
  const supabase = await createClient();
  const settings = await getReviewSettings();
  const [execs, assignmentRows, exclusionRows, revealRows, answerRows] = await Promise.all([
    getAllExecs(),
    chunked(applicantIds, (c) =>
      fetchAllPages((from, to) =>
        supabase
          .from("recruit_review_assignments")
          .select("id, applicant_id, reviewer_id")
          .eq("stage", "resume")
          .in("applicant_id", c)
          .order("id")
          .range(from, to),
      ),
    ),
    chunked(applicantIds, (c) =>
      fetchAllPages((from, to) =>
        supabase
          .from("recruit_review_exclusions")
          .select("applicant_id, reviewer_id")
          .in("applicant_id", c)
          .order("applicant_id")
          .order("reviewer_id")
          .range(from, to),
      ),
    ),
    chunked(applicantIds, (c) =>
      fetchAllPages((from, to) =>
        supabase
          .from("recruit_review_reveals")
          .select("applicant_id")
          .eq("stage", "resume")
          .in("applicant_id", c)
          .order("applicant_id")
          .range(from, to),
      ),
    ),
    chunked(applicantIds, (c) =>
      fetchAllPages((from, to) =>
        supabase.from("recruit_applicant_answers").select("*").in("applicant_id", c).order("applicant_id").range(from, to),
      ),
    ),
  ]);

  const assignedByApplicant = new Map<string, string[]>();
  for (const a of assignmentRows) {
    assignedByApplicant.set(a.applicant_id, [...(assignedByApplicant.get(a.applicant_id) ?? []), a.reviewer_id]);
  }
  return {
    settings,
    execs,
    pool: poolFrom(execs, settings),
    assignments: assignmentRows.map((a) => ({ applicantId: a.applicant_id, reviewerId: a.reviewer_id })),
    assignedByApplicant,
    exclusions: exclusionRows.map((e) => ({ applicantId: e.applicant_id, reviewerId: e.reviewer_id })),
    revealed: new Set(revealRows.map((r) => r.applicant_id)),
    answers: new Map(
      answerRows.map((a) => [
        a.applicant_id,
        {
          submittedAt: a.submitted_at,
          graduationTerm: a.graduation_term,
          howHeard: a.how_heard,
          essayWhy: a.essay_why,
          essayTeamwork: a.essay_teamwork,
          essayBring: a.essay_bring,
          resumeUrl: a.resume_url,
        },
      ]),
    ),
  };
}
