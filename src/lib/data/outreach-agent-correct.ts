import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { fetchAllPages } from "@/lib/paginate";
import { fetchPageHtml } from "@/lib/outreach/discovery/web";
import { emailDomain } from "@/lib/outreach/verify";
import type { CandidateRow } from "@/lib/outreach/agent-audit";
import type { CandidateContactDeps, ProspectCorrectionDeps, ProspectForCorrection, RetireDeps } from "@/lib/outreach/agent-correct";
import { planRescreen, type RescreenPlan } from "@/lib/outreach/rescreen";
import { cancelScheduledMessages, loadExistingProspectDataAdmin } from "./outreach";

type Admin = ReturnType<typeof createAdminClient>;
const UNIQUE_VIOLATION = "23505";

async function record(admin: Admin, keyId: string | null, detail: Record<string, unknown>) {
  const { error } = await admin.from("outreach_agent_runs").insert({ key_id: keyId, kind: "correction", detail: detail as Json });
  if (error) throw error;
}

async function getCandidate(admin: Admin, id: string): Promise<CandidateRow | null> {
  const { data, error } = await admin.from("outreach_discovery_candidates").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as CandidateRow | null;
}

export function buildCandidateContactDeps(admin: Admin, keyId: string): CandidateContactDeps {
  return {
    getCandidate: (id) => getCandidate(admin, id),
    existing: () => loadExistingProspectDataAdmin(admin),
    fetchPage: fetchPageHtml,
    saveContact: async (id, change) => {
      const { error } = await admin
        .from("outreach_discovery_candidates")
        .update({
          email: change.email,
          email_source_url: change.emailSourceUrl,
          payload: change.payload as Json,
          ...(change.outcome ? { outcome: change.outcome, reason: change.reason ?? null } : {}),
          // Only the agent's lease is reset, so the company can be claimed again; discovery's own retry counters stay.
          ...(change.resetAgent ? { agent_attempts: 0, agent_claimed_at: null, agent_claim_token: null } : {}),
        })
        .eq("id", id);
      if (error) throw error;
    },
    record: (detail) => record(admin, keyId, detail),
  };
}

export function buildRetireDeps(admin: Admin, keyId: string): RetireDeps {
  return {
    getCandidate: (id) => getCandidate(admin, id),
    saveRetired: async (id, reason) => {
      const { error } = await admin
        .from("outreach_discovery_candidates")
        .update({ outcome: "retired", reason, agent_claimed_at: null, agent_claim_token: null })
        .eq("id", id);
      if (error) throw error;
    },
    record: (detail) => record(admin, keyId, detail),
  };
}

const PROSPECT_COLUMNS = "id, company, website, contact_email, contact_name, contact_role, status, last_sent_at";

async function markInvalid(admin: Admin, id: string, reason: string) {
  await cancelScheduledMessages(admin, id);
  const { error } = await admin.from("outreach_prospects").update({ status: "invalid", status_reason: reason, next_action_at: null }).eq("id", id);
  if (error) throw error;
}

async function markContacted(admin: Admin, id: string, reason: string) {
  await cancelScheduledMessages(admin, id);
  const { error } = await admin.from("outreach_prospects").update({ status: "contacted", status_reason: reason, next_action_at: null }).eq("id", id);
  if (error) throw error;
}

/** True when a message has gone out (or its send time has passed) for this prospect. */
async function hasSentMessage(admin: Admin, id: string): Promise<boolean> {
  const { data, error } = await admin.from("outreach_messages").select("id, status, scheduled_for").eq("prospect_id", id).in("status", ["sent", "scheduled"]); // in-ok: two statuses
  if (error) throw error;
  const now = Date.now();
  return (data ?? []).some((m) => m.status === "sent" || (m.scheduled_for && new Date(m.scheduled_for).getTime() <= now));
}

