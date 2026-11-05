import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";
import { EXEC_ROLES } from "@/lib/auth/roles";
import { CLIENTS } from "@/lib/clients";
import { formatOrgDate } from "@/lib/date";
import { cancelScheduledOutreachEmail, sendOutreachEmail } from "@/lib/email/outreach-send";
import { buildBrakeAlertEmail } from "@/lib/email/outreach-emails";
import { askFor, checkDraft } from "@/lib/outreach/draft";
import { draftWithModel } from "@/lib/outreach/draft-model";
import { CLUB_FACTS } from "@/lib/outreach/club-facts";
import { stepKind } from "@/lib/outreach/sequence";
import { stopAction } from "@/lib/outreach/stop-pending";
import { HEARTBEAT_JOBS, heartbeatKey, jobHealth, lastRunKey, staleSiblings, summarizeRun, type HeartbeatJob, type Heartbeats, type JobHealth } from "@/lib/outreach/heartbeat";
import { attributeBooking } from "@/lib/outreach/booking-attribution";
import { dailyCap, pacificInstant } from "@/lib/outreach/pacing";
import {
  buildFromAddress,
  OUTREACH_SETTING_KEYS,
  parseOutreachSettings,
  replyForwardRecipients,
  type OutreachSettings,
} from "@/lib/outreach/settings";
import { type WebhookHealthDeps } from "@/lib/outreach/webhook-health";
import { checkMx, emailDomain, isFreeMailDomain, type ExistingProspectData } from "@/lib/outreach/verify";
import type {
  MessagePatch,
  PrepareDeps,
  ProspectPatch,
  RunnerEnv,
  RunnerMessage,
  RunnerProspect,
  SendDeps,
} from "@/lib/outreach/runner";
import { toDraftRow } from "@/lib/outreach/runner";
import type { ProspectDraftRow, ProspectFact } from "@/lib/outreach/types";
import { fetchAllPages, fetchInChunks } from "@/lib/paginate";

type Admin = ReturnType<typeof createAdminClient>;
type ProspectRow = Database["public"]["Tables"]["outreach_prospects"]["Row"];

const DAY_MS = 86_400_000;

export const OUTREACH_PORTAL_PATH = "/portal/admin/outreach";

export async function loadOutreachSettings(admin: Admin = createAdminClient()): Promise<OutreachSettings> {
  const { data, error } = await admin.from("org_settings").select("key, value").in("key", OUTREACH_SETTING_KEYS);
  if (error) throw error;
  return parseOutreachSettings(data ?? []);
}

export async function setOutreachSetting(admin: Admin, key: string, value: string) {
  const { error } = await admin.from("org_settings").upsert({ key, value });
  if (error) throw error;
}

function factsFromJson(json: Json): ProspectFact[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((f) => {
    if (f && typeof f === "object" && !Array.isArray(f) && typeof f.text === "string") {
      return [{ text: f.text, sourceUrl: typeof f.source_url === "string" ? f.source_url : "" }];
    }
    return [];
  });
}

export function factsToJson(facts: ProspectFact[]): Json {
  return facts.map((f) => ({ text: f.text, source_url: f.sourceUrl }));
}

function toRunnerProspect(row: ProspectRow, firstSentAt: Date | null): RunnerProspect {
  return {
    id: row.id,
    company: row.company,
    website: row.website,
    niche: row.niche,
    segment: row.segment as RunnerProspect["segment"],
    sizeStage: row.size_stage,
    summary: row.summary,
    whyFit: row.why_fit,
    facts: factsFromJson(row.facts),
    contactName: row.contact_name,
    contactRole: row.contact_role,
    contactEmail: row.contact_email,
    contactDomain: row.contact_domain,
    status: row.status,
    step: row.step,
    nextActionAt: row.next_action_at ? new Date(row.next_action_at) : null,
    firstSentAt,
    bookingToken: row.booking_token,
  };
}

/** The writing rules applied to a stored draft, so a draft written under older rules is never sent. */
function draftProblemsFor(message: Pick<RunnerMessage, "subject" | "bodyText" | "step">, prospect: RunnerProspect): string[] {
  const kind = stepKind(message.step);
  return checkDraft({ subject: message.subject, body: message.bodyText }, toDraftRow(prospect), kind, {
    ask: kind === "first" ? askFor(prospect.company) : undefined,
    clubFacts: CLUB_FACTS,
  }).problems;
}

