import "server-only";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { fetchAllPages } from "@/lib/paginate";
import { getReviewContext } from "@/lib/data/recruit-review";
import { assignReviewers, exclusionKey, selfExclusions } from "@/lib/recruit-assignment";

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

/** Tops up reviewer assignments for every live applicant in the quarter. Callers must have checked the actor is exec. */
export async function assignReviewersForQuarter(
  quarterId: string,
  actorId: string,
): Promise<{ error?: string; added?: number }> {
  const everyone = await liveApplicants(quarterId);
  const ctx = await getReviewContext(everyone.map((a) => a.id));
  // Only people who submitted the application form get reviewers.
  const applicants = everyone.filter((a) => ctx.answers.has(a.id));
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

  await logAudit(actorId, "recruit.reviewers_assigned", null, `${result.added.length} assignments added`);
  return { added: result.added.length };
}
