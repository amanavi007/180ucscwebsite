"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import { getMatchableApplicants } from "@/lib/data/recruit";
import {
  isPlausibleEmail,
  normalizeApplicantEmail,
  resolveMerge,
  validateAward,
  type RecruitSection,
} from "@/lib/recruit";
import { findMatches, normalizeName, pairKey, type MatchClass } from "@/lib/recruit-matching";

export interface ActionResult {
  error?: string;
}

export interface MatchPreview {
  applicantId: string;
  name: string;
  email: string | null;
  kind: MatchClass;
  score: number;
}

const SECTIONS: RecruitSection[] = ["engagement", "resume", "interview"];

async function requireExec() {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) return { profile: null, error: "Only exec can do that." };
  return { profile, error: undefined };
}

function revalidateAll() {
  revalidatePath("/portal/admin/applicants");
}

function cleanText(v: string | undefined | null): string | null {
  const t = v?.trim();
  return t ? t : null;
}

export async function checkApplicantMatchesAction(input: {
  quarterId: string;
  name: string;
  email?: string;
}): Promise<{ matches: MatchPreview[] }> {
  const { error } = await requireExec();
  if (error) return { matches: [] };

  const existing = await getMatchableApplicants(input.quarterId);
  const byId = new Map(existing.map((a) => [a.id, a]));
  const matches = findMatches({ name: input.name, email: normalizeApplicantEmail(input.email) }, existing).map((m) => ({
    applicantId: m.applicantId,
    name: byId.get(m.applicantId)?.name ?? "Unknown",
    email: byId.get(m.applicantId)?.email ?? null,
    kind: m.kind,
    score: m.score,
  }));
  return { matches };
}

export async function addApplicantAction(input: {
  quarterId: string;
  name: string;
  email?: string;
  major?: string;
  year?: string;
  confirmDuplicate?: boolean;
}): Promise<ActionResult & { needsConfirm?: boolean }> {
  const { error } = await requireExec();
  if (error) return { error };

  const name = input.name.trim();
  if (!name) return { error: "Enter the applicant's name." };
  const email = normalizeApplicantEmail(input.email);
  if (email && !isPlausibleEmail(email)) return { error: "That email doesn't look right." };

  const existing = await getMatchableApplicants(input.quarterId);
  const matches = findMatches({ name, email }, existing);
  if (matches.some((m) => m.kind === "duplicate")) {
    return { error: "Someone with that email is already an applicant this quarter." };
  }
  if (matches.length > 0 && !input.confirmDuplicate) return { needsConfirm: true };

  const supabase = await createClient();

  let previousId: string | null = null;
  if (email) {
    const { data: prev, error: prevError } = await supabase
      .from("recruit_applicants")
      .select("id")
      .eq("email", email)
      .neq("quarter_id", input.quarterId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (prevError) return { error: prevError.message };
    previousId = prev?.[0]?.id ?? null;
  }

  const { error: insertError } = await supabase.from("recruit_applicants").insert({
    quarter_id: input.quarterId,
    name,
    email,
    major: cleanText(input.major),
    year: cleanText(input.year),
    previous_applicant_id: previousId,
  });
  if (insertError) return { error: insertError.message };

  revalidateAll();
  return {};
}

export async function updateApplicantAction(
  id: string,
  input: { name: string; email?: string; major?: string; year?: string; notes: string },
): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const name = input.name.trim();
  if (!name) return { error: "Enter the applicant's name." };
  const email = normalizeApplicantEmail(input.email);
  if (email && !isPlausibleEmail(email)) return { error: "That email doesn't look right." };

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("recruit_applicants")
    .update({ name, email, major: cleanText(input.major), year: cleanText(input.year), notes: input.notes })
    .eq("id", id);
  if (updateError) {
    return {
      error: updateError.code === "23505" ? "Another applicant already has that email." : updateError.message,
    };
  }

  revalidateAll();
  return {};
}

export async function awardPointsAction(input: {
  applicantId: string;
  categoryId: string;
  eventId?: string | null;
  points: number;
  reason?: string;
}): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const problem = validateAward({ points: input.points, reason: input.reason });
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { data: category, error: categoryError } = await supabase
    .from("recruit_categories")
    .select("archived_at")
    .eq("id", input.categoryId)
    .maybeSingle();
  if (categoryError) return { error: categoryError.message };
  if (!category) return { error: "That category no longer exists." };
  if (category.archived_at) return { error: "That category is archived — pick another one." };

  const { error: insertError } = await supabase.from("recruit_points").insert({
    applicant_id: input.applicantId,
    category_id: input.categoryId,
    event_id: input.eventId ?? null,
    points: input.points,
    reason: cleanText(input.reason),
    source: "manual",
    awarded_by: profile.id,
  });
  if (insertError) return { error: insertError.message };

  revalidateAll();
  return {};
}

export async function voidPointsAction(entryId: string, reason: string): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  if (!reason.trim()) return { error: "Say why you're voiding this entry." };

  const supabase = await createClient();
  const { data: entry, error: readError } = await supabase
    .from("recruit_points")
    .select("applicant_id, points, voided_at")
    .eq("id", entryId)
    .maybeSingle();
  if (readError) return { error: readError.message };
  if (!entry) return { error: "That entry no longer exists." };
  if (entry.voided_at) return { error: "That entry was already voided." };

  const { error: updateError } = await supabase
    .from("recruit_points")
    .update({ voided_at: new Date().toISOString(), voided_by: profile.id, void_reason: reason.trim() })
    .eq("id", entryId);
  if (updateError) return { error: updateError.message };

  const { data: applicant } = await supabase
    .from("recruit_applicants")
    .select("name")
    .eq("id", entry.applicant_id)
    .maybeSingle();
  await logAudit(profile.id, "recruit.points_voided", applicant?.name ?? null, `${entry.points} pts — ${reason.trim()}`);

  revalidateAll();
  return {};
}

