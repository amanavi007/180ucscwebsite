import { z } from "zod";
import { hostOf, isPlatform } from "./discovery/runner";
import { pageMentions } from "./discovery/repair";
import type { ProspectFact } from "./types";

/**
 * The rules behind the research agent's audit access: full reads of the discovery and prospect data, and three narrow
 * writes (fix a website, add sourced facts, hand a candidate back to the pipeline). Free of the database and the
 * network so they can be tested; src/lib/data/outreach-agent-audit.ts wires in real storage.
 */

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 200;

/** Outcomes the discovery repair job re-evaluates on its next run. */
const REPAIRABLE = new Set(["unreachable", "error", "failed", "no_email"]);

/* ── Paging ────────────────────────────────────────────────────────────────────────────────────────────────── */

export interface Cursor {
  /** created_at of the last row returned, exactly as the database gave it. */
  t: string;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^[0-9T:.+\-Z]{10,40}$/;

export const isUuid = (value: string) => UUID.test(value);

export function encodeCursor(row: { created_at: string; id: string }): string {
  return Buffer.from(JSON.stringify({ t: row.created_at, id: row.id })).toString("base64url");
}

export function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<Cursor>;
    if (typeof parsed.t !== "string" || typeof parsed.id !== "string") return null;
    if (!TIMESTAMP.test(parsed.t) || Number.isNaN(Date.parse(parsed.t)) || !UUID.test(parsed.id)) return null;
    return { t: parsed.t, id: parsed.id };
  } catch {
    return null;
  }
}

export interface ListQuery {
  limit: number;
  cursor: Cursor | null;
  /** Equality filters by name, already checked. */
  filters: Record<string, string>;
  since: string | null;
}

const WORD = /^[a-z0-9_]{1,40}$/;

/** Reads ?limit, ?cursor, ?since and the named equality filters. Returns an error code for anything malformed. */
export function parseListQuery(params: URLSearchParams, filterNames: string[]): { ok: true; query: ListQuery } | { ok: false; error: string } {
  let limit = DEFAULT_LIMIT;
  const rawLimit = params.get("limit");
  if (rawLimit !== null) {
    if (!/^\d{1,4}$/.test(rawLimit) || Number(rawLimit) < 1) return { ok: false, error: "invalid_limit" };
    limit = Math.min(Number(rawLimit), MAX_LIMIT);
  }
  let cursor: Cursor | null = null;
  const rawCursor = params.get("cursor");
  if (rawCursor) {
    cursor = decodeCursor(rawCursor);
    if (!cursor) return { ok: false, error: "invalid_cursor" };
  }
  let since: string | null = null;
  const rawSince = params.get("since");
  if (rawSince) {
    const t = Date.parse(rawSince);
    if (Number.isNaN(t)) return { ok: false, error: "invalid_since" };
    since = new Date(t).toISOString();
  }
  const filters: Record<string, string> = {};
  for (const name of filterNames) {
    const value = params.get(name);
    if (!value) continue;
    if (!WORD.test(value)) return { ok: false, error: `invalid_${name}` };
    filters[name] = value;
  }
  return { ok: true, query: { limit, cursor, filters, since } };
}

/** The PostgREST filter for "after this cursor" in (created_at, id) order. */
export function afterCursorFilter(c: Cursor): string {
  return `created_at.gt.${c.t},and(created_at.eq.${c.t},id.gt.${c.id})`;
}

/** Trims the extra row fetched to detect another page, and names where the next page starts. */
export function page<T extends { created_at: string; id: string }>(rows: T[], limit: number): { rows: T[]; nextCursor: string | null } {
  if (rows.length <= limit) return { rows, nextCursor: null };
  const kept = rows.slice(0, limit);
  return { rows: kept, nextCursor: encodeCursor(kept[kept.length - 1]) };
}

/* ── Views ─────────────────────────────────────────────────────────────────────────────────────────────────── */

export interface CandidateRow {
  id: string;
  source: string;
  source_ref: string | null;
  company: string;
  website: string | null;
  domain: string;
  outcome: string;
  reason: string | null;
  prospect_id: string | null;
  email: string | null;
  email_source_url: string | null;
  founders: unknown;
  payload: unknown;
  agent_attempts: number;
  agent_claimed_at: string | null;
  agent_last_reason: string | null;
  attempts: number;
  last_attempt_at: string | null;
  created_at: string;
}

export function candidateView(r: CandidateRow) {
  return {
    id: r.id,
    source: r.source,
    sourceRef: r.source_ref,
    company: r.company,
    website: r.website,
    domain: r.domain,
    outcome: r.outcome,
    reason: r.reason,
    prospectId: r.prospect_id,
    email: r.email,
    emailSourceUrl: r.email_source_url,
    founders: Array.isArray(r.founders) ? r.founders : [],
    // Verbatim. A null payload on a skipped company is itself something the audit wants to see.
    payload: r.payload ?? null,
    agentAttempts: r.agent_attempts,
    agentClaimedAt: r.agent_claimed_at,
    agentLastReason: r.agent_last_reason,
    repairAttempts: r.attempts,
    lastAttemptAt: r.last_attempt_at,
    createdAt: r.created_at,
    // Candidates have no updated-at column; lastAttemptAt is the closest thing to it.
    updatedAt: null,
  };
}