async function refreshStaleDrafts(admin: Admin): Promise<number> {
  const { data: drafts, error } = await admin
    .from("outreach_messages")
    .select("id, prospect_id, step, subject, body_text")
    .eq("status", "draft")
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  if (!drafts || drafts.length === 0) return 0;
  const rows = await fetchInChunks(
    drafts.map((d) => d.prospect_id),
    (chunk, from, to) => admin.from("outreach_prospects").select("*").in("id", chunk).order("id").range(from, to),
  );
  const prospects = new Map((await runnerProspects(admin, rows)).map((p) => [p.id, p]));
  let refreshed = 0;
  for (const d of drafts) {
    const prospect = prospects.get(d.prospect_id);
    if (!prospect || draftProblemsFor({ subject: d.subject, bodyText: d.body_text, step: d.step }, prospect).length === 0) continue;
    await admin.from("outreach_messages").update({ status: "cancelled" }).eq("id", d.id).eq("status", "draft");
    if (d.step === 0 && prospect.status === "drafted") {
      await admin.from("outreach_prospects").update({ status: "verified", status_reason: null }).eq("id", prospect.id).eq("status", "drafted");
    }
    refreshed++;
  }
  return refreshed;
}

async function runnerProspects(admin: Admin, rows: ProspectRow[]): Promise<RunnerProspect[]> {
  if (rows.length === 0) return [];
  const data = await fetchInChunks(
    rows.map((r) => r.id),
    (chunk, from, to) =>
      admin
        .from("outreach_messages")
        .select("prospect_id, sent_at, scheduled_for")
        .in("prospect_id", chunk)
        .eq("step", 0)
        .in("status", ["scheduled", "sent"])
        .order("id")
        .range(from, to),
  );
  const first = new Map<string, Date>();
  for (const m of data) {
    const at = m.sent_at ?? m.scheduled_for;
    if (at) first.set(m.prospect_id, new Date(at));
  }
  return rows.map((r) => toRunnerProspect(r, first.get(r.id) ?? null));
}

function prospectPatchToRow(patch: ProspectPatch): Database["public"]["Tables"]["outreach_prospects"]["Update"] {
  const row: Database["public"]["Tables"]["outreach_prospects"]["Update"] = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.statusReason !== undefined) row.status_reason = patch.statusReason;
  if (patch.step !== undefined) row.step = patch.step;
  if (patch.nextActionAt !== undefined) row.next_action_at = patch.nextActionAt ? patch.nextActionAt.toISOString() : null;
  if (patch.lastSentAt !== undefined) row.last_sent_at = patch.lastSentAt.toISOString();
  return row;
}

function messagePatchToRow(patch: MessagePatch): Database["public"]["Tables"]["outreach_messages"]["Update"] {
  const row: Database["public"]["Tables"]["outreach_messages"]["Update"] = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.resendId !== undefined) row.resend_id = patch.resendId;
  if (patch.scheduledFor !== undefined) row.scheduled_for = patch.scheduledFor ? patch.scheduledFor.toISOString() : null;
  if (patch.sentAt !== undefined) row.sent_at = patch.sentAt.toISOString();
  if (patch.error !== undefined) row.error = patch.error;
  return row;
}

export function outreachEnv(settings: OutreachSettings, now = new Date()): RunnerEnv {
  const replyTo = process.env.OUTREACH_REPLY_TO ?? "";
  const secret = process.env.OUTREACH_UNSUBSCRIBE_SECRET ?? "";
  const from = process.env.OUTREACH_FROM ?? "";
  if (!replyTo || !secret || !from || !process.env.NEXT_PUBLIC_SITE_URL) {
    throw new Error("Outreach is not configured: set OUTREACH_FROM, OUTREACH_REPLY_TO, OUTREACH_UNSUBSCRIBE_SECRET and NEXT_PUBLIC_SITE_URL.");
  }
  return {
    now,
    settings,
    today: formatOrgDate(now),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    unsubscribeSecret: secret,
    unsubscribeMailto: `unsubscribe@${replyTo.split("@")[1]}`,
    fromAddress: buildFromAddress(from, settings.fromName),
    replyTo,
  };
}

