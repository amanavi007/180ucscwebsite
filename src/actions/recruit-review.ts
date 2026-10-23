"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import { getMatchableApplicants } from "@/lib/data/recruit";
import { getReviewerPool } from "@/lib/data/recruit-review";
import { getScoringBundle } from "@/lib/data/recruit-scoring";
import { sendEmail } from "@/lib/email/send";
import { buildReviewNudgeEmail } from "@/lib/email/review-nudge";
import {
  classifyApplications,
  type ApplicationCommitRow,
  type ParsedApplication,
  type PreviewRow,
} from "@/lib/recruit-applications";
import { assignReviewersForQuarter } from "@/lib/recruit-assign-reviewers";
import { REVIEW_SETTING_KEYS, validateReviewSettings, type ReviewSettings } from "@/lib/recruit-review-settings";

export interface ActionResult {
  error?: string;
}

async function requireExec() {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) return { profile: null, error: "Only exec can do that." };
  return { profile, error: undefined };
}

function revalidateAll() {
  revalidatePath("/portal/admin/applicants");
}

export async function previewApplicationImportAction(input: {
  quarterId: string;
  applications: ParsedApplication[];
}): Promise<ActionResult & { rows?: PreviewRow[] }> {
  const { error } = await requireExec();
  if (error) return { error };
  if (input.applications.length === 0) return { error: "There are no applications to import." };
  const existing = await getMatchableApplicants(input.quarterId);
  return { rows: classifyApplications(input.applications, existing) };
}

export async function commitApplicationImportAction(input: {
  quarterId: string;
  rows: ApplicationCommitRow[];
}): Promise<
  ActionResult & { batchId?: string; created?: number; updated?: number; skipped?: number; assigned?: number; assignError?: string }
> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  if (input.rows.length === 0) return { error: "Nothing to import. Every row was skipped." };

  const supabase = await createClient();
  const { data, error: rpcError } = await supabase.rpc("commit_application_import", {
    p_quarter: input.quarterId,
    p_rows: input.rows,
  });
  if (rpcError) return { error: rpcError.message };

  const result = data as { batchId: string; created: number; updated: number; skipped: number };
  await logAudit(
    profile.id,
    "recruit.applications_imported",
    null,
    `${result.created} new, ${result.updated} updated, ${result.skipped} skipped`,
  );
  const assignment = await assignReviewersForQuarter(input.quarterId, profile.id);
  revalidateAll();
  return { ...result, assigned: assignment.added, assignError: assignment.error };
}

export async function undoApplicationImportAction(batchId: string): Promise<ActionResult & { archived?: number }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  const supabase = await createClient();
  const { data, error: rpcError } = await supabase.rpc("undo_application_import", { p_batch: batchId });
  if (rpcError) return { error: rpcError.message };
  await logAudit(profile.id, "recruit.applications_import_undone", null, `${data} applicants removed`);
  revalidateAll();
  return { archived: data as number };
}

export async function assignReviewersAction(input: { quarterId: string }): Promise<ActionResult & { added?: number }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  const out = await assignReviewersForQuarter(input.quarterId, profile.id);
  if (!out.error) revalidateAll();
  return out;
}

