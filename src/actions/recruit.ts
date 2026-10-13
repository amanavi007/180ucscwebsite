"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import { getMatchableApplicants } from "@/lib/data/recruit";
import { getAwardedApplicantIds, getImportContext } from "@/lib/data/recruit-import";
import {
  isPlausibleEmail,
  normalizeApplicantEmail,
  resolveMerge,
  validateAward,
  type RecruitSection,
} from "@/lib/recruit";
import { findMatches, normalizeName, pairKey, type MatchClass } from "@/lib/recruit-matching";
import { cleanDisplayName, parseAttendeeInput, reviewImport, type CommitRow, type ReviewRow } from "@/lib/recruit-import";
import { validateScore, type Stage } from "@/lib/recruit-scoring";
import { RECRUIT_SETTING_KEYS, validateRecruitSettings, type RecruitSettings } from "@/lib/recruit-settings";
import { NO_SHOW_DEFAULT_REASON, systemKeyFor, type AttendanceStatus, type BookingKind } from "@/lib/recruit-attendance";

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

/** The same email's live applicant record from an earlier quarter, for the "Previously applied" note. */
async function findPreviousApplicantId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  email: string | null,
  quarterId: string,
): Promise<string | null> {
  if (!email) return null;
  const { data } = await supabase
    .from("recruit_applicants")
    .select("id")
    .eq("email", email)
    .neq("quarter_id", quarterId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0]?.id ?? null;
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
  const previousId = await findPreviousApplicantId(supabase, email, input.quarterId);

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
  input: { name: string; email?: string; major?: string; year?: string; notes: string; applicationLink?: string },
): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const name = input.name.trim();
  if (!name) return { error: "Enter the applicant's name." };
  const email = normalizeApplicantEmail(input.email);
  if (email && !isPlausibleEmail(email)) return { error: "That email doesn't look right." };
  const applicationLink = cleanText(input.applicationLink);
  if (applicationLink && !/^https?:\/\//i.test(applicationLink)) {
    return { error: "The application link should start with http:// or https://." };
  }

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("recruit_applicants")
    .update({
      name,
      email,
      major: cleanText(input.major),
      year: cleanText(input.year),
      notes: input.notes,
      application_link: applicationLink,
    })
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
}): Promise<ActionResult & { eventId?: string }> {
  const { error } = await requireExec();
  if (error) return { error };
  if (!input.name.trim()) return { error: "Give the event a name." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Pick the event's date." };

  const supabase = await createClient();
  const { data, error: insertError } = await supabase
    .from("recruit_events")
    .insert({
      quarter_id: input.quarterId,
      category_id: input.categoryId,
      name: input.name.trim(),
      date: input.date,
    })
    .select("id")
    .single();
  if (insertError) return { error: insertError.message };

  revalidateAll();
  return { eventId: data.id };
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

export async function reviewImportAction(input: {
  quarterId: string;
  text: string;
  eventId: string | null;
  minMinutes: number;
}): Promise<{ error?: string; rows?: ReviewRow[]; applicants?: { id: string; name: string; email: string | null }[] }> {
  const { error } = await requireExec();
  if (error) return { error };

  const attendees = parseAttendeeInput(input.text);
  if (attendees.length === 0) {
    return { error: "Couldn't find any names in that. Paste one name per line or upload a Zoom CSV." };
  }

  const [context, awarded] = await Promise.all([
    getImportContext(input.quarterId),
    input.eventId ? getAwardedApplicantIds(input.eventId) : Promise.resolve(new Set<string>()),
  ]);

  const rows = reviewImport(attendees, {
    applicants: context.applicants,
    ignoredNames: context.ignoredNames,
    memberNames: context.memberNames,
    awardedApplicantIds: awarded,
    minMinutes: Number.isFinite(input.minMinutes) ? Math.max(0, input.minMinutes) : 10,
  });
  return {
    rows,
    applicants: context.applicants
      .map((a) => ({ id: a.id, name: a.name, email: a.email }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function commitImportAction(input: {
  quarterId: string;
  eventId: string | null;
  categoryId: string;
  points: number;
  rows: CommitRow[];
}): Promise<ActionResult & { batchId?: string; created?: number; awarded?: number; skipped?: number }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  if (!Number.isFinite(input.points)) return { error: "Enter the points as a number." };
  if (input.rows.length === 0) return { error: "Nothing to import — every row was skipped." };

  const supabase = await createClient();
  const { data: category, error: categoryError } = await supabase
    .from("recruit_categories")
    .select("archived_at, name")
    .eq("id", input.categoryId)
    .maybeSingle();
  if (categoryError) return { error: categoryError.message };
  if (!category || category.archived_at) return { error: "That category is archived — pick another one." };

  const { data, error: rpcError } = await supabase.rpc("commit_recruit_import", {
    p_quarter: input.quarterId,
    p_event: input.eventId,
    p_category: input.categoryId,
    p_points: input.points,
    p_rows: input.rows,
  });
  if (rpcError) return { error: rpcError.message };

  const result = data as { batchId: string; created: number; awarded: number; skipped: number };
  await logAudit(
    profile.id,
    "recruit.import_committed",
    category.name,
    `${result.awarded} awarded, ${result.created} new applicants, ${result.skipped} skipped`,
  );
  revalidateAll();
  return { batchId: result.batchId, created: result.created, awarded: result.awarded, skipped: result.skipped };
}

export async function undoImportAction(batchId: string): Promise<ActionResult & { voided?: number }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const supabase = await createClient();
  const { data, error: rpcError } = await supabase.rpc("undo_recruit_import", { p_batch: batchId });
  if (rpcError) return { error: rpcError.message };

  await logAudit(profile.id, "recruit.import_undone", null, `${data} entries voided`);
  revalidateAll();
  return { voided: data as number };
}

export async function markBookingAction(input: {
  quarterId: string;
  kind: BookingKind;
  bookingId: string;
  status: AttendanceStatus;
  resolution?: { applicantId?: string; createNew?: boolean };
}): Promise<ActionResult & { needsPick?: { applicantId: string; name: string; email: string | null; score: number }[] }> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  const table = input.kind === "coffee_chat" ? "coffee_chat_bookings" : "interview_bookings";
  const { data: booking, error: bookingError } = await supabase
    .from(table)
    .select("applicant_name, applicant_email")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (bookingError) return { error: bookingError.message };
  if (!booking) return { error: "That booking no longer exists." };

  const existing = await getMatchableApplicants(input.quarterId);
  const byId = new Map(existing.map((a) => [a.id, a]));
  const email = normalizeApplicantEmail(booking.applicant_email);
  const matches = findMatches({ name: booking.applicant_name, email }, existing);

  let applicantId: string | null = null;
  const emailHit = matches.find((m) => m.kind === "duplicate");
  if (emailHit) {
    applicantId = emailHit.applicantId;
  } else if (input.resolution?.applicantId && byId.has(input.resolution.applicantId)) {
    applicantId = input.resolution.applicantId;
    const alias = normalizeName(booking.applicant_name);
    if (alias) {
      await supabase
        .from("recruit_applicant_aliases")
        .upsert(
          { applicant_id: applicantId, quarter_id: input.quarterId, alias },
          { onConflict: "quarter_id,alias", ignoreDuplicates: true },
        );
    }
  } else if (!input.resolution?.createNew && matches.length > 0) {
    return {
      needsPick: matches.map((m) => ({
        applicantId: m.applicantId,
        name: byId.get(m.applicantId)?.name ?? "Unknown",
        email: byId.get(m.applicantId)?.email ?? null,
        score: m.score,
      })),
    };
  }

  if (!applicantId) {
    const previousId = await findPreviousApplicantId(supabase, email, input.quarterId);
    const { data: created, error: createError } = await supabase
      .from("recruit_applicants")
      .insert({
        quarter_id: input.quarterId,
        name: cleanDisplayName(booking.applicant_name),
        email,
        previous_applicant_id: previousId,
      })
      .select("id")
      .single();
    if (createError) return { error: createError.message };
    applicantId = created.id;
  }

  let categoryId: string | null = null;
  let points: number | null = null;
  let reason: string | null = null;
  const key = systemKeyFor(input.kind, input.status);
  if (key) {
    const { data: category, error: categoryError } = await supabase
      .from("recruit_categories")
      .select("id, default_points")
      .eq("system_key", key)
      .maybeSingle();
    if (categoryError) return { error: categoryError.message };
    if (!category) return { error: "The automatic points category is missing — check the Setup tab." };
    categoryId = category.id;
    points = Number(category.default_points);
    reason = input.status === "no_show" ? NO_SHOW_DEFAULT_REASON : null;
  }

  const { error: rpcError } = await supabase.rpc("mark_recruit_booking", {
    p_kind: input.kind,
    p_booking: input.bookingId,
    p_applicant: applicantId,
    p_status: input.status,
    p_category: categoryId,
    p_points: points,
    p_reason: reason,
  });
  if (rpcError) return { error: rpcError.message };

  revalidateAll();
  return {};
}

export async function clearBookingMarkAction(kind: BookingKind, bookingId: string): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  const { error: rpcError } = await supabase.rpc("clear_recruit_booking_mark", { p_kind: kind, p_booking: bookingId });
  if (rpcError) return { error: rpcError.message };

  revalidateAll();
  return {};
}

const STAGE_VALUES: Stage[] = ["resume", "interview"];

export async function saveReviewAction(input: {
  applicantId: string;
  stage: Stage;
  scores: Record<string, number>;
  comment: string;
  submit: boolean;
}): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  if (!STAGE_VALUES.includes(input.stage)) return { error: "Unknown stage." };

  const supabase = await createClient();
  const { data: applicant, error: applicantError } = await supabase
    .from("recruit_applicants")
    .select("id, archived_at")
    .eq("id", input.applicantId)
    .maybeSingle();
  if (applicantError) return { error: applicantError.message };
  if (!applicant || applicant.archived_at) {
    return { error: "That applicant was merged or removed — refresh the page." };
  }

  if (input.stage === "interview") {
    const { count, error: linkError } = await supabase
      .from("recruit_booking_links")
      .select("id", { count: "exact", head: true })
      .eq("booking_kind", "interview")
      .eq("status", "attended")
      .eq("applicant_id", input.applicantId);
    if (linkError) return { error: linkError.message };
    if ((count ?? 0) === 0) return { error: "Only applicants marked as having attended their interview can be scored." };
  }

  if (input.stage === "resume") {
    const { count, error: assignError } = await supabase
      .from("recruit_review_assignments")
      .select("id", { count: "exact", head: true })
      .eq("applicant_id", input.applicantId)
      .eq("reviewer_id", profile.id)
      .eq("stage", "resume");
    if (assignError) return { error: assignError.message };
    if ((count ?? 0) === 0) return { error: "That applicant isn't assigned to you." };
  }

  const { data: rubric, error: rubricError } = await supabase
    .from("recruit_rubrics")
    .select("id, scale_min, scale_max")
    .eq("stage", input.stage)
    .maybeSingle();
  if (rubricError) return { error: rubricError.message };
  if (!rubric) return { error: "The rubric for this stage is missing." };

  const { data: criteria, error: criteriaError } = await supabase
    .from("recruit_rubric_criteria")
    .select("id, archived_at")
    .eq("rubric_id", rubric.id);
  if (criteriaError) return { error: criteriaError.message };
  const active = new Set((criteria ?? []).filter((c) => !c.archived_at).map((c) => c.id));

  const entries = Object.entries(input.scores);
  for (const [criterionId, score] of entries) {
    if (!active.has(criterionId)) return { error: "One of those criteria was archived or removed — refresh the page." };
    const problem = validateScore(score, Number(rubric.scale_min), Number(rubric.scale_max));
    if (problem) return { error: problem };
  }
  if (input.submit && entries.length < active.size) {
    return { error: "Score every criterion before submitting, or save a draft." };
  }

  const { data: review, error: reviewError } = await supabase
    .from("recruit_reviews")
    .upsert(
      {
        applicant_id: input.applicantId,
        stage: input.stage,
        reviewer_id: profile.id,
        comment: input.comment,
        ...(input.submit ? { submitted_at: new Date().toISOString() } : {}),
      },
      { onConflict: "applicant_id,stage,reviewer_id" },
    )
    .select("id")
    .single();
  if (reviewError) return { error: reviewError.message };

  if (entries.length > 0) {
    const { error: scoreError } = await supabase.from("recruit_review_scores").upsert(
      entries.map(([criterionId, score]) => ({ review_id: review.id, criterion_id: criterionId, score })),
      { onConflict: "review_id,criterion_id" },
    );
    if (scoreError) return { error: scoreError.message };
  }

  revalidateAll();
  return {};
}

function validateCriterionInput(input: { name: string; weight: number }): string | null {
  if (!input.name.trim()) return "Give the criterion a name.";
  if (!Number.isFinite(input.weight) || input.weight < 0) return "The weight has to be 0 or more.";
  return null;
}

export async function createCriterionAction(input: {
  stage: Stage;
  name: string;
  description: string;
  weight: number;
}): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };
  const problem = validateCriterionInput(input);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { data: rubric } = await supabase.from("recruit_rubrics").select("id").eq("stage", input.stage).maybeSingle();
  if (!rubric) return { error: "The rubric for this stage is missing." };
  const { data: last } = await supabase
    .from("recruit_rubric_criteria")
    .select("sort_order")
    .eq("rubric_id", rubric.id)
    .order("sort_order", { ascending: false })
    .limit(1);

  const { error: insertError } = await supabase.from("recruit_rubric_criteria").insert({
    rubric_id: rubric.id,
    name: input.name.trim(),
    description: input.description.trim(),
    weight: input.weight,
    sort_order: (last?.[0]?.sort_order ?? 0) + 10,
  });
  if (insertError) return { error: insertError.message };
  revalidateAll();
  return {};
}

