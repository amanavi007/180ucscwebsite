import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";
import { EXEC_ROLES } from "@/lib/auth/roles";
import { formatOrgDate } from "@/lib/date";
import { fetchAllPages } from "@/lib/paginate";
import { pacificInstant } from "@/lib/outreach/pacing";
import { heartbeatKey } from "@/lib/outreach/heartbeat";
import type { Founder } from "@/lib/outreach/discovery/founders";
import {
  computeQuota,
  exclusionsFrom,
  trimDetail,
  type RunReport,
  type SubmitDeps,
  type SubmitResponse,
  type TaskCandidate,
  type TaskResultDeps,
} from "@/lib/outreach/agent";
import type { AgentAuthDeps } from "@/lib/outreach/agent-auth";
import { checkMx } from "@/lib/outreach/verify";
import type { OutreachSettings } from "@/lib/outreach/settings";
import type { ProspectFact } from "@/lib/outreach/types";
import { BACKLOG_LIMIT, countBacklog } from "./outreach-discovery";
import { insertProspectsAdmin, loadExistingProspectDataAdmin, loadOutreachSettings, promoteCandidate } from "./outreach";

type Admin = ReturnType<typeof createAdminClient>;
type CandidateRow = Database["public"]["Tables"]["outreach_discovery_candidates"]["Row"];

const UNIQUE_VIOLATION = "23505";
export { BACKLOG_LIMIT };

/* ── Auth ──────────────────────────────────────────────────────────────────────────────────────────────────── */

export function buildAuthDeps(admin: Admin): AgentAuthDeps {
  return {
    findKeyByHash: async (hash) => {
      const { data, error } = await admin.from("outreach_agent_keys").select("id, scopes, revoked_at, last_used_at").eq("key_hash", hash).maybeSingle();
      if (error) throw error;
      return data ? { id: data.id, scopes: data.scopes, revokedAt: data.revoked_at, lastUsedAt: data.last_used_at } : null;
    },
    agentEnabled: async () => (await loadOutreachSettings(admin)).agentEnabled,
    touch: async (id, at) => {
      const { error } = await admin.from("outreach_agent_keys").update({ last_used_at: at.toISOString() }).eq("id", id);
      if (error) throw error;
    },
    now: () => new Date(),
  };
}

/** Who agent-submitted prospects are created by: the exec who switched the agent on, else the first exec. */
export async function agentOwner(admin: Admin): Promise<string> {
  const { data: setting } = await admin.from("org_settings").select("value").eq("key", "outreach_agent_owner").maybeSingle();
  if (setting?.value) {
    const { data } = await admin.from("profiles").select("id").eq("id", setting.value).maybeSingle();
    if (data) return data.id;
  }
  const { data, error } = await admin.from("profiles").select("id").in("role", EXEC_ROLES).order("created_at").limit(1);
  if (error || !data?.[0]) throw new Error("No exec profile to create agent prospects under.");
  return data[0].id;
}

/* ── Quota and context ─────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Prospects the agent has had accepted since Pacific midnight. Only batch submissions count (they carry a batch id);
 * the agent's end-of-run report repeats the same numbers and must not be added twice.
 */
export async function agentAcceptedToday(admin: Admin, now: Date): Promise<number> {
  const since = pacificInstant(formatOrgDate(now), 0).toISOString();
  const { data, error } = await admin
    .from("outreach_agent_runs")
    .select("accepted")
    .eq("kind", "research")
    .not("idempotency_key", "is", null)
    .gte("created_at", since);
  if (error) throw error;
  return (data ?? []).reduce((sum, r) => sum + r.accepted, 0);
}

async function quotaFor(admin: Admin, settings: OutreachSettings, now: Date) {
  const [backlog, acceptedToday] = await Promise.all([countBacklog(admin), agentAcceptedToday(admin, now)]);
  const quotaToday = computeQuota({ dailyTarget: settings.agentDailyTarget, acceptedToday, backlog, backlogLimit: BACKLOG_LIMIT });
  return { backlog, acceptedToday, quotaToday };
}

export async function buildAgentContext(admin: Admin, now = new Date()) {
  const settings = await loadOutreachSettings(admin);
  const [{ backlog, quotaToday }, existing, prospects] = await Promise.all([
    quotaFor(admin, settings, now),
    loadExistingProspectDataAdmin(admin),
    fetchAllPages((from, to) => admin.from("outreach_prospects").select("segment, niche").order("id").range(from, to)),
  ]);
  const countsBySegmentNiche: Record<string, number> = {};
  for (const p of prospects) {
    const key = `${p.segment ?? "unknown"}/${p.niche ?? "unknown"}`;
    countsBySegmentNiche[key] = (countsBySegmentNiche[key] ?? 0) + 1;
  }
  return {
    mode: settings.mode,
    agentEnabled: settings.agentEnabled,
    dailyTarget: settings.agentDailyTarget,
    targets: settings.agentTargets,
    backlog,
    backlogLimit: BACKLOG_LIMIT,
    quotaToday,
    countsBySegmentNiche,
    // The club's own prospect, suppression and client lists. They go only to its own authenticated agent, so it can skip
    // companies before spending research effort on them.
    exclusions: exclusionsFrom(existing),
  };
}

