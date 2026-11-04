"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import { getOrgTodayDateString } from "@/lib/date";
import { ONBOARDING_MARKS, parseJcLines } from "@/lib/onboarding-attendance";
import { getApplicantRows } from "@/lib/data/recruit";
import { getScoringBundle } from "@/lib/data/recruit-scoring";
import { combinedTotal, meetsCutoff } from "@/lib/recruit";
import type { OnboardingMark } from "@/lib/supabase/database.types";

export interface ActionResult {
  error?: string;
}

const PATH = "/portal/admin/onboarding";

async function requireExec() {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) return { error: "Only exec can do that.", profile } as const;
  return { error: undefined, profile } as const;
}

/** Add JCs from pasted lines ("Name" or "Name, email"). Skips anyone already on the roster. */
export async function addOnboardingJcs(
  quarterId: string,
  text: string,
): Promise<ActionResult & { added?: number; skipped?: number; problems?: string[] }> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };

  const { jcs, problems } = parseJcLines(text);
  if (jcs.length === 0) return { error: problems[0] ?? "Paste at least one name.", problems };

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("onboarding_jcs")
    .select("name, email")
    .eq("quarter_id", quarterId)
    .is("removed_at", null);
  if (readError) return { error: readError.message };

  const have = new Set(existing.map((e) => (e.email ?? e.name).toLowerCase()));
  const fresh = jcs.filter((j) => !have.has((j.email ?? j.name).toLowerCase()));
  if (fresh.length > 0) {
    const { error } = await supabase
      .from("onboarding_jcs")
      .insert(fresh.map((j) => ({ quarter_id: quarterId, name: j.name, email: j.email })));
    if (error) return { error: error.message };
    await logAudit(denied.profile.id, "onboarding.jcs_added", undefined, `${fresh.length} JC(s)`);
  }

  revalidatePath(PATH);
  return { added: fresh.length, skipped: jcs.length - fresh.length, problems };
}

export async function updateOnboardingJc(
  id: string,
  input: { name: string; email: string },
): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };
  const { jcs, problems } = parseJcLines(input.email.trim() ? `${input.name}, ${input.email}` : input.name);
  if (jcs.length !== 1) return { error: problems[0] ?? "Enter a name." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("onboarding_jcs")
    .update({ name: jcs[0].name, email: jcs[0].email })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return {};
}

/** Drop a JC. They leave the roster and future meetings; their past marks are kept. */
export async function removeOnboardingJc(id: string, reason?: string): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("onboarding_jcs")
    .update({ removed_at: new Date().toISOString(), removed_reason: reason?.trim() || null })
    .eq("id", id)
    .select("name")
    .single();
  if (error) return { error: error.message };
  await logAudit(denied.profile.id, "onboarding.jc_removed", data.name, reason?.trim() || null);
  revalidatePath(PATH);
  return {};
}

export async function restoreOnboardingJc(id: string): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("onboarding_jcs")
    .update({ removed_at: null, removed_reason: null })
    .eq("id", id)
    .select("name")
    .single();
  if (error) return { error: error.message };
  await logAudit(denied.profile.id, "onboarding.jc_restored", data.name);
  revalidatePath(PATH);
  return {};
}

/**
 * Full replace of the quarter's onboarding meeting days, except that a day whose attendance
 * was already taken can't be removed (that would erase the record).
 */
export async function setOnboardingDates(quarterId: string, dates: string[]): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };
  const wanted = [...new Set(dates)];
  const supabase = await createClient();

  const { data: current, error: readError } = await supabase
    .from("onboarding_meetings")
    .select("id, date, taken_at")
    .eq("quarter_id", quarterId);
  if (readError) return { error: readError.message };

  const wantedSet = new Set(wanted);
  const removing = current.filter((m) => !wantedSet.has(m.date));
  const locked = removing.filter((m) => m.taken_at);
  if (locked.length > 0) {
    return { error: `Attendance is already taken for ${locked.map((m) => m.date).join(", ")}. Those days can't be removed.` };
  }
  if (removing.length > 0) {
    const { error } = await supabase.from("onboarding_meetings").delete().in("id", removing.map((m) => m.id));
    if (error) return { error: error.message };
  }
  const have = new Set(current.map((m) => m.date));
  const adding = wanted.filter((d) => !have.has(d));
  if (adding.length > 0) {
    const { error } = await supabase
      .from("onboarding_meetings")
      .insert(adding.map((date) => ({ quarter_id: quarterId, date })));
    if (error) return { error: error.message };
  }

  await logAudit(denied.profile.id, "onboarding.dates_updated", undefined, `${wanted.length} meeting day(s) set`);
  revalidatePath(PATH);
  return {};
}

