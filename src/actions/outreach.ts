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
import { emailDomain, partitionImport, type SkipReason } from "@/lib/outreach/verify";
import { runPrepare, runSend, type PrepareResult } from "@/lib/outreach/runner";
import { parseOutreachSettings, shouldRestartRamp } from "@/lib/outreach/settings";
import { loadOutreachSettings } from "@/lib/data/outreach";
import { buildDiscoveryDeps } from "@/lib/data/outreach-discovery";
import { normalizeManualEmail } from "@/lib/outreach/discovery/emails";
import { matchFounderToEmail, type Founder } from "@/lib/outreach/discovery/founders";
import { parseCompanyList, type ListError } from "@/lib/outreach/discovery/list";
import { prospectFromYc, runDiscovery, stageLeads, type DiscoveryResult } from "@/lib/outreach/discovery/runner";
import { loadYcDataset } from "@/lib/outreach/discovery/web";
import { factsToJson } from "@/lib/data/outreach";
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

const DISCOVERY_PORTAL_PATH = `${OUTREACH_PORTAL_PATH}/discovery`;

/** Looks at a handful of companies now instead of waiting for the 6am run. Works even while the daily job is switched off. */
export async function runDiscoveryNowAction(): Promise<ActionResult & { result?: DiscoveryResult }> {
  const { error } = await requireExec();
  if (error) return { error };
  try {
    const deps = await buildDiscoveryDeps();
    // A manual run is a deliberate request: ignore the on/off switch, but keep it short enough for one request.
    const result = await runDiscovery({ ...deps, enabled: true, maxAttempts: 25, budgetMs: 45_000 });
    revalidatePath(DISCOVERY_PORTAL_PATH);
    revalidatePath(OUTREACH_PORTAL_PATH);
    return { result };
  } catch (err) {
    console.error("outreach discovery (manual) failed:", err);
    return { error: "Discovery didn't finish. If the discovery table isn't set up yet, run the latest migration, then try again." };
  }
}

/** A company discovery skipped for having no published email, added as a prospect with an address a person found. */
export async function addCandidateEmailAction(candidateId: string, rawEmail: string): Promise<ActionResult> {
  const { profile, error } = await requireExec();
  if (error || !profile) return { error };
  const parsed = normalizeManualEmail(rawEmail);
  if ("error" in parsed) return { error: parsed.error };
  const email = parsed.email;

  const admin = createAdminClient();
  const { data: candidate } = await admin.from("outreach_discovery_candidates").select("*").eq("id", candidateId).maybeSingle();
  if (!candidate) return { error: "That company wasn't found. Refresh the page." };
  if (!["no_email", "unreachable"].includes(candidate.outcome)) return { error: "Only companies skipped for having no email can be added by hand." };

  const [existing, byEmail, byDomain] = await Promise.all([
    admin.from("outreach_prospects").select("id").eq("contact_email", email).limit(1),
    admin.from("outreach_suppressions").select("id").eq("email", email).limit(1),
    admin.from("outreach_suppressions").select("id").eq("domain", emailDomain(email)).limit(1),
  ]);
  if ((existing.data?.length ?? 0) > 0) return { error: "That address is already a prospect." };
  if ((byEmail.data?.length ?? 0) > 0 || (byDomain.data?.length ?? 0) > 0) return { error: "That address is on the do-not-contact list." };

  let company;
  try {
    company = (await loadYcDataset()).find((c) => c.slug === candidate.source_ref);
  } catch {
    return { error: "Couldn't reach the company directory just now. Try again in a minute." };
  }
  if (!company) return { error: "That company is no longer in the directory, so there are no facts to write from." };
  const founders = Array.isArray(candidate.founders) ? (candidate.founders as unknown as Founder[]) : [];
  const prospect = prospectFromYc(company, email, [], matchFounderToEmail(email, founders));
  if (prospect.facts.length === 0) return { error: "There's nothing sourced to say about this company." };

  const { data: created, error: insertError } = await admin
    .from("outreach_prospects")
    .insert({
      company: prospect.company,
      website: prospect.website,
      niche: prospect.niche,
      size_stage: prospect.sizeStage,
      summary: prospect.summary,
      facts: factsToJson(prospect.facts),
      contact_name: prospect.contactName,
      contact_role: prospect.contactRole,
      contact_email: email,
      contact_domain: emailDomain(email),
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION) return { error: "That address is already a prospect." };
    console.error("add candidate email failed:", insertError);
    return { error: "Couldn't add it. Try again." };
  }
  await admin
    .from("outreach_discovery_candidates")
    .update({ outcome: "added", reason: "Email added by hand.", prospect_id: created.id, email, email_source_url: null })
    .eq("id", candidate.id);
  await logAudit(profile.id, "outreach.discovery_email", `${prospect.company} ${email}`);
  revalidatePath(DISCOVERY_PORTAL_PATH);
  revalidatePath(OUTREACH_PORTAL_PATH);
  return {};
}

