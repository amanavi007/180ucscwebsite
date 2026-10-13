"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import { fetchAllPages } from "@/lib/paginate";
import { getMatchableApplicants } from "@/lib/data/recruit";
import { getReviewContext, getReviewerPool } from "@/lib/data/recruit-review";
import {
  classifyApplications,
  type ApplicationCommitRow,
  type ParsedApplication,
  type PreviewRow,
} from "@/lib/recruit-applications";
import { assignReviewers, exclusionKey, selfExclusions } from "@/lib/recruit-assignment";
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

async function liveApplicants(quarterId: string) {
  const supabase = await createClient();
  return fetchAllPages((from, to) =>
    supabase
      .from("recruit_applicants")
      .select("id, name, email")
      .eq("quarter_id", quarterId)
      .is("archived_at", null)
      .order("id")
      .range(from, to),
  );
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
}): Promise<ActionResult & { batchId?: string; created?: number; updated?: number; skipped?: number }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  if (input.rows.length === 0) return { error: "Nothing to import — every row was skipped." };

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
  revalidateAll();
  return result;
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

  const applicants = await liveApplicants(input.quarterId);
  const ctx = await getReviewContext(applicants.map((a) => a.id));
  const poolIds = ctx.pool.map((p) => p.id);
  if (poolIds.length === 0) return { error: "There are no reviewers in the pool. Check Setup → Reviewers." };

  const supabase = await createClient();

  // Reviewers who left the pool lose their unfinished assignments; submitted reviews stay.
  const stale = ctx.assignments.filter((a) => !poolIds.includes(a.reviewerId));
  let kept = ctx.assignments;
  if (stale.length > 0) {
    const submitted = new Set<string>();
    const rows = await fetchAllPages((from, to) =>
      supabase
        .from("recruit_reviews")
        .select("applicant_id, reviewer_id")
        .eq("stage", "resume")
        .not("submitted_at", "is", null)
        .in("reviewer_id", [...new Set(stale.map((s) => s.reviewerId))])
        .order("id")
        .range(from, to),
    );
    for (const r of rows) submitted.add(exclusionKey(r.applicant_id, r.reviewer_id));
    const removable = stale.filter((s) => !submitted.has(exclusionKey(s.applicantId, s.reviewerId)));
    for (const r of removable) {
      const { error: delError } = await supabase
        .from("recruit_review_assignments")
        .delete()
        .eq("applicant_id", r.applicantId)
        .eq("reviewer_id", r.reviewerId)
        .eq("stage", "resume");
      if (delError) return { error: delError.message };
    }
    const gone = new Set(removable.map((r) => exclusionKey(r.applicantId, r.reviewerId)));
    kept = ctx.assignments.filter((a) => !gone.has(exclusionKey(a.applicantId, a.reviewerId)));
  }

  const excluded = new Set([
    ...ctx.exclusions.map((e) => exclusionKey(e.applicantId, e.reviewerId)),
    ...selfExclusions(applicants, ctx.pool),
  ]);
  const result = assignReviewers({
    applicantIds: applicants.map((a) => a.id),
    pool: poolIds,
    perApplicant: ctx.settings.perApplicant,
    excluded,
    existing: kept,
    seed: Math.floor(Math.random() * 2 ** 31),
  });
  if (!result.ok) {
    const name = applicants.find((a) => a.id === result.applicantId)?.name ?? "an applicant";
    return {
      error: `Couldn't assign ${name}: ${result.need} more reviewer${result.need === 1 ? "" : "s"} needed but only ${result.eligible} eligible. Add reviewers to the pool or lower reviewers per applicant.`,
    };
  }
  if (result.added.length > 0) {
    const { error: insertError } = await supabase.from("recruit_review_assignments").insert(
      result.added.map((a) => ({ applicant_id: a.applicantId, reviewer_id: a.reviewerId, stage: "resume" as const })),
    );
    if (insertError) return { error: insertError.message };
  }

  await logAudit(profile.id, "recruit.reviewers_assigned", null, `${result.added.length} assignments added`);
  revalidateAll();
  return { added: result.added.length };
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
      .in("reviewer_id", removing);
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