/** Save attendance for one onboarding meeting. Every active JC gets a mark (unmarked = present). */
export async function submitOnboardingAttendance(
  meetingId: string,
  marks: Record<string, OnboardingMark>,
): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };

  const supabase = await createClient();
  const { data: meeting, error: meetingError } = await supabase
    .from("onboarding_meetings")
    .select("id, date, quarter_id")
    .eq("id", meetingId)
    .single();
  if (meetingError) return { error: meetingError.message };
  if (meeting.date > getOrgTodayDateString()) return { error: "Can't take attendance for a future date." };

  const { data: jcs, error: jcError } = await supabase
    .from("onboarding_jcs")
    .select("id")
    .eq("quarter_id", meeting.quarter_id)
    .is("removed_at", null);
  if (jcError) return { error: jcError.message };

  const rows = jcs.map((j) => {
    const mark = marks[j.id] ?? "present";
    return { meeting_id: meetingId, jc_id: j.id, mark: ONBOARDING_MARKS.includes(mark) ? mark : ("present" as const) };
  });

  // Replace marks for the active roster only; a removed JC's old mark for this meeting stays.
  const activeIds = jcs.map((j) => j.id);
  if (activeIds.length > 0) {
    const { error: delError } = await supabase
      .from("onboarding_marks")
      .delete()
      .eq("meeting_id", meetingId)
      .in("jc_id", activeIds);
    if (delError) return { error: delError.message };
    const { error: insError } = await supabase.from("onboarding_marks").insert(rows);
    if (insError) return { error: insError.message };
  }

  const { error: takenError } = await supabase
    .from("onboarding_meetings")
    .update({ taken_by: denied.profile.id, taken_at: new Date().toISOString() })
    .eq("id", meetingId);
  if (takenError) return { error: takenError.message };

  await logAudit(denied.profile.id, "onboarding.attendance_taken", meeting.date, `${rows.length} JC(s)`);
  revalidatePath(PATH);
  return {};
}

/** Absence thresholds. `minRatePercent` is 0-100; 0 turns a rule off. */
export async function updateOnboardingThresholds(input: {
  maxUnexcused: number;
  maxAbsences: number;
  minRatePercent: number;
}): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };
  const whole = (n: number) => Number.isInteger(n) && n >= 0 && n <= 50;
  if (!whole(input.maxUnexcused) || !whole(input.maxAbsences)) {
    return { error: "Absence limits must be whole numbers from 0 to 50." };
  }
  if (!Number.isFinite(input.minRatePercent) || input.minRatePercent < 0 || input.minRatePercent > 100) {
    return { error: "Enter a percentage between 0 and 100." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("org_settings").upsert(
    [
      { key: "onboarding_max_unexcused", value: String(input.maxUnexcused) },
      { key: "onboarding_max_absences", value: String(input.maxAbsences) },
      { key: "onboarding_min_rate", value: String(input.minRatePercent / 100) },
    ],
    { onConflict: "key" },
  );
  if (error) return { error: error.message };
  await logAudit(
    denied.profile.id,
    "settings.onboarding_thresholds_changed",
    undefined,
    `${input.maxUnexcused} unexcused, ${input.maxAbsences} absences, ${input.minRatePercent}% rate`,
  );
  revalidatePath(PATH);
  revalidatePath("/portal/admin/settings");
  return {};
}

/**
 * Pulls everyone at or above a score line from the applicant list into the JC roster, with the
 * name and email already on file. `dryRun` only counts. Skips anyone already on the roster.
 */
export async function importJcsFromApplicants(input: {
  quarterId: string;
  sourceQuarterId: string;
  cutoff: number;
  dryRun?: boolean;
}): Promise<ActionResult & { total?: number; fresh?: number; alreadyOnRoster?: number; noEmail?: number; added?: number }> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };
  if (!Number.isFinite(input.cutoff)) return { error: "Enter the score cutoff as a number." };

  const [rows, bundle] = await Promise.all([
    getApplicantRows(input.sourceQuarterId),
    getScoringBundle(input.sourceQuarterId, denied.profile.id),
  ]);
  const above = rows
    .filter((r) => r.hasApplication)
    .map((r) => ({
      ...r,
      total: combinedTotal(r.total, bundle.summaries.resume[r.id], bundle.summaries.interview[r.id]),
    }))
    .filter((r) => meetsCutoff(r.total, input.cutoff));

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("onboarding_jcs")
    .select("name, email")
    .eq("quarter_id", input.quarterId)
    .is("removed_at", null);
  if (readError) return { error: readError.message };
  const have = new Set(existing.flatMap((e) => [e.name.toLowerCase(), ...(e.email ? [e.email.toLowerCase()] : [])]));

  const fresh = above.filter((r) => {
    const email = r.email?.trim().toLowerCase();
    return !have.has(r.name.trim().toLowerCase()) && !(email && have.has(email));
  });
  const summary = {
    total: above.length,
    fresh: fresh.length,
    alreadyOnRoster: above.length - fresh.length,
    noEmail: fresh.filter((r) => !r.email?.trim()).length,
  };
  if (input.dryRun || fresh.length === 0) return summary;

  const { error } = await supabase.from("onboarding_jcs").insert(
    fresh.map((r) => ({
      quarter_id: input.quarterId,
      name: r.name.trim(),
      email: r.email?.trim().toLowerCase() || null,
    })),
  );
  if (error) return { error: error.message };
  await logAudit(denied.profile.id, "onboarding.jcs_imported", undefined, `${fresh.length} JC(s) at cutoff ${input.cutoff}`);
  revalidatePath(PATH);
  return { ...summary, added: fresh.length };
}