/* ── Submitting prospects ──────────────────────────────────────────────────────────────────────────────────── */

export async function buildSubmitDeps(admin: Admin, keyId: string, now = new Date()): Promise<SubmitDeps> {
  const settings = await loadOutreachSettings(admin);
  const owner = await agentOwner(admin);
  return {
    mode: settings.mode,
    loadExisting: () => loadExistingProspectDataAdmin(admin),
    quota: async () => {
      const q = await quotaFor(admin, settings, now);
      return { remaining: q.quotaToday, backlogFull: q.backlog > BACKLOG_LIMIT };
    },
    checkMx: (domain) => checkMx(domain),
    insertProspects: (rows) => insertProspectsAdmin(rows, owner, admin),
    claimBatch: async (batchId) => {
      const { data, error } = await admin
        .from("outreach_agent_runs")
        .insert({ key_id: keyId, idempotency_key: batchId, kind: "research", detail: { pending: true } })
        .select("id")
        .single();
      if (!error) return { claimed: true, runId: data.id };
      if (error.code !== UNIQUE_VIOLATION) throw error;
      const { data: earlier, error: readError } = await admin.from("outreach_agent_runs").select("detail").eq("idempotency_key", batchId).maybeSingle();
      if (readError) throw readError;
      const result = (earlier?.detail as { result?: SubmitResponse } | null)?.result;
      return { claimed: false, stored: result ?? null };
    },
    finishBatch: async (runId, response, detail) => {
      const skipped = (detail.skipped ?? {}) as Record<string, number>;
      const { error } = await admin
        .from("outreach_agent_runs")
        .update({
          evaluated: Number(detail.submitted ?? 0),
          submitted: Number(detail.submitted ?? 0),
          accepted: response.accepted,
          skipped,
          detail: trimDetail({ ...detail, result: response }, 60_000) as Json,
        })
        .eq("id", runId);
      if (error) throw error;
    },
    releaseBatch: async (runId) => {
      await admin.from("outreach_agent_runs").delete().eq("id", runId);
    },
  };
}

/* ── Tasks ─────────────────────────────────────────────────────────────────────────────────────────────────── */

type Payload = { prospect?: { facts?: ProspectFact[]; niche?: TaskCandidate["niche"]; sizeStage?: string | null; summary?: string | null } } | null;

export function candidateToTask(row: CandidateRow): TaskCandidate {
  const payload = row.payload as Payload;
  return {
    id: row.id,
    company: row.company,
    website: row.website ?? "",
    domain: row.domain,
    segment: row.segment,
    outcome: row.outcome,
    reason: row.reason,
    founders: Array.isArray(row.founders) ? (row.founders as unknown as Founder[]) : [],
    knownFacts: payload?.prospect?.facts ?? [],
    niche: payload?.prospect?.niche ?? null,
    sizeStage: payload?.prospect?.sizeStage ?? null,
    summary: payload?.prospect?.summary ?? null,
    claimToken: row.agent_claim_token,
    claimedAt: row.agent_claimed_at,
    attempts: row.agent_attempts,
  };
}

/** Leases up to `count` stranded companies. One SQL statement with skip-locked, so two claims never share a company. */
export async function claimAgentTasks(admin: Admin, count: number): Promise<TaskCandidate[]> {
  const { data, error } = await admin.rpc("claim_outreach_agent_tasks", { p_limit: count });
  if (error) throw error;
  return (data ?? []).map(candidateToTask);
}

export async function buildTaskDeps(admin: Admin): Promise<TaskResultDeps> {
  const owner = await agentOwner(admin);
  return {
    getCandidate: async (id) => {
      const { data, error } = await admin.from("outreach_discovery_candidates").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      // Only companies still waiting for an email are the agent's to answer for.
      return data && ["no_email", "unreachable"].includes(data.outcome) ? candidateToTask(data) : null;
    },
    loadExisting: () => loadExistingProspectDataAdmin(admin),
    checkMx: (domain) => checkMx(domain),
    promote: (candidateId, row, emailSourceUrl) =>
      promoteCandidate(candidateId, row, owner, { reason: "Email found by the research agent.", emailSourceUrl }, admin),
    // The lease time stays, so a company the agent could not crack waits out the day instead of coming straight back.
    releaseClaim: async (candidateId, reason) => {
      const { error } = await admin.from("outreach_discovery_candidates").update({ agent_claim_token: null, agent_last_reason: reason }).eq("id", candidateId);
      if (error) throw error;
    },
    now: () => new Date(),
  };
}

