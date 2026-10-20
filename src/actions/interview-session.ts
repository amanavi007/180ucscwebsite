"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { getResearchPrompts } from "@/lib/data/org-settings";
import {
  BEHAVIORAL_PICK_MAX,
  BEHAVIORAL_QUESTIONS,
  CASES,
  RECOMMENDATIONS,
  RUBRIC_CRITERIA,
  isScoreComplete,
  totalScore,
  validateScores,
  type Recommendation,
  type Scores,
} from "@/lib/interview-guide";
import { asClocks, type Clocks, type TimerOp, type TimerSync } from "@/lib/interview-timers";

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

const TIMER_ID = /^[a-z][a-z0-9:_-]{0,39}$/;

/** Starts, pauses, resets or switches one of the interview's shared timers. The database stamps the time. */
export async function applyInterviewTimerAction(input: { sessionId: string; op: TimerOp }): Promise<{ error?: string; sync?: TimerSync }> {
  const { error } = await requireExec();
  if (error) return { error };
  const { op } = input;
  const ids = op.op === "switch" ? [op.next, ...op.ids] : [op.id];
  if (ids.length > 12 || !ids.every((id) => TIMER_ID.test(id))) return { error: "That timer isn't part of the interview." };

  const supabase = await createClient();
  const { data, error: rpcError } = await supabase.rpc("apply_interview_timer", {
    p_session: input.sessionId,
    p_op: op.op,
    p_id: op.op === "switch" ? op.next : op.id,
    p_ids: op.op === "switch" ? op.ids : [],
  });
  if (rpcError) return { error: rpcError.message };
  const result = data as { timers?: unknown; now?: unknown } | null;
  if (!result || typeof result.now !== "number") return { error: "The timer didn't save." };
  return { sync: { timers: asClocks(result.timers), now: result.now } };
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
  if (input.researchKey && !(await getResearchPrompts()).some((r) => r.key === input.researchKey)) return { error: "That research prompt isn't in the list." };
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

/**
 * Saves the shared 40-point scorecard. Only the lines that changed are sent, and the server merges them, so two people
 * clicking different lines don't overwrite each other. Submitting also copies the total into the applicant's interview review.
 */
export async function saveScorecardAction(input: {
  sessionId: string;
  /** Lines that were set since the last save. */
  set: Scores;
  /** Lines that were cleared since the last save. */
  clear: string[];
  /** Leave undefined when it didn't change. */
  recommendation?: Recommendation | null;
  submit: boolean;
}): Promise<SessionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const problem = validateScores(input.set);
  if (problem) return { error: problem };
  const known = new Set(RUBRIC_CRITERIA.map((c) => c.key));
  if (input.clear.some((k) => !known.has(k))) return { error: "One of those scores doesn't match the rubric. Refresh the page." };
  if (input.recommendation && !RECOMMENDATIONS.some((r) => r.value === input.recommendation)) return { error: "Pick Move forward, Maybe or Don't move forward." };

  const supabase = await createClient();
  if (Object.keys(input.set).length > 0 || input.clear.length > 0) {
    const { error: mergeError } = await supabase.rpc("merge_interview_scores", { p_session: input.sessionId, p_set: input.set, p_clear: input.clear });
    if (mergeError) return { error: mergeError.message };
  }
  if (input.recommendation !== undefined) {
    const { error: recError } = await supabase.from("interview_sessions").update({ recommendation: input.recommendation }).eq("id", input.sessionId);
    if (recError) return { error: recError.message };
  }
  if (!input.submit) return {};

  const { data: session, error: readError } = await supabase
    .from("interview_sessions")
    .select("scores, recommendation, scored_by")
    .eq("id", input.sessionId)
    .maybeSingle();
  if (readError) return { error: readError.message };
  if (!session) return { error: "That interview is gone. Refresh the page." };
  const scores = (session.scores ?? {}) as Scores;
  if (!isScoreComplete(scores)) return { error: "Score every line before submitting." };
  if (!session.recommendation) return { error: "Pick Move forward, Maybe or Don't move forward before submitting." };

  const { error: submitError } = await supabase
    .from("interview_sessions")
    .update({ scored_at: new Date().toISOString(), scored_by: profile.id })
    .eq("id", input.sessionId);
  if (submitError) return { error: submitError.message };

  const mirror = await mirrorToReview(input.sessionId, profile.id, session.scored_by, totalScore(scores), session.recommendation as Recommendation);
  if (mirror.error) return { error: `Your score is saved, but it couldn't be added to the applicant's review: ${mirror.error}` };
  refresh();
  return { mirrored: mirror.done };
}

