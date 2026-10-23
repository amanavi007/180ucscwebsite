"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  addSuppression,
  buildPrepareDeps,
  buildSendDeps,
  cancelScheduledMessages,
  insertProspects,
  loadExistingProspectData,
  OUTREACH_PORTAL_PATH,
  outreachEnv,
  recordOutreachEvent,
  setOutreachSetting,
} from "@/lib/data/outreach";
import { parseProspectCsv, type CsvError } from "@/lib/outreach/csv";
import { partitionImport, type SkipReason } from "@/lib/outreach/verify";
import { runPrepare, runSend, type PrepareResult } from "@/lib/outreach/runner";
import { parseOutreachSettings, shouldRestartRamp } from "@/lib/outreach/settings";
import { loadOutreachSettings } from "@/lib/data/outreach";
import { fetchInChunks, runInChunks } from "@/lib/paginate";

export interface ActionResult {
  error?: string;
}

async function requireExec() {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) return { profile: null, error: "Only exec can do that." };
  return { profile, error: undefined };
}

const UNIQUE_VIOLATION = "23505";
const MAX_CSV_CHARS = 2_000_000;

export interface ImportPreview {
  error?: string;
  willImport?: number;
  skipped?: { company: string; email: string; reason: SkipReason }[];
  errors?: CsvError[];
}

async function analyzeCsv(csvText: string) {
  const { rows, errors } = parseProspectCsv(csvText);
  const existing = await loadExistingProspectData();
  return { ...partitionImport(rows, existing), errors };
}

export async function previewImportAction(csvText: string): Promise<ImportPreview> {
  const { error } = await requireExec();
  if (error) return { error };
  if (csvText.length > MAX_CSV_CHARS) return { error: "That file is too large. Split it into smaller files." };
  const { accept, skipped, errors } = await analyzeCsv(csvText);
  return {
    willImport: accept.length,
    skipped: skipped.map((s) => ({ company: s.row.company, email: s.row.contactEmail, reason: s.reason })),
    errors,
  };
}

export async function commitImportAction(csvText: string): Promise<ActionResult & { imported?: number }> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  if (csvText.length > MAX_CSV_CHARS) return { error: "That file is too large. Split it into smaller files." };
  const { accept } = await analyzeCsv(csvText);
  if (accept.length === 0) return { error: "There is nothing new to import." };
  try {
    const imported = await insertProspects(accept, profile.id);
    await logAudit(profile.id, "outreach.import", `${imported} prospects`);
    revalidatePath(OUTREACH_PORTAL_PATH);
    return { imported };
  } catch (err) {
    if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
      return { error: "Someone imported some of these prospects a moment ago. Preview the file again." };
    }
    console.error("outreach import failed:", err);
    return { error: "The import didn't go through. Try again." };
  }
}

export async function stopProspectAction(prospectId: string): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  const admin = createAdminClient();
  await cancelScheduledMessages(admin, prospectId);
  const { error: updateError } = await admin
    .from("outreach_prospects")
    .update({ status: "needs_attention", status_reason: "Stopped by an exec.", next_action_at: null })
    .eq("id", prospectId)
    .not("status", "in", "(replied,booked,unsubscribed,bounced,invalid)");
  if (updateError) return { error: "That didn't save. Try again." };
  await logAudit(profile.id, "outreach.stop", prospectId);
  revalidatePath(OUTREACH_PORTAL_PATH);
  return {};
}

export async function resumeProspectAction(prospectId: string): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  const admin = createAdminClient();
  const { data: prospect } = await admin.from("outreach_prospects").select("step, status").eq("id", prospectId).maybeSingle();
  if (!prospect || prospect.status !== "needs_attention") return { error: "Only stopped prospects can be resumed." };
  const patch =
    prospect.step === 0
      ? { status: "verified", status_reason: null }
      : { status: "sent", status_reason: null, next_action_at: new Date().toISOString() };
  const { error: updateError } = await admin.from("outreach_prospects").update(patch).eq("id", prospectId);
  if (updateError) return { error: "That didn't save. Try again." };
  await logAudit(profile.id, "outreach.resume", prospectId);
  revalidatePath(OUTREACH_PORTAL_PATH);
  return {};
}

export async function doNotContactAction(prospectId: string): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  const admin = createAdminClient();
  const { data: prospect } = await admin.from("outreach_prospects").select("contact_email").eq("id", prospectId).maybeSingle();
  if (!prospect) return { error: "That prospect no longer exists." };
  await addSuppression(admin, prospect.contact_email, "Marked do not contact by an exec.");
  await cancelScheduledMessages(admin, prospectId);
  await admin
    .from("outreach_prospects")
    .update({ status: "unsubscribed", status_reason: "Marked do not contact by an exec.", next_action_at: null })
    .eq("id", prospectId);
  await recordOutreachEvent(admin, { prospectId, kind: "unsubscribed", detail: { by: "exec" } });
  await logAudit(profile.id, "outreach.do_not_contact", prospectId);
  revalidatePath(OUTREACH_PORTAL_PATH);
  return {};
}

export async function regenerateDraftAction(prospectId: string): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  const admin = createAdminClient();
  const { data: prospect } = await admin.from("outreach_prospects").select("step, status").eq("id", prospectId).maybeSingle();
  if (!prospect) return { error: "That prospect no longer exists." };
  if (prospect.step !== 0 || !["drafted", "needs_attention"].includes(prospect.status)) {
    return { error: "Only an unsent first email can be rewritten." };
  }
  await resetForRewrite(admin, [prospectId]);
  revalidatePath(OUTREACH_PORTAL_PATH);
  return {};
}

