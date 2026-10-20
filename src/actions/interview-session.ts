"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import {
  BEHAVIORAL_PICK_MAX,
  BEHAVIORAL_QUESTIONS,
  CASES,
  RECOMMENDATIONS,
  RESEARCH_PROMPTS,
  isScoreComplete,
  totalScore,
  validateScores,
  type Recommendation,
  type Scores,
} from "@/lib/interview-guide";

export interface SessionResult {
  error?: string;
  sessionId?: string;
  /** True when a submitted score was also written to the applicant's interview review. */
  mirrored?: boolean;
}

const NOTE_MAX_LENGTH = 20000;
const MIRROR_CRITERION_NAME = "Interview score (out of 40)";

async function requireExec() {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) return { profile: null, error: "Only exec can do that." };
  return { profile, error: undefined };
}

function refresh() {
  revalidatePath("/portal/admin/applicants");
}

/** Opens the working session for an interview, or returns the one that already exists. */
export async function startInterviewSessionAction(input: { bookingId?: string; applicantId?: string }): Promise<SessionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  if (!input.bookingId && !input.applicantId) return { error: "Pick an interview or an applicant first." };

  const supabase = await createClient();
  let applicantId = input.applicantId ?? null;

  if (input.bookingId) {
    const { data: existing } = await supabase.from("interview_sessions").select("id").eq("booking_id", input.bookingId).maybeSingle();
    if (existing) return { sessionId: existing.id };

    const { data: booking, error: bookingError } = await supabase
      .from("interview_bookings")
      .select("applicant_email")
      .eq("id", input.bookingId)
      .maybeSingle();
    if (bookingError) return { error: bookingError.message };
    if (!booking) return { error: "That booking no longer exists. Refresh the page." };
    const { data: match } = await supabase
      .from("recruit_applicants")
      .select("id")
      .eq("email", booking.applicant_email)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    applicantId = match?.id ?? null;
  }

  if (applicantId) {
    const { data: existing } = await supabase.from("interview_sessions").select("id").eq("applicant_id", applicantId).maybeSingle();
    if (existing) {
      // An earlier manual session for this applicant now belongs to their booking too.
      if (input.bookingId) await supabase.from("interview_sessions").update({ booking_id: input.bookingId }).eq("id", existing.id).is("booking_id", null);
      refresh();
      return { sessionId: existing.id };
    }
  }

  const { data: created, error: insertError } = await supabase
    .from("interview_sessions")
    .insert({ booking_id: input.bookingId ?? null, applicant_id: applicantId, created_by: profile.id })
    .select("id")
    .single();
  if (insertError) return { error: insertError.message };
  refresh();
  return { sessionId: created.id };
}

/** Which behavioral questions, research prompt and case this interview will use. */
export async function saveInterviewPlanAction(input: {
  sessionId: string;
  behavioralKeys: string[];
  researchKey: string | null;
  caseKey: string | null;
}): Promise<SessionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const known = new Set(BEHAVIORAL_QUESTIONS.map((q) => q.key));
  const keys = [...new Set(input.behavioralKeys)];
  if (keys.some((k) => !known.has(k))) return { error: "One of those questions is no longer in the list. Refresh the page." };
  // A little over the suggested six is allowed so a swap doesn't have to be done in a strict order.
  if (keys.length > BEHAVIORAL_PICK_MAX + 3) return { error: "That's too many questions for 12 minutes." };
  if (input.researchKey && !RESEARCH_PROMPTS.some((r) => r.key === input.researchKey)) return { error: "That research prompt isn't in the list." };
  if (input.caseKey && !CASES.some((c) => c.key === input.caseKey)) return { error: "That case isn't in the list." };

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("interview_sessions")
    .update({ behavioral_keys: keys, research_key: input.researchKey, case_key: input.caseKey })
    .eq("id", input.sessionId);
  if (updateError) return { error: updateError.message };
  refresh();
  return {};
}