async function mirrorToReview(
  sessionId: string,
  reviewerId: string,
  previousReviewerId: string | null,
  total: number,
  recommendation: Recommendation,
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
  // Not an error: the score is saved, there is just no applicant record to attach a review to yet.
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

  // One joint score means one review. If someone else submitted it before, their copy is replaced, not doubled.
  if (previousReviewerId && previousReviewerId !== reviewerId) {
    const { error: staleError } = await supabase
      .from("recruit_reviews")
      .delete()
      .eq("applicant_id", applicantId)
      .eq("stage", "interview")
      .eq("reviewer_id", previousReviewerId);
    if (staleError) return { done: false, error: staleError.message };
  }

  const label = RECOMMENDATIONS.find((r) => r.value === recommendation)?.label ?? "";
  const { data: review, error: reviewError } = await supabase
    .from("recruit_reviews")
    .upsert(
      { applicant_id: applicantId, stage: "interview", reviewer_id: reviewerId, comment: label, submitted_at: new Date().toISOString() },
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

export interface LiveInterviewState {
  timers: Clocks;
  /** The server's clock when this was read, so the page can line its running timers up with it. */
  now: number;
  behavioralKeys: string[];
  researchKey: string | null;
  caseKey: string | null;
  notes: Record<string, string>;
  scores: Scores;
  recommendation: Recommendation | null;
  scoredAt: string | null;
  scoredBy: string | null;
}

/** The shared parts of an interview (picked questions, notes and the joint score), for the page to poll so two people see each other's changes. */
export async function getInterviewLiveAction(sessionId: string): Promise<{ error?: string; gone?: boolean; state?: LiveInterviewState }> {
  const { error } = await requireExec();
  if (error) return { error };
  const supabase = await createClient();
  const { data, error: readError } = await supabase
    .from("interview_sessions")
    .select("notes, scores, recommendation, scored_at, scored_by, behavioral_keys, research_key, case_key, timers")
    .eq("id", sessionId)
    .maybeSingle();
  if (readError) return { error: readError.message };
  if (!data) return { gone: true };

  let scoredBy: string | null = null;
  if (data.scored_by) {
    const { data: who } = await supabase.from("profiles").select("name").eq("id", data.scored_by).maybeSingle();
    scoredBy = who?.name ?? null;
  }
  const notes =
    typeof data.notes === "object" && data.notes !== null && !Array.isArray(data.notes)
      ? (Object.fromEntries(Object.entries(data.notes).filter(([, v]) => typeof v === "string")) as Record<string, string>)
      : {};
  return {
    state: {
      timers: asClocks(data.timers),
      now: Date.now(),
      behavioralKeys: data.behavioral_keys ?? [],
      researchKey: data.research_key,
      caseKey: data.case_key,
      notes,
      scores: (data.scores ?? {}) as Scores,
      recommendation: data.recommendation as Recommendation | null,
      scoredAt: data.scored_at,
      scoredBy,
    },
  };
}

/** Wipes an interview back to unopened: picks, notes, every interviewer's scorecard, and the review copies of those scores. */
export async function resetInterviewSessionAction(sessionId: string): Promise<SessionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  const { data: session, error: sessionError } = await supabase
    .from("interview_sessions")
    .select("applicant_id, scored_by")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError) return { error: sessionError.message };
  if (!session) return {};

  if (session.applicant_id) {
    const { data: cards, error: cardsError } = await supabase.from("interview_session_scores").select("reviewer_id").eq("session_id", sessionId);
    if (cardsError) return { error: cardsError.message };
    const reviewerIds = [...new Set([...(cards ?? []).map((c) => c.reviewer_id), ...(session.scored_by ? [session.scored_by] : [])])];
    if (reviewerIds.length > 0) {
      const { error: reviewError } = await supabase
        .from("recruit_reviews")
        .delete()
        .eq("applicant_id", session.applicant_id)
        .eq("stage", "interview")
        .in("reviewer_id", reviewerIds);
      if (reviewError) return { error: reviewError.message };
    }
  }

  const { error: deleteError } = await supabase.from("interview_sessions").delete().eq("id", sessionId);
  if (deleteError) return { error: deleteError.message };
  refresh();
  return {};
}