export async function updateCriterionAction(
  id: string,
  input: { name: string; description: string; weight: number },
): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };
  const problem = validateCriterionInput(input);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("recruit_rubric_criteria")
    .update({ name: input.name.trim(), description: input.description.trim(), weight: input.weight })
    .eq("id", id);
  if (updateError) return { error: updateError.message };
  revalidateAll();
  return {};
}

export async function setCriterionArchivedAction(id: string, archived: boolean): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("recruit_rubric_criteria")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  if (updateError) return { error: updateError.message };
  revalidateAll();
  return {};
}

export async function reorderCriteriaAction(orderedIds: string[]): Promise<ActionResult> {
  const { error } = await requireExec();
  if (error) return { error };

  const supabase = await createClient();
  for (const [index, id] of orderedIds.entries()) {
    const { error: updateError } = await supabase
      .from("recruit_rubric_criteria")
      .update({ sort_order: (index + 1) * 10 })
      .eq("id", id);
    if (updateError) return { error: updateError.message };
  }
  revalidateAll();
  return {};
}

export async function updateRubricScaleAction(
  stage: Stage,
  input: { scaleMin: number; scaleMax: number },
): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  if (!Number.isFinite(input.scaleMin) || !Number.isFinite(input.scaleMax)) return { error: "Enter the scale as numbers." };
  if (input.scaleMax <= input.scaleMin) return { error: "The top of the scale has to be higher than the bottom." };
  if (input.scaleMax - input.scaleMin > 20) return { error: "Keep the scale to 20 steps or fewer." };

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("recruit_rubrics")
    .update({ scale_min: input.scaleMin, scale_max: input.scaleMax })
    .eq("stage", stage);
  if (updateError) return { error: updateError.message };

  await logAudit(profile.id, "recruit.rubric_scale_changed", stage, `${input.scaleMin}–${input.scaleMax}`);
  revalidateAll();
  return {};
}

export async function updateRecruitSettingsAction(partial: Partial<RecruitSettings>): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  const problem = validateRecruitSettings(partial);
  if (problem) return { error: problem };

  const rows = (Object.keys(partial) as (keyof RecruitSettings)[])
    .filter((k) => partial[k] !== undefined)
    .map((k) => ({ key: RECRUIT_SETTING_KEYS[k], value: String(partial[k]) }));
  if (rows.length === 0) return {};

  const supabase = await createClient();
  const { error: upsertError } = await supabase.from("org_settings").upsert(rows, { onConflict: "key" });
  if (upsertError) return { error: upsertError.message };

  await logAudit(profile.id, "recruit.settings_changed", null, rows.map((r) => `${r.key}=${r.value}`).join(", "));
  revalidateAll();
  return {};
}