/* ── Runs ──────────────────────────────────────────────────────────────────────────────────────────────────── */

export async function recordAgentRun(admin: Admin, keyId: string, report: RunReport): Promise<void> {
  const { error } = await admin.from("outreach_agent_runs").insert({
    key_id: keyId,
    kind: report.kind,
    evaluated: report.evaluated,
    submitted: report.submitted,
    accepted: report.accepted,
    skipped: report.skipped,
    detail: trimDetail(report.detail) as Json,
  });
  if (error) throw error;
}

/* ── For the settings card (read as the signed-in exec) ────────────────────────────────────────────────────── */

export interface AgentKeyView {
  id: string;
  label: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  /** Whether the key may read all discovery data and make the audit repairs. */
  audit: boolean;
  /** Whether the key may correct and retire stored contacts and companies. */
  correct: boolean;
}

export interface AgentCorrection {
  at: string;
  action: string;
  company: string;
  summary: string;
}

export interface AgentOverview {
  keys: AgentKeyView[];
  lastRunAt: string | null;
  acceptedToday: number;
  /** The most common reasons the agent's rows were skipped over the last 7 days. */
  topSkips: { reason: string; count: number }[];
  lastError: string | null;
  /** The agent's most recent audit repairs: website fixes, added facts, requeues. */
  corrections: AgentCorrection[];
}

export async function getAgentOverview(now = new Date()): Promise<AgentOverview> {
  const supabase = await createClient();
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const today = pacificInstant(formatOrgDate(now), 0).getTime();
  const [keys, beat, runs] = await Promise.all([
    supabase.from("outreach_agent_keys").select("id, label, key_prefix, scopes, last_used_at, revoked_at, created_at").order("created_at", { ascending: false }),
    supabase.from("org_settings").select("value").eq("key", heartbeatKey("agent")).maybeSingle(),
    supabase.from("outreach_agent_runs").select("kind, idempotency_key, accepted, skipped, detail, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
  ]);
  for (const r of [keys, runs]) if (r.error) throw r.error;
  const skips: Record<string, number> = {};
  let acceptedToday = 0;
  for (const run of runs.data ?? []) {
    if (run.kind === "research" && run.idempotency_key && new Date(run.created_at).getTime() >= today) acceptedToday += run.accepted;
    for (const [reason, n] of Object.entries((run.skipped ?? {}) as Record<string, number>)) skips[reason] = (skips[reason] ?? 0) + n;
  }
  const failed = (runs.data ?? []).find((r) => typeof (r.detail as { error?: unknown } | null)?.error === "string");
  const corrections = (runs.data ?? [])
    .filter((r) => r.kind === "correction")
    .slice(0, 8)
    .map((r) => describeCorrection(r.detail as Record<string, unknown> | null, r.created_at));
  return {
    corrections,
    keys: (keys.data ?? []).map((k) => ({ id: k.id, label: k.label, prefix: k.key_prefix, lastUsedAt: k.last_used_at, revokedAt: k.revoked_at, createdAt: k.created_at, audit: k.scopes.includes("outreach:audit"), correct: k.scopes.includes("outreach:correct") })),
    lastRunAt: beat.data?.value || null,
    acceptedToday,
    topSkips: Object.entries(skips)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([reason, count]) => ({ reason, count })),
    lastError: failed ? ((failed.detail as { error: string }).error).slice(0, 200) : null,
  };
}

function describeCorrection(detail: Record<string, unknown> | null, at: string): AgentCorrection {
  const d = detail ?? {};
  const action = String(d.action ?? "change");
  const company = String(d.company ?? "a company");
  const summary =
    action === "website"
      ? `Website changed from ${d.oldDomain ?? "?"} to ${d.newDomain ?? "?"}. ${d.note ?? ""}`
      : action === "contact_correction"
        ? `Contact ${d.field ?? "changed"}: ${d.oldEmail ?? "none"} to ${d.newEmail ?? "none"}.`
        : action === "retire" || action === "invalidate"
          ? `${action === "retire" ? "Retired" : "Invalidated"}: ${d.reason ?? "no reason"}. ${d.detail ?? ""}`
          : action === "rescreen"
            ? `Re-screened stored contacts: ${d.flagged ?? 0} flagged.`
            : action === "facts"
        ? `Added ${d.added ?? 0} sourced fact(s).`
        : `Handed back to discovery. ${d.note ?? ""}`;
  return { at, action, company, summary: summary.trim().slice(0, 240) };
}