/** Saves only the note fields that changed. Fields are merged on the server so two people don't overwrite each other. */
export async function saveInterviewNotesAction(input: { sessionId: string; patch: Record<string, string> }): Promise<SessionResult> {
  const { error } = await requireExec();
  if (error) return { error };
  for (const [key, value] of Object.entries(input.patch)) {
    if (!key || key.length > 80 || typeof value !== "string") return { error: "Those notes couldn't be saved. Refresh the page." };
    if (value.length > NOTE_MAX_LENGTH) return { error: "One of the notes is too long to save." };
  }
  if (Object.keys(input.patch).length === 0) return {};

  const supabase = await createClient();
  const { error: rpcError } = await supabase.rpc("merge_interview_notes", { p_session: input.sessionId, p_patch: input.patch });
  if (rpcError) return { error: rpcError.message };
  return {};
}

/** Saves your own 40-point scorecard. A submitted scorecard is also copied into the applicant's interview review. */
export async function saveScorecardAction(input: {
  sessionId: string;
  scores: Scores;
  recommendation: Recommendation | null;
  submit: boolean;
}): Promise<SessionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const problem = validateScores(input.scores);
  if (problem) return { error: problem };
  if (input.recommendation && !RECOMMENDATIONS.some((r) => r.value === input.recommendation)) return { error: "Pick Move forward, Maybe or Don't move forward." };
  if (input.submit) {
    if (!isScoreComplete(input.scores)) return { error: "Score every line before submitting, or save a draft." };
    if (!input.recommendation) return { error: "Pick Move forward, Maybe or Don't move forward before submitting." };
  }

  const supabase = await createClient();
  const { error: saveError } = await supabase.from("interview_session_scores").upsert(
    {
      session_id: input.sessionId,
      reviewer_id: profile.id,
      scores: input.scores,
      recommendation: input.recommendation,
      ...(input.submit ? { submitted_at: new Date().toISOString() } : {}),
    },
    { onConflict: "session_id,reviewer_id" },
  );
  if (saveError) return { error: saveError.message };

  let mirrored = false;
  if (input.submit) {
    const mirror = await mirrorToReview(input.sessionId, profile.id, totalScore(input.scores), input.recommendation);
    if (mirror.error) return { error: `Your score is saved, but it couldn't be added to the applicant's review: ${mirror.error}` };
    mirrored = mirror.done;
  }
  refresh();
  return { mirrored };
}

async function mirrorToReview(
  sessionId: string,
  reviewerId: string,
  total: number,
  recommendation: Recommendation | null,
): Promise<{ done: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: session, error: sessionError } = await supabase
    .from("interview_sessions")
    .select("applicant_id, booking_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError) return { done: false, error: sessionError.message };
  if (!session) return { done: false, error: "The interview session is gone." };

  let applicantId = session.applicant_id;
  if (!applicantId && session.booking_id) {
    const { data: booking } = await supabase.from("interview_bookings").select("applicant_email").eq("id", session.booking_id).maybeSingle();
    if (booking) {
      const { data: match } = await supabase
        .from("recruit_applicants")
        .select("id")
        .eq("email", booking.applicant_email)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      applicantId = match?.id ?? null;
      if (applicantId) await supabase.from("interview_sessions").update({ applicant_id: applicantId }).eq("id", sessionId).is("applicant_id", null);
    }
  }
  // Not an error: the scorecard is saved, there is just no applicant record to attach a review to yet.
  if (!applicantId) return { done: false };

  const { data: rubric } = await supabase.from("recruit_rubrics").select("id").eq("stage", "interview").maybeSingle();
  if (!rubric) return { done: false };
  const { data: criterion } = await supabase
    .from("recruit_rubric_criteria")
    .select("id")
    .eq("rubric_id", rubric.id)
    .eq("name", MIRROR_CRITERION_NAME)
    .is("archived_at", null)
    .maybeSingle();
  if (!criterion) return { done: false };

  const label = RECOMMENDATIONS.find((r) => r.value === recommendation)?.label ?? "";
  const { data: review, error: reviewError } = await supabase
    .from("recruit_reviews")
    .upsert(
      {
        applicant_id: applicantId,
        stage: "interview",
        reviewer_id: reviewerId,
        comment: label,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "applicant_id,stage,reviewer_id" },
    )
    .select("id")
    .single();
  if (reviewError) return { done: false, error: reviewError.message };

  const { error: scoreError } = await supabase
    .from("recruit_review_scores")
    .upsert({ review_id: review.id, criterion_id: criterion.id, score: total }, { onConflict: "review_id,criterion_id" });
  if (scoreError) return { done: false, error: scoreError.message };
  return { done: true };
}