export interface CompanyListResult {
  /** Companies read and now waiting in the pool. */
  staged?: number;
  skippedKnown?: number;
  /** Companies not reached before time ran out: paste the same list again to carry on. */
  notReached?: number;
  byOutcome?: Record<string, number>;
  problems?: ListError[];
}

/** Reads each pasted company's own website for its published email and facts, and stores the result in the pool. */
export async function addCompanyListAction(text: string): Promise<ActionResult & CompanyListResult> {
  const { error } = await requireExec();
  if (error) return { error };
  if (text.length > 200_000) return { error: "That list is too long. Paste fewer companies at a time." };
  const { leads, errors } = parseCompanyList(text);
  if (leads.length === 0) return { error: errors[0]?.message ?? "No companies found in that list.", problems: errors };
  try {
    const result = await stageLeads(leads, await buildDiscoveryDeps(), { concurrency: 5, budgetMs: 45_000 });
    revalidatePath(DISCOVERY_PORTAL_PATH);
    return { ...result, problems: errors };
  } catch (err) {
    console.error("outreach company list failed:", err);
    return { error: "The list couldn't be read. If the discovery table isn't up to date, run the latest migration, then try again." };
  }
}

export interface OutreachSettingsInput {
  mode: string;
  paused: boolean;
  dailyCapOverride: string;
  windowStartHour: string;
  windowEndHour: string;
  senderName: string;
  fromName: string;
  signature: string;
  postalAddress: string;
  followupDays: string;
  discoveryEnabled: boolean;
  discoveryPerDay: string;
  discoveryMaxTeam: string;
  discoveryRegions: string;
  discoveryIndustries: string;
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
    ["outreach_from_name", input.fromName.trim()],
    ["outreach_signature", input.signature.trim()],
    ["outreach_postal_address", input.postalAddress.trim()],
    ["outreach_followup_days", input.followupDays.trim()],
    ["outreach_discovery_enabled", input.discoveryEnabled ? "true" : "false"],
    ["outreach_discovery_per_day", input.discoveryPerDay.trim()],
    ["outreach_discovery_max_team", input.discoveryMaxTeam.trim()],
    ["outreach_discovery_regions", input.discoveryRegions.trim()],
    ["outreach_discovery_industries", input.discoveryIndustries.trim()],
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

  if (parsed.discoveryPerDay !== Number(input.discoveryPerDay) || input.discoveryPerDay.trim() === "") return { error: "Companies to find per day must be a whole number from 0 to 50." };
  if (parsed.discoveryMaxTeam !== Number(input.discoveryMaxTeam) || input.discoveryMaxTeam.trim() === "") return { error: "The biggest team size must be a whole number of at least 1." };
  if (input.discoveryRegions.trim() === "" || input.discoveryIndustries.trim() === "") return { error: "Add at least one city and one industry for discovery." };
  if (input.signature.length > 600) return { error: "The signature is too long. Keep it under 600 characters." };

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
    // Discovered prospects are created under whoever switched discovery on.
    if (parsed.discoveryEnabled && !previous.discoveryEnabled) await setOutreachSetting(admin, "outreach_discovery_enabled_by", profile.id);
    if (shouldRestartRamp(previous.mode, parsed.mode)) await setOutreachSetting(admin, "outreach_started_on", "");
  } catch (err) {
    console.error("outreach settings save failed:", err);
    return { error: "The settings didn't save. Try again." };
  }
  await logAudit(profile.id, "outreach.settings", `mode ${input.mode}${input.paused ? ", paused" : ""}`);
  revalidatePath(OUTREACH_PORTAL_PATH);
  return {};
}
