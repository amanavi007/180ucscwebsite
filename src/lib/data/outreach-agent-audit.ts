import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { fetchAllPages } from "@/lib/paginate";
import { factsToJson } from "./outreach";
import { fetchPageHtml } from "@/lib/outreach/discovery/web";
import {
  afterCursorFilter,
  candidateView,
  factsOf,
  page,
  prospectView,
  tally,
  type AuditDeps,
  type CandidateRow,
  type FactsDeps,
  type ListQuery,
  type ProspectRow,
  type RequeueDeps,
} from "@/lib/outreach/agent-audit";

type Admin = ReturnType<typeof createAdminClient>;

const UNIQUE_VIOLATION = "23505";

/* ── Reads ─────────────────────────────────────────────────────────────────────────────────────────────────── */

export async function auditStats(admin: Admin) {
  const [candidates, prospects] = await Promise.all([
    fetchAllPages((from, to) => admin.from("outreach_discovery_candidates").select("id, outcome").order("id").range(from, to)),
    fetchAllPages((from, to) => admin.from("outreach_prospects").select("id, status").order("id").range(from, to)),
  ]);
  return {
    // Counted from what is stored, not from a fixed list: outcome values have changed across migrations.
    candidatesByOutcome: tally(candidates.map((c) => c.outcome)),
    candidatesTotal: candidates.length,
    prospectsTotal: prospects.length,
    prospectsByStatus: tally(prospects.map((p) => p.status)),
  };
}

export async function listCandidates(admin: Admin, q: ListQuery) {
  let query = admin.from("outreach_discovery_candidates").select("*").order("created_at", { ascending: true }).order("id", { ascending: true }).limit(q.limit + 1);
  if (q.filters.outcome) query = query.eq("outcome", q.filters.outcome);
  if (q.filters.source) query = query.eq("source", q.filters.source);
  if (q.since) query = query.gte("created_at", q.since);
  if (q.cursor) query = query.or(afterCursorFilter(q.cursor));
  const { data, error } = await query;
  if (error) throw error;
  const result = page((data ?? []) as CandidateRow[], q.limit);
  return { rows: result.rows.map(candidateView), nextCursor: result.nextCursor };
}

const PROSPECT_COLUMNS = "id, company, website, segment, niche, contact_name, contact_role, contact_email, contact_domain, status, facts, created_at";

export async function listProspects(admin: Admin, q: ListQuery) {
  let query = admin.from("outreach_prospects").select(PROSPECT_COLUMNS).order("created_at", { ascending: true }).order("id", { ascending: true }).limit(q.limit + 1);
  if (q.filters.status) query = query.eq("status", q.filters.status);
  if (q.since) query = query.gte("created_at", q.since);
  if (q.cursor) query = query.or(afterCursorFilter(q.cursor));
  const { data, error } = await query;
  if (error) throw error;
  const result = page((data ?? []) as ProspectRow[], q.limit);
  return { rows: result.rows.map(prospectView), nextCursor: result.nextCursor };
}

/* ── Writes ────────────────────────────────────────────────────────────────────────────────────────────────── */

async function getCandidate(admin: Admin, id: string): Promise<CandidateRow | null> {
  const { data, error } = await admin.from("outreach_discovery_candidates").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as CandidateRow | null;
}

async function recordCorrection(admin: Admin, keyId: string, detail: Record<string, unknown>) {
  const { error } = await admin.from("outreach_agent_runs").insert({ key_id: keyId, kind: "correction", detail: detail as Json });
  if (error) throw error;
}

const CLEARED = { attempts: 0, last_attempt_at: null, agent_attempts: 0, agent_claimed_at: null, agent_claim_token: null };

export function buildCorrectionDeps(admin: Admin, keyId: string): AuditDeps {
  return {
    getCandidate: (id) => getCandidate(admin, id),
    domainOwner: async (domain, exceptId) => {
      const { data, error } = await admin.from("outreach_discovery_candidates").select("id").eq("domain", domain).neq("id", exceptId).maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
    fetchPage: fetchPageHtml,
    saveCorrection: async (id, change) => {
      const { error } = await admin
        .from("outreach_discovery_candidates")
        .update({
          website: change.website,
          domain: change.domain,
          outcome: change.outcome,
          reason: change.reason,
          payload: change.payload as Json,
          ...(change.reset ? CLEARED : {}),
        })
        .eq("id", id);
      if (!error) return "ok";
      if (error.code === UNIQUE_VIOLATION) return "domain_taken";
      throw error;
    },
    recordCorrection: (detail) => recordCorrection(admin, keyId, detail),
  };
}

export function buildFactsDeps(admin: Admin, keyId: string): FactsDeps {
  return {
    getCandidate: (id) => getCandidate(admin, id),
    getProspectFacts: async (prospectId) => {
      const { data, error } = await admin.from("outreach_prospects").select("facts").eq("id", prospectId).maybeSingle();
      if (error) throw error;
      return data ? factsOf(data.facts) : null;
    },
    saveFacts: async (candidateId, prospectId, facts) => {
      if (prospectId) {
        const { error } = await admin.from("outreach_prospects").update({ facts: factsToJson(facts) }).eq("id", prospectId);
        if (error) throw error;
      }
      // Keep the pooled payload in step, so a company still waiting in the pool carries the new facts into its prospect.
      const candidate = await getCandidate(admin, candidateId);
      const payload = candidate?.payload as { prospect?: Record<string, unknown> } | null;
      if (payload && typeof payload === "object" && payload.prospect) {
        const next = { ...payload, prospect: { ...payload.prospect, facts } };
        const { error } = await admin.from("outreach_discovery_candidates").update({ payload: next as unknown as Json }).eq("id", candidateId);
        if (error) throw error;
      }
    },
    recordFacts: (detail) => recordCorrection(admin, keyId, detail),
  };
}

export function buildRequeueDeps(admin: Admin, keyId: string): RequeueDeps {
  return {
    getCandidate: (id) => getCandidate(admin, id),
    saveRequeue: async (id, change) => {
      const { error } = await admin.from("outreach_discovery_candidates").update({ outcome: change.outcome, reason: change.reason, ...CLEARED }).eq("id", id);
      if (error) throw error;
    },
    recordCorrection: (detail) => recordCorrection(admin, keyId, detail),
  };
}