export interface ProspectRow {
  id: string;
  company: string;
  website: string | null;
  segment: string | null;
  niche: string | null;
  contact_name: string | null;
  contact_role: string | null;
  contact_email: string;
  contact_domain: string;
  status: string;
  facts: unknown;
  created_at: string;
}

/** Facts as the drafting job sees them: `{text, sourceUrl}`, stored as `{text, source_url}`. */
export function factsOf(json: unknown): ProspectFact[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((f) => {
    if (f && typeof f === "object" && typeof (f as { text?: unknown }).text === "string") {
      const o = f as { text: string; source_url?: unknown; sourceUrl?: unknown };
      const url = typeof o.source_url === "string" ? o.source_url : typeof o.sourceUrl === "string" ? o.sourceUrl : "";
      return [{ text: o.text, sourceUrl: url }];
    }
    return [];
  });
}

export function prospectView(r: ProspectRow) {
  return {
    id: r.id,
    company: r.company,
    website: r.website,
    domain: hostOf(r.website),
    segment: r.segment,
    niche: r.niche,
    contactName: r.contact_name,
    contactRole: r.contact_role,
    contactEmail: r.contact_email,
    contactDomain: r.contact_domain,
    status: r.status,
    facts: factsOf(r.facts),
    createdAt: r.created_at,
  };
}

/** Counts of a column's values, whatever values are actually stored. */
export function tally(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  return counts;
}

/* ── Shared checks ─────────────────────────────────────────────────────────────────────────────────────────── */

const text = (max: number) => z.string().trim().max(max);
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** An https URL on a named host: no IP literals, localhost or single-label hosts. */
export function httpsPage(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !host.includes(".") || IPV4.test(host) || host.includes(":") || host.endsWith(".local") || host.endsWith(".internal")) return null;
    return url;
  } catch {
    return null;
  }
}

/* ── PATCH /candidates/{id}: correct a moved website ───────────────────────────────────────────────────────── */

export const correctionSchema = z.object({
  website: text(300).min(1),
  evidenceUrl: text(500).min(1),
  note: text(400).min(1),
});

export interface CorrectionSave {
  website: string;
  domain: string;
  outcome: string;
  reason: string;
  payload: unknown;
  /** True when discovery should look at the company again: counters cleared, due immediately. */
  reset: boolean;
}

export interface AuditDeps {
  getCandidate(id: string): Promise<CandidateRow | null>;
  /** The id of another candidate that owns this domain, if any. */
  domainOwner(domain: string, exceptId: string): Promise<string | null>;
  fetchPage(url: string): Promise<string | null>;
  /** Writes the change. `domain_taken` means the unique index refused it (someone took the domain a moment ago). */
  saveCorrection(id: string, change: CorrectionSave): Promise<"ok" | "domain_taken">;
  /** Writes the audit record the portal shows as agent activity. */
  recordCorrection(detail: Record<string, unknown>): Promise<void>;
}

export type AuditResponse = { status: number; body: Record<string, unknown> };

const bad = (status: number, error: string, extra: Record<string, unknown> = {}): AuditResponse => ({ status, body: { error, ...extra } });

/** Where a reset candidate goes so the repair job picks it up: a site that did not load is "unreachable"; "no email" stays. */
function resetOutcome(outcome: string): string {
  return outcome === "no_email" ? "no_email" : "unreachable";
}

export async function correctWebsite(id: string, body: unknown, deps: AuditDeps): Promise<AuditResponse> {
  const parsed = correctionSchema.safeParse(body);
  if (!parsed.success) return bad(400, "invalid_body");
  const candidate = await deps.getCandidate(id);
  if (!candidate) return bad(404, "not_found");

  const site = httpsPage(parsed.data.website);
  const domain = site ? hostOf(site.toString()) : null;
  if (!site || !domain || isPlatform(domain)) return bad(400, "invalid_website");
  const evidence = httpsPage(parsed.data.evidenceUrl);
  if (!evidence) return bad(400, "invalid_evidence_url");

  const owner = await deps.domainOwner(domain, candidate.id);
  if (owner) return bad(409, "domain_taken", { conflictingCandidateId: owner });

  const html = await deps.fetchPage(evidence.toString());
  if (!html || !pageMentions(html, candidate.company)) return bad(422, "evidence_mismatch");

  const reset = REPAIRABLE.has(candidate.outcome);
  const outcome = reset ? resetOutcome(candidate.outcome) : candidate.outcome;
  const reason = reset ? `Website corrected by research agent: ${parsed.data.note}` : candidate.reason ?? "";
  const website = site.toString();
  const change: CorrectionSave = { website, domain, outcome, reason, payload: withPayloadWebsite(candidate.payload, website), reset };
  if ((await deps.saveCorrection(candidate.id, change)) === "domain_taken") {
    return bad(409, "domain_taken", { conflictingCandidateId: (await deps.domainOwner(domain, candidate.id)) ?? null });
  }
  await deps.recordCorrection({
    action: "website",
    candidateId: candidate.id,
    company: candidate.company,
    oldWebsite: candidate.website,
    oldDomain: candidate.domain,
    newWebsite: website,
    newDomain: domain,
    evidenceUrl: evidence.toString(),
    note: parsed.data.note,
    previousOutcome: candidate.outcome,
    outcome,
  });
  return { status: 200, body: { id: candidate.id, website, domain, outcome, reset } };
}