export async function setApplicantReviewersAction(input: {
  applicantId: string;
  assigned: string[];
  conflicts: string[];
}): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  if (input.assigned.some((id) => input.conflicts.includes(id))) {
    return { error: "A reviewer can't be both assigned and marked as a conflict." };
  }

  const supabase = await createClient();
  const [{ data: current, error: curError }, { data: submitted, error: subError }] = await Promise.all([
    supabase.from("recruit_review_assignments").select("reviewer_id").eq("applicant_id", input.applicantId).eq("stage", "resume"),
    supabase
      .from("recruit_reviews")
      .select("reviewer_id")
      .eq("applicant_id", input.applicantId)
      .eq("stage", "resume")
      .not("submitted_at", "is", null),
  ]);
  if (curError || subError) return { error: (curError ?? subError)!.message };

  const done = new Set((submitted ?? []).map((s) => s.reviewer_id));
  const have = new Set((current ?? []).map((c) => c.reviewer_id));
  const removing = [...have].filter((id) => !input.assigned.includes(id));
  if (removing.some((id) => done.has(id))) {
    return { error: "A reviewer who already submitted can't be unassigned." };
  }
  const adding = input.assigned.filter((id) => !have.has(id));

  if (removing.length > 0) {
    const { error: delError } = await supabase
      .from("recruit_review_assignments")
      .delete()
      .eq("applicant_id", input.applicantId)
      .eq("stage", "resume")
      .in("reviewer_id", removing); // in-ok: reviewers are execs
    if (delError) return { error: delError.message };
  }
  if (adding.length > 0) {
    const { error: addError } = await supabase.from("recruit_review_assignments").insert(
      adding.map((reviewer_id) => ({ applicant_id: input.applicantId, reviewer_id, stage: "resume" as const })),
    );
    if (addError) return { error: addError.message };
  }

  const { error: clearError } = await supabase.from("recruit_review_exclusions").delete().eq("applicant_id", input.applicantId);
  if (clearError) return { error: clearError.message };
  if (input.conflicts.length > 0) {
    const { error: conflictError } = await supabase
      .from("recruit_review_exclusions")
      .insert(input.conflicts.map((reviewer_id) => ({ applicant_id: input.applicantId, reviewer_id })));
    if (conflictError) return { error: conflictError.message };
  }

  await logAudit(profile.id, "recruit.reviewers_changed", null, `applicant ${input.applicantId}`);
  revalidateAll();
  return {};
}

export async function setRevealAction(input: { applicantId: string; revealed: boolean }): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  const supabase = await createClient();
  const { error: dbError } = input.revealed
    ? await supabase
        .from("recruit_review_reveals")
        .upsert({ applicant_id: input.applicantId, stage: "resume", revealed_by: profile.id }, { onConflict: "applicant_id,stage" })
    : await supabase.from("recruit_review_reveals").delete().eq("applicant_id", input.applicantId).eq("stage", "resume");
  if (dbError) return { error: dbError.message };
  await logAudit(profile.id, input.revealed ? "recruit.scores_revealed" : "recruit.scores_hidden", null, `applicant ${input.applicantId}`);
  revalidateAll();
  return {};
}

export async function updateReviewSettingsAction(partial: Partial<ReviewSettings>): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  const problem = validateReviewSettings(partial);
  if (problem) return { error: problem };

  const rows: { key: string; value: string }[] = [];
  if (partial.perApplicant !== undefined) rows.push({ key: REVIEW_SETTING_KEYS.perApplicant, value: String(partial.perApplicant) });
  if (partial.pool !== undefined) {
    const valid = new Set((await getReviewerPool({ perApplicant: 0, pool: [] })).map((p) => p.id));
    if (partial.pool.some((id) => !valid.has(id))) return { error: "One of those reviewers isn't an active exec." };
    rows.push({ key: REVIEW_SETTING_KEYS.pool, value: partial.pool.join(",") });
  }
  if (rows.length === 0) return {};

  const supabase = await createClient();
  const { error: upsertError } = await supabase.from("org_settings").upsert(rows, { onConflict: "key" });
  if (upsertError) return { error: upsertError.message };
  await logAudit(profile.id, "recruit.settings_changed", null, rows.map((r) => `${r.key}=${r.value}`).join(", "));
  revalidateAll();
  return {};
}

/** Emails a reviewer who still has applications to score. The count is worked out here, never trusted from the page. */
export async function nudgeReviewerAction(input: { quarterId: string; reviewerId: string }): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error: error ?? "Only exec can do that." };

  const bundle = await getScoringBundle(input.quarterId, profile.id);
  const reviewer = bundle.dashboard.reviewers.find((r) => r.id === input.reviewerId);
  if (!reviewer) return { error: "That person isn't a reviewer this quarter." };
  const left = reviewer.assigned - reviewer.done;
  if (left <= 0) return { error: `${reviewer.name} has already finished.` };

  const supabase = await createClient();
  const { data, error: lookupError } = await supabase.from("profiles").select("name, email").eq("id", input.reviewerId).single();
  if (lookupError || !data?.email) return { error: "Couldn't find their email address." };

  try {
    const email = buildReviewNudgeEmail({
      firstName: data.name.split(" ")[0],
      left,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
    });
    await sendEmail({ to: data.email, ...email });
  } catch (err) {
    console.error("Review nudge failed:", err);
    return { error: "The email didn't send. Try again in a minute." };
  }
  return {};
}