export function buildProspectCorrectionDeps(admin: Admin, keyId: string): ProspectCorrectionDeps {
  return {
    existing: () => loadExistingProspectDataAdmin(admin),
    fetchPage: fetchPageHtml,
    getProspect: async (id): Promise<ProspectForCorrection | null> => {
      const { data, error } = await admin.from("outreach_prospects").select(PROSPECT_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw error;
      return data
        ? { id: data.id, company: data.company, website: data.website, contactEmail: data.contact_email, contactName: data.contact_name, contactRole: data.contact_role, status: data.status, lastSentAt: data.last_sent_at }
        : null;
    },
    isEngaged: async (p) => p.lastSentAt !== null || (await hasSentMessage(admin, p.id)),
    saveContact: async (id, change) => {
      if (change.resetToNew) await cancelScheduledMessages(admin, id);
      const { error } = await admin
        .from("outreach_prospects")
        .update({
          contact_email: change.email,
          contact_domain: emailDomain(change.email),
          contact_name: change.name,
          contact_role: change.role,
          ...(change.resetToNew ? { status: "new", status_reason: null, step: 0, next_action_at: null } : {}),
        })
        .eq("id", id);
      if (!error) return "ok";
      if (error.code === UNIQUE_VIOLATION) return "duplicate_email";
      throw error;
    },
    markInvalid: (id, reason) => markInvalid(admin, id, reason),
    markContacted: (id, reason) => markContacted(admin, id, reason),
    record: (detail) => record(admin, keyId, detail),
  };
}

/* ── Read-only send state for GET /prospects ───────────────────────────────────────────────────────────────── */

export interface SendState {
  lastOutreachStatus: "drafted" | "sent" | "bounced" | "replied" | null;
  lastSentAt: string | null;
  bounced: boolean;
}

/** Folds a prospect's messages and events into the one-word state the agent sees. Reads only. */
export function sendStateOf(args: { status: string; lastSentAt: string | null; messages: string[]; events: string[] }): SendState {
  const bounced = args.status === "bounced" || args.events.includes("bounced");
  const replied = args.status === "replied" || args.status === "booked" || args.events.includes("replied");
  const sent = args.lastSentAt !== null || args.messages.includes("sent");
  const lastOutreachStatus = bounced ? "bounced" : replied ? "replied" : sent ? "sent" : args.messages.some((m) => m === "draft" || m === "scheduled") ? "drafted" : null;
  return { lastOutreachStatus, lastSentAt: args.lastSentAt, bounced };
}

export async function sendStates(admin: Admin, ids: string[]): Promise<Map<string, { messages: string[]; events: string[]; lastSentAt: string | null }>> {
  const out = new Map<string, { messages: string[]; events: string[]; lastSentAt: string | null }>();
  for (const id of ids) out.set(id, { messages: [], events: [], lastSentAt: null });
  if (ids.length === 0) return out;
  const [messages, events, prospects] = await Promise.all([
    admin.from("outreach_messages").select("prospect_id, status").in("prospect_id", ids), // in-ok: one page of at most 200 ids
    admin.from("outreach_events").select("prospect_id, kind").in("prospect_id", ids).in("kind", ["bounced", "replied"]), // in-ok: one page of at most 200 ids
    admin.from("outreach_prospects").select("id, last_sent_at").in("id", ids), // in-ok: one page of at most 200 ids
  ]);
  for (const r of [messages, events, prospects]) if (r.error) throw r.error;
  for (const m of messages.data ?? []) out.get(m.prospect_id)?.messages.push(m.status);
  for (const e of events.data ?? []) if (e.prospect_id) out.get(e.prospect_id)?.events.push(e.kind);
  for (const p of prospects.data ?? []) if (out.has(p.id)) out.get(p.id)!.lastSentAt = p.last_sent_at;
  return out;
}

/* ── One-time re-screen ────────────────────────────────────────────────────────────────────────────────────── */

export async function planStoredRescreen(admin: Admin): Promise<RescreenPlan> {
  const [prospects, candidates] = await Promise.all([
    fetchAllPages((from, to) => admin.from("outreach_prospects").select("id, company, contact_email, status, last_sent_at").order("id").range(from, to)),
    fetchAllPages((from, to) => admin.from("outreach_discovery_candidates").select("id, company, outcome, email, payload").eq("outcome", "ready").order("id").range(from, to)),
  ]);
  return planRescreen(
    prospects.map((p) => ({ id: p.id, company: p.company, contactEmail: p.contact_email, status: p.status, lastSentAt: p.last_sent_at })),
    candidates.map((c) => ({ id: c.id, company: c.company, outcome: c.outcome, email: c.email, payload: c.payload })),
  );
}

export async function applyRescreen(admin: Admin, plan: RescreenPlan): Promise<void> {
  for (const p of plan.prospects) await markInvalid(admin, p.id, "junk_contact: stored email is a junk or role inbox (re-screen)");
  for (const c of plan.candidates) {
    const { error } = await admin
      .from("outreach_discovery_candidates")
      .update({ outcome: "no_email", reason: `Stored email ${c.email} is a junk or role inbox (re-screen); needs a real contact.`, email: null, email_source_url: null, payload: c.payload as Json, agent_attempts: 0, agent_claimed_at: null, agent_claim_token: null })
      .eq("id", c.id);
    if (error) throw error;
  }
  await record(admin, null, {
    action: "rescreen",
    company: "stored contacts",
    flagged: plan.prospects.length + plan.candidates.length,
    prospectsInvalidated: plan.prospects.map((p) => `${p.company} <${p.email}>`),
    candidatesCleared: plan.candidates.map((c) => `${c.company} <${c.email}>`),
    leftAloneEngaged: plan.engaged.map((p) => `${p.company} <${p.email}> (${p.status})`),
  });
}