/** Rewrites several unsent first emails at once. Anyone already sent or not yet drafted is skipped. */
export async function regenerateDraftsAction(prospectIds: string[]): Promise<ActionResult & { rewritten?: number }> {
  const { error } = await requireExec();
  if (error) return { error };
  if (prospectIds.length === 0) return { error: "Select at least one prospect." };
  const admin = createAdminClient();
  const data = await fetchInChunks(prospectIds, (chunk, from, to) =>
    admin
      .from("outreach_prospects")
      .select("id")
      .in("id", chunk)
      .eq("step", 0)
      .in("status", ["drafted", "needs_attention"])
      .order("id")
      .range(from, to),
  );
  const ids = data.map((p) => p.id);
  if (ids.length === 0) return { error: "None of those can be rewritten. Only unsent first emails can." };
  await resetForRewrite(admin, ids);
  revalidatePath(OUTREACH_PORTAL_PATH);
  return { rewritten: ids.length };
}

async function resetForRewrite(admin: ReturnType<typeof createAdminClient>, ids: string[]) {
  await runInChunks(ids, (chunk) =>
    admin.from("outreach_messages").update({ status: "cancelled" }).in("prospect_id", chunk).eq("status", "draft"),
  );
  await runInChunks(ids, (chunk) =>
    admin.from("outreach_prospects").update({ status: "verified", status_reason: null }).in("id", chunk),
  );
}

export async function runPrepareNowAction(): Promise<ActionResult & { result?: PrepareResult }> {
  const { error } = await requireExec();
  if (error) return { error };
  try {
    const result = await runPrepare(await buildPrepareDeps());
    revalidatePath(OUTREACH_PORTAL_PATH);
    return { result };
  } catch (err) {
    console.error("outreach prepare (manual) failed:", err);
    return { error: err instanceof Error && err.message.startsWith("Outreach is not configured") ? err.message : "Drafting didn't finish. Try again in a minute." };
  }
}

/** Test modes only: the daily 8am job is the only other thing that sends, and live sends must stay paced. */
export async function runSendTestNowAction(): Promise<ActionResult & { sent?: number; skipped?: string | null }> {
  const { error } = await requireExec();
  if (error) return { error };
  try {
    const deps = await buildSendDeps();
    if (deps.settings.mode !== "self_only" && deps.settings.mode !== "exec_only") {
      return { error: "Test sends only work in a test mode. Change the mode in Settings." };
    }
    const result = await runSend(deps);
    return { sent: result.scheduled, skipped: result.skipped };
  } catch (err) {
    console.error("outreach send (manual test) failed:", err);
    return { error: err instanceof Error && err.message.startsWith("Outreach is not configured") ? err.message : "The test didn't send. Try again in a minute." };
  }
}

export interface OutreachSettingsInput {
  mode: string;
  paused: boolean;
  dailyCapOverride: string;
  windowStartHour: string;
  windowEndHour: string;
  senderName: string;
  postalAddress: string;
  followupDays: string;
}

export async function updateOutreachSettingsAction(input: OutreachSettingsInput): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };

  const rows = [
    ["outreach_mode", input.mode],
    ["outreach_paused", input.paused ? "true" : "false"],
    ["outreach_daily_cap_override", input.dailyCapOverride.trim()],
    ["outreach_window_start_hour", input.windowStartHour.trim()],
    ["outreach_window_end_hour", input.windowEndHour.trim()],
    ["outreach_sender_name", input.senderName.trim()],
    ["outreach_postal_address", input.postalAddress.trim()],
    ["outreach_followup_days", input.followupDays.trim()],
  ].map(([key, value]) => ({ key, value }));

  // Bad values silently fall back to defaults when read, so reject them here instead.
  const parsed = parseOutreachSettings(rows);
  if (!["off", "dry_run", "self_only", "exec_only", "live"].includes(input.mode)) return { error: "Pick one of the modes." };
  if (parsed.windowStartHour !== Number(input.windowStartHour) || parsed.windowEndHour !== Number(input.windowEndHour)) {
    return { error: "The send window needs whole hours (0 to 23), with the end later than the start." };
  }
  if (input.dailyCapOverride.trim() !== "" && parsed.dailyCapOverride === null) return { error: "The daily limit must be a whole number, or empty." };
  if (parsed.followupDays.join(",") !== input.followupDays.replace(/\s/g, "")) return { error: "Follow-up days must be rising whole numbers like 4, 9, 15." };
  if (!parsed.senderName || !parsed.postalAddress || input.senderName.trim() === "" || input.postalAddress.trim() === "") {
    return { error: "The sender name and postal address can't be empty. Every email must carry a postal address." };
  }

  if (input.mode === "self_only" || input.mode === "exec_only" || input.mode === "live") {
    try {
      outreachEnv(parsed);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Outreach isn't set up yet." };
    }
  }

  const admin = createAdminClient();
  try {
    const previous = await loadOutreachSettings(admin);
    for (const { key, value } of rows) await setOutreachSetting(admin, key, value);
    if (parsed.mode === "self_only") await setOutreachSetting(admin, "outreach_test_recipient", profile.email);
    if (shouldRestartRamp(previous.mode, parsed.mode)) await setOutreachSetting(admin, "outreach_started_on", "");
  } catch (err) {
    console.error("outreach settings save failed:", err);
    return { error: "The settings didn't save. Try again." };
  }
  await logAudit(profile.id, "outreach.settings", `mode ${input.mode}${input.paused ? ", paused" : ""}`);
  revalidatePath(OUTREACH_PORTAL_PATH);
  return {};
}