/** A pooled company carries the website in its payload too; keep the two in step. */
function withPayloadWebsite(payload: unknown, website: string): unknown {
  const p = payload as { prospect?: { website?: unknown } } | null;
  if (!p || typeof p !== "object" || !p.prospect || typeof p.prospect !== "object") return payload ?? null;
  return { ...p, prospect: { ...p.prospect, website } };
}

/* ── POST /candidates/{id}/facts ───────────────────────────────────────────────────────────────────────────── */

export const factsBodySchema = z.object({
  facts: z.array(z.object({ text: text(400), sourceUrl: text(500) })).min(1).max(12),
});

export interface FactsDeps {
  getCandidate(id: string): Promise<CandidateRow | null>;
  /** The linked prospect's stored facts, or null when the candidate has no prospect. */
  getProspectFacts(prospectId: string): Promise<ProspectFact[] | null>;
  /** Stores the new list wherever drafting reads it: the prospect when there is one, and the pooled payload. */
  saveFacts(candidateId: string, prospectId: string | null, facts: ProspectFact[]): Promise<void>;
  recordFacts(detail: Record<string, unknown>): Promise<void>;
}

const sameFact = (a: string) => a.trim().toLowerCase().replace(/\s+/g, " ");

export async function addFacts(id: string, body: unknown, deps: FactsDeps): Promise<AuditResponse> {
  const parsed = factsBodySchema.safeParse(body);
  if (!parsed.success) return bad(400, "invalid_body");
  const candidate = await deps.getCandidate(id);
  if (!candidate) return bad(404, "not_found");
  if (candidate.outcome !== "ready" && candidate.outcome !== "added") return bad(409, "facts_not_applicable", { outcome: candidate.outcome });

  const payloadFacts = factsOf((candidate.payload as { prospect?: { facts?: unknown } } | null)?.prospect?.facts);
  const prospectFacts = candidate.prospect_id ? await deps.getProspectFacts(candidate.prospect_id) : null;
  // Drafting reads the prospect's facts once there is a prospect; before that the pooled payload carries them.
  const current = prospectFacts ?? payloadFacts;
  const seen = new Set([...current, ...payloadFacts].map((f) => sameFact(f.text)));

  const added: ProspectFact[] = [];
  let rejected = 0;
  for (const f of parsed.data.facts) {
    const source = httpsPage(f.sourceUrl);
    if (!f.text || !source) {
      rejected++;
      continue;
    }
    const key = sameFact(f.text);
    if (seen.has(key)) continue;
    seen.add(key);
    added.push({ text: f.text, sourceUrl: source.toString() });
  }
  const total = [...current, ...added];
  if (added.length > 0) {
    await deps.saveFacts(candidate.id, prospectFacts ? candidate.prospect_id : null, total);
    await deps.recordFacts({
      action: "facts",
      candidateId: candidate.id,
      company: candidate.company,
      added: added.length,
      sources: added.map((f) => f.sourceUrl),
    });
  }
  return { status: 200, body: { added: added.length, rejected, factsTotal: total.length } };
}

/* ── POST /candidates/{id}/requeue ─────────────────────────────────────────────────────────────────────────── */

export const requeueSchema = z.object({ note: text(400).default("") });

export interface RequeueDeps {
  getCandidate(id: string): Promise<CandidateRow | null>;
  saveRequeue(id: string, change: { outcome: string; reason: string }): Promise<void>;
  recordCorrection(detail: Record<string, unknown>): Promise<void>;
}

export async function requeueCandidate(id: string, body: unknown, deps: RequeueDeps): Promise<AuditResponse> {
  const parsed = requeueSchema.safeParse(body ?? {});
  if (!parsed.success) return bad(400, "invalid_body");
  const candidate = await deps.getCandidate(id);
  if (!candidate) return bad(404, "not_found");
  // Only problem companies the repair job knows how to look at again can be handed back.
  if (!REPAIRABLE.has(candidate.outcome)) return bad(409, "not_requeueable", { outcome: candidate.outcome });

  const outcome = resetOutcome(candidate.outcome);
  const reason = `Requeued by research agent${parsed.data.note ? `: ${parsed.data.note}` : "."}`;
  await deps.saveRequeue(candidate.id, { outcome, reason });
  await deps.recordCorrection({ action: "requeue", candidateId: candidate.id, company: candidate.company, previousOutcome: candidate.outcome, outcome, note: parsed.data.note });
  return { status: 200, body: { id: candidate.id, outcome } };
}