function casDeps(admin: Admin) {
  return {
    casProspect: async (id: string, from: string[], patch: ProspectPatch) => {
      const { data, error } = await admin
        .from("outreach_prospects")
        .update(prospectPatchToRow(patch))
        .eq("id", id)
        .in("status", from) // in-ok: short list of statuses
        .select("id");
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
    casMessage: async (id: string, from: string[], patch: MessagePatch) => {
      const { data, error } = await admin
        .from("outreach_messages")
        .update(messagePatchToRow(patch))
        .eq("id", id)
        .in("status", from) // in-ok: short list of statuses
        .select("id");
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
  };
}

export async function buildPrepareDeps(now = new Date()): Promise<PrepareDeps> {
  const admin = createAdminClient();
  const settings = await loadOutreachSettings(admin);
  return {
    ...outreachEnv(settings, now),
    ...casDeps(admin),
    listProspects: async (statuses, limit, opts) => {
      const base = admin.from("outreach_prospects").select("*").in("status", statuses); // in-ok: short list of statuses
      const { data, error } = await (opts?.dueBy
        ? base.lte("next_action_at", opts.dueBy.toISOString()).order("next_action_at", { ascending: true })
        : base.order("created_at", { ascending: true })
      ).limit(limit);
      if (error) throw error;
      return runnerProspects(admin, data ?? []);
    },
    checkMx: (domain) => checkMx(domain),
    draft: (args) => draftWithModel(args),
    refreshStaleDrafts: () => refreshStaleDrafts(admin),
    insertDraft: async (prospectId, step, draft) => {
      const { error } = await admin
        .from("outreach_messages")
        .insert({ prospect_id: prospectId, step, subject: draft.subject, body_text: draft.body, status: "draft" });
      if (error) throw error;
    },
    hasMessageForStep: async (prospectId, step) => {
      const { count, error } = await admin
        .from("outreach_messages")
        .select("id", { count: "exact", head: true })
        .eq("prospect_id", prospectId)
        .eq("step", step)
        .not("status", "in", "(cancelled,failed)"); // a failed email never went out, so the step still needs one
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    previousSubjects: async (prospectId) => {
      const { data, error } = await admin.from("outreach_messages").select("subject").eq("prospect_id", prospectId);
      if (error) throw error;
      return (data ?? []).map((m) => m.subject);
    },
    recentDraftBodies: async () => {
      const since = new Date(now.getTime() - 14 * DAY_MS).toISOString();
      const { data, error } = await admin
        .from("outreach_messages")
        .select("body_text")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []).map((m) => m.body_text);
    },
    listScheduledDue: async (before) => {
      const { data, error } = await admin
        .from("outreach_messages")
        .select("id, prospect_id, step, scheduled_for")
        .eq("status", "scheduled")
        .lte("scheduled_for", before.toISOString())
        .limit(200);
      if (error) throw error;
      const messages = data ?? [];
      if (messages.length === 0) return [];
      const rows = await fetchInChunks(
        messages.map((m) => m.prospect_id),
        (chunk, from, to) => admin.from("outreach_prospects").select("*").in("id", chunk).order("id").range(from, to),
      );
      const prospects = new Map((await runnerProspects(admin, rows)).map((p) => [p.id, p]));
      return messages.flatMap((m) => {
        const prospect = prospects.get(m.prospect_id);
        return prospect && m.scheduled_for
          ? [{ messageId: m.id, step: m.step, scheduledFor: new Date(m.scheduled_for), prospect }]
          : [];
      });
    },
  };
}

/** Resend's webhook list and repair, using the outreach key (full access is needed to manage webhooks). */
export function buildWebhookHealthDeps(): WebhookHealthDeps {
  const key = process.env.OUTREACH_RESEND_API_KEY;
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  return {
    expectedEndpoint: `${process.env.NEXT_PUBLIC_SITE_URL}/api/webhooks/resend`,
    list: async () => {
      const res = await fetch("https://api.resend.com/webhooks", { headers, cache: "no-store" });
      if (!res.ok) throw new Error(`Resend webhooks list failed: ${res.status}`);
      const body = (await res.json()) as { data?: { id: string; endpoint: string; status: string; events?: string[] }[] };
      return body.data ?? [];
    },
    update: async (id, patch) => {
      const res = await fetch(`https://api.resend.com/webhooks/${id}`, { method: "PATCH", headers, body: JSON.stringify(patch) });
      if (!res.ok) throw new Error(`Resend webhook update failed: ${res.status}`);
    },
    notify: (reason) => alertExecsOfBrake(createAdminClient(), reason),
  };
}

export async function execEmails(admin: Admin = createAdminClient()): Promise<string[]> {
  const { data, error } = await admin.from("profiles").select("email").in("role", EXEC_ROLES);
  if (error) throw error;
  return [...new Set((data ?? []).map((p) => p.email).filter((e): e is string => !!e))];
}

export async function alertExecsOfBrake(admin: Admin, reason: string): Promise<void> {
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const { data } = await admin.from("outreach_events").select("detail").eq("kind", "brake").gte("created_at", since);
  const already = (data ?? []).some((e) => (e.detail as { reason?: string } | null)?.reason === reason);
  if (already) return;
  await admin.from("outreach_events").insert({ kind: "brake", detail: { reason } });
  const to = replyForwardRecipients(await loadOutreachSettings(admin), await execEmails(admin));
  if (to.length === 0) return;
  const portalUrl = `${process.env.NEXT_PUBLIC_SITE_URL}${OUTREACH_PORTAL_PATH}`;
  const email = buildBrakeAlertEmail(reason, portalUrl);
  try {
    await sendOutreachEmail({
      to,
      from: process.env.OUTREACH_FROM ?? "",
      replyTo: process.env.OUTREACH_REPLY_TO ?? "",
      subject: email.subject,
      text: email.text,
      html: email.html,
      headers: {},
    });
  } catch (err) {
    console.error("brake alert email failed:", err);
  }
}

export async function recentHealth(admin: Admin, now = new Date()) {
  const since = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const [sent, bounced, complained] = await Promise.all([
    admin
      .from("outreach_messages")
      .select("id", { count: "exact", head: true })
      .in("status", ["scheduled", "sent"])
      .gte("scheduled_for", since),
    admin.from("outreach_events").select("id", { count: "exact", head: true }).eq("kind", "bounced").gte("created_at", since),
    admin.from("outreach_events").select("id", { count: "exact", head: true }).eq("kind", "complained").gte("created_at", since),
  ]);
  for (const r of [sent, bounced, complained]) if (r.error) throw r.error;
  return { sent: sent.count ?? 0, bounced: bounced.count ?? 0, complained: complained.count ?? 0 };
}

export async function isEmailSuppressed(admin: Admin, email: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  const byEmail = await admin.from("outreach_suppressions").select("id").eq("email", e).limit(1);
  if (byEmail.error) throw byEmail.error;
  if ((byEmail.data?.length ?? 0) > 0) return true;
  const byDomain = await admin.from("outreach_suppressions").select("id").eq("domain", emailDomain(e)).limit(1);
  if (byDomain.error) throw byDomain.error;
  return (byDomain.data?.length ?? 0) > 0;
}

const UNIQUE_VIOLATION = "23505";

/**
 * Adds one row to the do-not-contact list. The unique indexes on email and domain are partial, which PostgREST's
 * `upsert(onConflict)` cannot target (it fails with "no unique or exclusion constraint"), so this inserts and treats
 * "already there" as success. Throws on any other failure: a lost opt-out must be seen, not logged and forgotten.
 */
async function insertSuppression(admin: Admin, row: { email: string } | { domain: string }, reason: string): Promise<void> {
  const { error } = await admin.from("outreach_suppressions").insert({ ...row, reason });
  if (error && error.code !== UNIQUE_VIOLATION) throw error;
}

export async function addSuppression(admin: Admin, email: string, reason: string): Promise<void> {
  await insertSuppression(admin, { email: email.trim().toLowerCase() }, reason);
}

/** A company asked to be left alone: every inbox at its domain is blocked. Free-mail domains are never blocked whole. */
export async function addDomainSuppression(admin: Admin, email: string, reason: string): Promise<void> {
  const domain = emailDomain(email);
  if (!domain || isFreeMailDomain(domain)) return;
  await insertSuppression(admin, { domain }, reason);
}

/**
 * Stops everything still pending for a prospect after a reply, booking or opt-out. Drafts and emails Resend is
 * still holding are cancelled; an email whose time has already passed went out, so it is recorded as sent.
 */
export async function cancelScheduledMessages(admin: Admin, prospectId: string): Promise<void> {
  const now = new Date();
  const { data } = await admin
    .from("outreach_messages")
    .select("id, resend_id, status, scheduled_for")
    .eq("prospect_id", prospectId)
    .in("status", ["scheduled", "draft"]);
  for (const m of data ?? []) {
    const action = stopAction({ status: m.status, scheduledFor: m.scheduled_for ? new Date(m.scheduled_for) : null }, now);
    if (action === "mark_sent") {
      await admin.from("outreach_messages").update({ status: "sent", sent_at: m.scheduled_for }).eq("id", m.id);
    } else if (action === "cancel") {
      if (m.resend_id) await cancelScheduledOutreachEmail(m.resend_id);
      await admin.from("outreach_messages").update({ status: "cancelled" }).eq("id", m.id);
    }
  }
}

export async function recordOutreachEvent(
  admin: Admin,
  event: { prospectId: string | null; messageId?: string | null; kind: string; detail?: Json },
): Promise<void> {
  const { error } = await admin
    .from("outreach_events")
    .insert({ prospect_id: event.prospectId, message_id: event.messageId ?? null, kind: event.kind, detail: event.detail ?? {} });
  if (error) console.error("record outreach event failed:", error.message);
}

export async function buildSendDeps(now = new Date()): Promise<SendDeps> {
  const admin = createAdminClient();
  const settings = await loadOutreachSettings(admin);
  return {
    ...outreachEnv(settings, now),
    ...casDeps(admin),
    draftProblems: draftProblemsFor,
    dueDrafts: async (at, limit) => {
      const { data: drafts, error } = await admin
        .from("outreach_messages")
        .select("id, prospect_id, step, subject, body_text, scheduled_for")
        .eq("status", "draft")
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      if (!drafts || drafts.length === 0) return [];
      const rows = await fetchInChunks(
        drafts.map((d) => d.prospect_id),
        (chunk, from, to) => admin.from("outreach_prospects").select("*").in("id", chunk).order("id").range(from, to),
      );
      const prospects = new Map((await runnerProspects(admin, rows)).map((p) => [p.id, p]));
      const due = [];
      for (const d of drafts) {
        const prospect = prospects.get(d.prospect_id);
        if (!prospect) continue;
        const first = d.step === 0 && prospect.status === "drafted";
        const followUp =
          d.step > 0 &&
          d.step === prospect.step &&
          ["sent", "follow_up_1", "follow_up_2"].includes(prospect.status) &&
          prospect.nextActionAt !== null &&
          prospect.nextActionAt <= at;
        if (!first && !followUp) continue;
        due.push({
          message: { id: d.id, prospectId: d.prospect_id, step: d.step, subject: d.subject, bodyText: d.body_text, scheduledFor: null },
          prospect,
        });
        if (due.length >= limit) break;
      }
      return due;
    },
    isSuppressed: (email) => isEmailSuppressed(admin, email),
    domainBusy: async (domain, excludeId) => {
      const since = new Date(now.getTime() - 7 * DAY_MS).toISOString();
      const { data, error } = await admin
        .from("outreach_prospects")
        .select("id")
        .eq("contact_domain", domain)
        .neq("id", excludeId)
        .or(`status.eq.queued,last_sent_at.gte.${since}`)
        .limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
    countScheduledOrSentToday: async () => {
      const { count, error } = await admin
        .from("outreach_messages")
        .select("id", { count: "exact", head: true })
        .in("status", ["scheduled", "sent"])
        .gte("scheduled_for", pacificInstant(formatOrgDate(now), 0).toISOString());
      if (error) throw error;
      return count ?? 0;
    },
    healthSnapshot: () => recentHealth(admin, now),
    bookingOpen: async () => {
      const { data } = await admin.from("org_settings").select("value").eq("key", "client_meeting_booking_open").maybeSingle();
      return data?.value === "true";
    },
    execEmails: () => execEmails(admin),
    send: (args) => sendOutreachEmail(args),
    setPaused: () => setOutreachSetting(admin, "outreach_paused", "true"),
    setStartedOn: (date) => setOutreachSetting(admin, "outreach_started_on", date),
    notifyBrake: (reason) => alertExecsOfBrake(admin, reason),
  };
}

/** What import needs to know about who is already in the system. */
export async function loadExistingProspectData(): Promise<ExistingProspectData> {
  const supabase = await createClient();
  const [prospects, clients, suppressions] = await Promise.all([
    supabase.from("outreach_prospects").select("contact_email, contact_domain"),
    supabase.from("clients").select("name"),
    supabase.from("outreach_suppressions").select("email, domain"),
  ]);
  for (const r of [prospects, clients, suppressions]) if (r.error) throw r.error;
  return {
    emails: new Set((prospects.data ?? []).map((p) => p.contact_email)),
    companyDomains: new Set((prospects.data ?? []).map((p) => p.contact_domain)),
    clientNames: new Set([...CLIENTS.map((c) => c.name), ...(clients.data ?? []).map((c) => c.name)].map((n) => n.trim().toLowerCase())),
    suppressedEmails: new Set((suppressions.data ?? []).flatMap((s) => (s.email ? [s.email] : []))),
    suppressedDomains: new Set((suppressions.data ?? []).flatMap((s) => (s.domain ? [s.domain] : []))),
  };
}

/**
 * Same as loadExistingProspectData, for callers with no signed-in exec (the agent API). Reads with the service role and
 * pages through every row, since the agent dedupes against all of them.
 */
export async function loadExistingProspectDataAdmin(admin: Admin = createAdminClient()): Promise<ExistingProspectData> {
  const [prospects, clients, suppressions] = await Promise.all([
    fetchAllPages((from, to) => admin.from("outreach_prospects").select("contact_email, contact_domain").order("id").range(from, to)),
    fetchAllPages((from, to) => admin.from("clients").select("name").order("id").range(from, to)),
    fetchAllPages((from, to) => admin.from("outreach_suppressions").select("email, domain").order("id").range(from, to)),
  ]);
  return {
    emails: new Set(prospects.map((p) => p.contact_email)),
    companyDomains: new Set(prospects.map((p) => p.contact_domain)),
    clientNames: new Set([...CLIENTS.map((c) => c.name), ...clients.map((c) => c.name)].map((n) => n.trim().toLowerCase())),
    suppressedEmails: new Set(suppressions.flatMap((s) => (s.email ? [s.email] : []))),
    suppressedDomains: new Set(suppressions.flatMap((s) => (s.domain ? [s.domain] : []))),
  };
}

function prospectInsertRow(r: ProspectDraftRow, createdBy: string): Database["public"]["Tables"]["outreach_prospects"]["Insert"] {
  return {
    company: r.company,
    website: r.website,
    niche: r.niche,
    segment: r.segment ?? null,
    size_stage: r.sizeStage,
    summary: r.summary,
    why_fit: r.whyFit,
    facts: factsToJson(r.facts),
    contact_name: r.contactName,
    contact_role: r.contactRole,
    contact_email: r.contactEmail,
    contact_domain: emailDomain(r.contactEmail),
    created_by: createdBy,
  };
}

/**
 * Adds prospects with the service role. Returns each address with its new id, or null when that address already exists
 * (someone added it between the check and the insert). One taken address never blocks the rest.
 */
export async function insertProspectsAdmin(rows: ProspectDraftRow[], createdBy: string, admin: Admin = createAdminClient()): Promise<{ email: string; id: string | null }[]> {
  if (rows.length === 0) return [];
  const all = await admin.from("outreach_prospects").insert(rows.map((r) => prospectInsertRow(r, createdBy))).select("id, contact_email");
  if (!all.error) return (all.data ?? []).map((p) => ({ email: p.contact_email, id: p.id }));
  if (all.error.code !== UNIQUE_VIOLATION) throw all.error;
  // The batch insert is all-or-nothing, so retry one by one to find which address was taken.
  const out: { email: string; id: string | null }[] = [];
  for (const r of rows) {
    const one = await admin.from("outreach_prospects").insert(prospectInsertRow(r, createdBy)).select("id").single();
    if (one.error && one.error.code !== UNIQUE_VIOLATION) throw one.error;
    out.push({ email: r.contactEmail, id: one.data?.id ?? null });
  }
  return out;
}

/**
 * A discovery candidate that was missing an email becomes a prospect, and is marked added. Works for any candidate
 * (a directory company or a pasted/researched one): the prospect is built by the caller from what is stored on the
 * candidate plus whatever was just found. `duplicate` means the address already belongs to another prospect.
 */
export async function promoteCandidate(
  candidateId: string,
  prospect: ProspectDraftRow,
  createdBy: string,
  opts: { reason?: string; emailSourceUrl?: string | null } = {},
  admin: Admin = createAdminClient(),
): Promise<{ prospectId: string } | { duplicate: true }> {
  const { data: created, error } = await admin.from("outreach_prospects").insert(prospectInsertRow(prospect, createdBy)).select("id").single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { duplicate: true };
    throw error;
  }
  const { error: updateError } = await admin
    .from("outreach_discovery_candidates")
    .update({
      outcome: "added",
      reason: opts.reason ?? "Email added by hand.",
      prospect_id: created.id,
      email: prospect.contactEmail,
      email_source_url: opts.emailSourceUrl ?? null,
      segment: prospect.segment ?? null,
      agent_claimed_at: null,
      agent_claim_token: null,
    })
    .eq("id", candidateId);
  if (updateError) throw updateError;
  return { prospectId: created.id };
}

export async function insertProspects(rows: ProspectDraftRow[], createdBy: string): Promise<number> {
  if (rows.length === 0) return 0;
  const supabase = await createClient();
  const { error } = await supabase.from("outreach_prospects").insert(
    rows.map((r) => ({
      company: r.company,
      website: r.website,
      niche: r.niche,
      segment: r.segment ?? null,
      size_stage: r.sizeStage,
      summary: r.summary,
      why_fit: r.whyFit,
      facts: factsToJson(r.facts),
      contact_name: r.contactName,
      contact_role: r.contactRole,
      contact_email: r.contactEmail,
      contact_domain: emailDomain(r.contactEmail),
      created_by: createdBy,
    })),
  );
  if (error) throw error;
  return rows.length;
}

/** Opt-out: the address goes on the permanent do-not-contact list and nothing more is sent. Safe to repeat. */
export async function unsubscribeProspect(prospectId: string, reason = "Unsubscribed from an email."): Promise<void> {
  const admin = createAdminClient();
  const { data: prospect } = await admin.from("outreach_prospects").select("contact_email").eq("id", prospectId).maybeSingle();
  if (!prospect) return;
  await addSuppression(admin, prospect.contact_email, reason);
  await addDomainSuppression(admin, prospect.contact_email, reason);
  await cancelScheduledMessages(admin, prospectId);
  await admin
    .from("outreach_prospects")
    .update({ status: "unsubscribed", status_reason: reason, next_action_at: null })
    .eq("id", prospectId);
  await recordOutreachEvent(admin, { prospectId, kind: "unsubscribed", detail: { reason } });
}

/** Called after a successful intro-call booking. Safe to call for any booking; non-outreach bookings match nothing. */
export async function markProspectBooked(args: { leadToken?: string | null; email: string }): Promise<void> {
  const admin = createAdminClient();
  await attributeBooking(args, {
    findByToken: async (token) => {
      const { data } = await admin.from("outreach_prospects").select("id").eq("booking_token", token).maybeSingle();
      return data;
    },
    findByEmail: async (email) => {
      const { data } = await admin.from("outreach_prospects").select("id").eq("contact_email", email).maybeSingle();
      return data;
    },
    markBooked: async (id) => {
      await admin
        .from("outreach_prospects")
        .update({ status: "booked", status_reason: null, next_action_at: null })
        .eq("id", id)
        .not("status", "in", "(unsubscribed,bounced)");
      await cancelScheduledMessages(admin, id);
      await recordOutreachEvent(admin, { prospectId: id, kind: "booked" });
    },
  });
}

/** How many outreach prospects replied, and how many were stopped for a human look. For the Admin Today list. */
export async function getOutreachAttentionCounts(): Promise<{ replies: number; needsAttention: number }> {
  const supabase = await createClient();
  const count = async (status: string) => {
    const { count: n, error } = await supabase.from("outreach_prospects").select("id", { count: "exact", head: true }).eq("status", status);
    if (error) throw error;
    return n ?? 0;
  };
  const [replies, needsAttention] = await Promise.all([count("replied"), count("needs_attention")]);
  return { replies, needsAttention };
}

export interface ProspectView {
  id: string;
  company: string;
  website: string | null;
  niche: string | null;
  sizeStage: string | null;
  summary: string | null;
  whyFit: string | null;
  facts: ProspectFact[];
  contactName: string | null;
  contactRole: string | null;
  contactEmail: string;
  status: string;
  statusReason: string | null;
  step: number;
  nextActionAt: string | null;
  lastSentAt: string | null;
}

export interface MessageView {
  id: string;
  prospectId: string;
  step: number;
  subject: string;
  bodyText: string;
  status: string;
  scheduledFor: string | null;
  sentAt: string | null;
  error: string | null;
}

export interface ReplyView {
  id: string;
  prospectId: string | null;
  fromEmail: string;
  subject: string;
  snippet: string;
  classification: string;
  createdAt: string;
}

export interface EventView {
  id: string;
  prospectId: string;
  kind: string;
  createdAt: string;
}

export interface OutreachOverview {
  prospects: ProspectView[];
  messages: MessageView[];
  replies: ReplyView[];
  events: EventView[];
  settings: OutreachSettings;
  health: { sent: number; bounced: number; complained: number };
  sentToday: number;
  cap: number;
  bookingOpen: boolean;
  /** When each daily job last ran, and whether that is on time. */
  jobs: Record<HeartbeatJob, JobHealth>;
  /** What each job did on its last run. */
  jobSummaries: Record<HeartbeatJob, string | null>;
}

/** Everything the Outreach screen needs, read as the signed-in exec (RLS keeps everyone else out). */
export async function getOutreachOverview(now = new Date()): Promise<OutreachOverview> {
  const supabase = await createClient();
  // Every row, a page at a time: a plain select stops at 1,000 rows, and the oldest prospects (often the ones that replied) would silently vanish.
  const [prospectRows, messageRows, replyRows, eventRows, settingRows, booking] = await Promise.all([
    fetchAllPages((from, to) => supabase.from("outreach_prospects").select("*").order("created_at", { ascending: false }).order("id").range(from, to)),
    fetchAllPages((from, to) => supabase.from("outreach_messages").select("*").order("step", { ascending: true }).order("id").range(from, to)),
    fetchAllPages((from, to) => supabase.from("outreach_replies").select("*").order("created_at", { ascending: false }).order("id").range(from, to)),
    fetchAllPages((from, to) => supabase.from("outreach_events").select("id, prospect_id, kind, created_at").order("created_at", { ascending: false }).order("id").range(from, to)),
    supabase.from("org_settings").select("key, value").in("key", [...OUTREACH_SETTING_KEYS, ...HEARTBEAT_JOBS.map(heartbeatKey), ...HEARTBEAT_JOBS.map(lastRunKey)]),
    supabase.from("org_settings").select("value").eq("key", "client_meeting_booking_open").maybeSingle(),
  ]);
  if (settingRows.error) throw settingRows.error;
  const prospects = { data: prospectRows };
  const messages = { data: messageRows };
  const replies = { data: replyRows };
  const events = { data: eventRows };

  const settings = parseOutreachSettings(settingRows.data ?? []);
  const today = formatOrgDate(now);
  const since7 = now.getTime() - 7 * DAY_MS;
  const startOfToday = pacificInstant(today, 0).getTime();
  const msgs = messages.data ?? [];
  const evs = events.data ?? [];
  const inWindow = (iso: string | null, from: number) => !!iso && new Date(iso).getTime() >= from;
  const beats = Object.fromEntries(HEARTBEAT_JOBS.map((job) => [job, (settingRows.data ?? []).find((r) => r.key === heartbeatKey(job))?.value || null])) as Heartbeats;
  const oldestProspectAt = (prospects.data ?? []).reduce<string | null>((oldest, p) => (oldest === null || p.created_at < oldest ? p.created_at : oldest), null);
  const jobs = Object.fromEntries(HEARTBEAT_JOBS.map((job) => [job, jobHealth(now, beats[job], { mode: job === "agent" && !settings.agentEnabled ? "off" : settings.mode, oldestProspectAt, job })])) as Record<HeartbeatJob, JobHealth>;

  return {
    prospects: (prospects.data ?? []).map((p) => ({
      id: p.id,
      company: p.company,
      website: p.website,
      niche: p.niche,
      sizeStage: p.size_stage,
      summary: p.summary,
      whyFit: p.why_fit,
      facts: factsFromJson(p.facts),
      contactName: p.contact_name,
      contactRole: p.contact_role,
      contactEmail: p.contact_email,
      status: p.status,
      statusReason: p.status_reason,
      step: p.step,
      nextActionAt: p.next_action_at,
      lastSentAt: p.last_sent_at,
    })),
    messages: msgs.map((m) => ({
      id: m.id,
      prospectId: m.prospect_id,
      step: m.step,
      subject: m.subject,
      bodyText: m.body_text,
      status: m.status,
      scheduledFor: m.scheduled_for,
      sentAt: m.sent_at,
      error: m.error,
    })),
    replies: (replies.data ?? []).map((r) => ({
      id: r.id,
      prospectId: r.prospect_id,
      fromEmail: r.from_email,
      subject: r.subject,
      snippet: r.snippet,
      classification: r.classification,
      createdAt: r.created_at,
    })),
    events: evs.flatMap((e) => (e.prospect_id ? [{ id: e.id, prospectId: e.prospect_id, kind: e.kind, createdAt: e.created_at }] : [])),
    settings,
    health: {
      sent: msgs.filter((m) => ["scheduled", "sent"].includes(m.status) && inWindow(m.scheduled_for, since7)).length,
      bounced: evs.filter((e) => e.kind === "bounced" && inWindow(e.created_at, since7)).length,
      complained: evs.filter((e) => e.kind === "complained" && inWindow(e.created_at, since7)).length,
    },
    sentToday: msgs.filter((m) => ["scheduled", "sent"].includes(m.status) && inWindow(m.scheduled_for, startOfToday)).length,
    cap: dailyCap(settings.startedOn, today, settings.dailyCapOverride),
    bookingOpen: booking.data?.value === "true",
    jobs,
    jobSummaries: Object.fromEntries(HEARTBEAT_JOBS.map((job) => [job, (settingRows.data ?? []).find((r) => r.key === lastRunKey(job))?.value || null])) as Record<HeartbeatJob, string | null>,
  };
}

/** Records that a daily job finished, and emails the execs if one of the other jobs has gone quiet. Never throws: it must not fail the job. */
export async function recordJobRun(job: HeartbeatJob, now = new Date(), result?: unknown): Promise<void> {
  try {
    const admin = createAdminClient();
    await setOutreachSetting(admin, heartbeatKey(job), now.toISOString());
    if (result !== undefined) await setOutreachSetting(admin, lastRunKey(job), summarizeRun(job, result));
    const { data } = await admin.from("org_settings").select("key, value").in("key", HEARTBEAT_JOBS.map(heartbeatKey));
    const beats = Object.fromEntries(HEARTBEAT_JOBS.map((j) => [j, (data ?? []).find((r) => r.key === heartbeatKey(j))?.value || null])) as Heartbeats;
    // A switched-off agent is not "dead": it is not expected to report.
    if (!(await loadOutreachSettings(admin)).agentEnabled) beats.agent = null;
    for (const stale of staleSiblings(now, beats, job)) await alertExecsOfBrake(admin, `job_stale_${stale}`);
  } catch (err) {
    console.error("outreach heartbeat failed:", err);
  }
}
