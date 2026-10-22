import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";
import { EXEC_ROLES } from "@/lib/auth/roles";
import { CLIENTS } from "@/lib/clients";
import { formatOrgDate } from "@/lib/date";
import { cancelScheduledOutreachEmail, sendOutreachEmail } from "@/lib/email/outreach-send";
import { buildBrakeAlertEmail } from "@/lib/email/outreach-emails";
import { draftWithModel } from "@/lib/outreach/draft-model";
import { pacificInstant } from "@/lib/outreach/pacing";
import {
  OUTREACH_SETTING_KEYS,
  parseOutreachSettings,
  type OutreachSettings,
} from "@/lib/outreach/settings";
import { checkMx, emailDomain, type ExistingProspectData } from "@/lib/outreach/verify";
import type {
  MessagePatch,
  PrepareDeps,
  ProspectPatch,
  RunnerEnv,
  RunnerProspect,
  SendDeps,
} from "@/lib/outreach/runner";
import type { ProspectDraftRow, ProspectFact } from "@/lib/outreach/types";

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

async function runnerProspects(admin: Admin, rows: ProspectRow[]): Promise<RunnerProspect[]> {
  if (rows.length === 0) return [];
  const { data, error } = await admin
    .from("outreach_messages")
    .select("prospect_id, sent_at, scheduled_for")
    .in("prospect_id", rows.map((r) => r.id))
    .eq("step", 0)
    .in("status", ["scheduled", "sent"]);
  if (error) throw error;
  const first = new Map<string, Date>();
  for (const m of data ?? []) {
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
    fromAddress: from,
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
        .in("status", from)
        .select("id");
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
    casMessage: async (id: string, from: string[], patch: MessagePatch) => {
      const { data, error } = await admin
        .from("outreach_messages")
        .update(messagePatchToRow(patch))
        .eq("id", id)
        .in("status", from)
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
    listProspects: async (statuses, limit) => {
      const { data, error } = await admin
        .from("outreach_prospects")
        .select("*")
        .in("status", statuses)
        .order("created_at", { ascending: true })
        .limit(limit);
      if (error) throw error;
      return runnerProspects(admin, data ?? []);
    },
    checkMx: (domain) => checkMx(domain),
    draft: (args) => draftWithModel(args),
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
        .neq("status", "cancelled");
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
      const { data: rows, error: prospectError } = await admin
        .from("outreach_prospects")
        .select("*")
        .in("id", [...new Set(messages.map((m) => m.prospect_id))]);
      if (prospectError) throw prospectError;
      const prospects = new Map((await runnerProspects(admin, rows ?? [])).map((p) => [p.id, p]));
      return messages.flatMap((m) => {
        const prospect = prospects.get(m.prospect_id);
        return prospect && m.scheduled_for
          ? [{ messageId: m.id, step: m.step, scheduledFor: new Date(m.scheduled_for), prospect }]
          : [];
      });
    },
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
  const to = await execEmails(admin);
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

export async function addSuppression(admin: Admin, email: string, reason: string): Promise<void> {
  const e = email.trim().toLowerCase();
  const { error } = await admin.from("outreach_suppressions").upsert({ email: e, reason }, { onConflict: "email", ignoreDuplicates: true });
  if (error) console.error("add suppression failed:", error.message);
}

/** Cancels every message Resend is still holding for a prospect, so nothing goes out after a reply, booking or opt-out. */
export async function cancelScheduledMessages(admin: Admin, prospectId: string): Promise<void> {
  const { data } = await admin
    .from("outreach_messages")
    .select("id, resend_id")
    .eq("prospect_id", prospectId)
    .in("status", ["scheduled", "draft"]);
  for (const m of data ?? []) {
    if (m.resend_id) await cancelScheduledOutreachEmail(m.resend_id);
    await admin.from("outreach_messages").update({ status: "cancelled" }).eq("id", m.id);
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
    dueDrafts: async (at, limit) => {
      const { data: drafts, error } = await admin
        .from("outreach_messages")
        .select("id, prospect_id, step, subject, body_text, scheduled_for")
        .eq("status", "draft")
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      if (!drafts || drafts.length === 0) return [];
      const { data: rows, error: prospectError } = await admin
        .from("outreach_prospects")
        .select("*")
        .in("id", [...new Set(drafts.map((d) => d.prospect_id))]);
      if (prospectError) throw prospectError;
      const prospects = new Map((await runnerProspects(admin, rows ?? [])).map((p) => [p.id, p]));
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

export async function insertProspects(rows: ProspectDraftRow[], createdBy: string): Promise<number> {
  if (rows.length === 0) return 0;
  const supabase = await createClient();
  const { error } = await supabase.from("outreach_prospects").insert(
    rows.map((r) => ({
      company: r.company,
      website: r.website,
      niche: r.niche,
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