function validateCategoryInput(input: { name: string; section: RecruitSection; defaultPoints: number }): string | null {
  if (!input.name.trim()) return "Give the category a name.";
  if (!SECTIONS.includes(input.section)) return "Pick a section.";
  if (!Number.isFinite(input.defaultPoints)) return "Enter the default points as a number.";
  return null;
}

export async function createCategoryAction(input: {
  name: string;
  section: RecruitSection;
  defaultPoints: number;
}): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  const problem = validateCategoryInput(input);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("recruit_categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  const sortOrder = (last?.[0]?.sort_order ?? 0) + 10;

  const { error: insertError } = await supabase.from("recruit_categories").insert({
    name: input.name.trim(),
    section: input.section,
    default_points: input.defaultPoints,
    sort_order: sortOrder,
  });
  if (insertError) {
    return {
      error: insertError.code === "23505" ? "A category with that name already exists." : insertError.message,
    };
  }
  await logAudit(profile.id, "recruit.category_created", input.name.trim());
  revalidateAll();
  return {};
}

export async function updateCategoryAction(
  id: string,
  input: { name: string; section: RecruitSection; defaultPoints: number },
): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  const problem = validateCategoryInput(input);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("recruit_categories")
    .update({ name: input.name.trim(), section: input.section, default_points: input.defaultPoints })
    .eq("id", id);
  if (updateError) {
    return {
      error: updateError.code === "23505" ? "A category with that name already exists." : updateError.message,
    };
  }
  await logAudit(profile.id, "recruit.category_updated", input.name.trim(), `default ${input.defaultPoints} pts`);
  revalidateAll();
  return {};
}

export async function setCategoryArchivedAction(id: string, archived: boolean): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const supabase = await createClient();
  const { data: category, error: updateError } = await supabase
    .from("recruit_categories")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .select("name")
    .maybeSingle();
  if (updateError) return { error: updateError.message };

  await logAudit(profile.id, archived ? "recruit.category_archived" : "recruit.category_restored", category?.name ?? null);
  revalidateAll();
  return {};
}

export async function reorderCategoriesAction(orderedIds: string[]): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  for (const [index, id] of orderedIds.entries()) {
    const { error: updateError } = await supabase
      .from("recruit_categories")
      .update({ sort_order: (index + 1) * 10 })
      .eq("id", id);
    if (updateError) return { error: updateError.message };
  }
  revalidateAll();
  return {};
}

export async function createEventAction(input: {
  quarterId: string;
  categoryId: string;
  name: string;
  date: string;
}): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };
  if (!input.name.trim()) return { error: "Give the event a name." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Pick the event's date." };

  const supabase = await createClient();
  const { error: insertError } = await supabase.from("recruit_events").insert({
    quarter_id: input.quarterId,
    category_id: input.categoryId,
    name: input.name.trim(),
    date: input.date,
  });
  if (insertError) return { error: insertError.message };

  revalidateAll();
  return {};
}

export async function deleteEventAction(id: string): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from("recruit_points")
    .select("id", { count: "exact", head: true })
    .eq("event_id", id);
  if (countError) return { error: countError.message };
  if ((count ?? 0) > 0) {
    return { error: "This event already has points attached, so it can't be deleted. Void those entries first." };
  }

  const { error: deleteError } = await supabase.from("recruit_events").delete().eq("id", id);
  if (deleteError) return { error: deleteError.message };

  revalidateAll();
  return {};
}

export async function mergeApplicantsAction(input: {
  survivorId: string;
  absorbedId: string;
  keepEmail?: string | null;
}): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const supabase = await createClient();
  const { data: people, error: readError } = await supabase
    .from("recruit_applicants")
    .select("id, name, email, major, year, notes")
    .in("id", [input.survivorId, input.absorbedId]);
  if (readError) return { error: readError.message };
  const survivor = people?.find((p) => p.id === input.survivorId);
  const absorbed = people?.find((p) => p.id === input.absorbedId);
  if (!survivor || !absorbed) return { error: "One of those applicants no longer exists." };

  const check = resolveMerge(survivor, absorbed, input.keepEmail);
  if (!check.ok) return { error: check.error };

  const { error: rpcError } = await supabase.rpc("merge_recruit_applicants", {
    p_survivor: input.survivorId,
    p_absorbed: input.absorbedId,
    p_absorbed_alias: normalizeName(absorbed.name) || null,
    p_keep_email: input.keepEmail ?? null,
  });
  if (rpcError) return { error: rpcError.message };

  await logAudit(profile.id, "recruit.applicants_merged", survivor.name, `absorbed ${absorbed.name}`);
  revalidateAll();
  return {};
}

export async function undoMergeAction(logId: string): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const supabase = await createClient();
  const { error: rpcError } = await supabase.rpc("undo_merge_recruit_applicants", { p_log_id: logId });
  if (rpcError) return { error: rpcError.message };

  await logAudit(profile.id, "recruit.merge_undone");
  revalidateAll();
  return {};
}

export async function dismissDuplicateAction(aId: string, bId: string): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const [a, b] = pairKey(aId, bId).split(":");
  const supabase = await createClient();
  const { error: upsertError } = await supabase
    .from("recruit_not_duplicates")
    .upsert({ applicant_a: a, applicant_b: b }, { onConflict: "applicant_a,applicant_b" });
  if (upsertError) return { error: upsertError.message };

  revalidateAll();
  return {};
}
