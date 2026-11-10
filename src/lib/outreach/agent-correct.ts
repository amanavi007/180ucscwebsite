import { z } from "zod";
import { EVIDENCE, emailProblem, sourceProblem, type Evidence } from "./agent";
import { httpsPage, type AuditResponse, type CandidateRow } from "./agent-audit";
import { checkMx, emailDomain, normalizeEmail, type ExistingProspectData } from "./verify";

/**
 * The rules behind the research agent's corrections (scope outreach:correct): fix or clear a stored contact, and retire
 * a company or prospect that should not be worked. Free of the database and the network so they can be tested;
 * src/lib/data/outreach-agent-correct.ts wires in real storage. History is never rewritten: a prospect that has been
 * written to is out of reach here.
 */

const text = (max: number) => z.string().trim().max(max);

const bad = (status: number, error: string, extra: Record<string, unknown> = {}): AuditResponse => ({ status, body: { error, ...extra } });

/** Candidates whose contact can be fixed or that can be retired. Anything else is not the agent's to touch. */
export const CORRECTABLE_OUTCOMES = new Set(["ready", "no_email", "failed", "unreachable"]);

/** Prospect statuses that mean an email went out or the person answered. Such a prospect is never changed here. */
export const ENGAGED_STATUSES = new Set(["sent", "follow_up_1", "follow_up_2", "closing_note", "no_response", "replied", "booked", "unsubscribed", "bounced", "contacted"]);

/* ── Body ──────────────────────────────────────────────────────────────────────────────────────────────────── */

export const replaceContactSchema = z.object({
  contactName: text(120).nullish(),
  contactRole: text(120).nullish(),
  contactEmail: text(254).min(1),
  emailSourceUrl: text(500).nullish(),
  emailEvidence: text(40).nullish(),
});
export const invalidateContactSchema = z.object({
  invalidateEmail: z.literal(true),
  reason: text(300).min(1),
});

export type ContactBody = { kind: "replace"; value: z.infer<typeof replaceContactSchema> } | { kind: "invalidate"; reason: string };

/** The two forms of the contact body, told apart by `invalidateEmail`. Null when neither fits. */
export function parseContactBody(body: unknown): ContactBody | null {
  if (body && typeof body === "object" && "invalidateEmail" in body) {
    const parsed = invalidateContactSchema.safeParse(body);
    return parsed.success ? { kind: "invalidate", reason: parsed.data.reason } : null;
  }
  const parsed = replaceContactSchema.safeParse(body);
  return parsed.success ? { kind: "replace", value: parsed.data } : null;
}

/* ── Checking a replacement email ──────────────────────────────────────────────────────────────────────────── */

/** Whether a page shows an address, allowing the "[at]" and entity spellings sites use against scrapers. */
export function pageShowsEmail(html: string, email: string): boolean {
  const readable = html.replace(/&#0*64;|&#x0*40;|&commat;|%40|\s?\[at\]\s?|\s?\(at\)\s?/gi, "@").toLowerCase();
  return readable.includes(email.toLowerCase());
}

export interface EmailCheckDeps {
  existing(): Promise<ExistingProspectData>;
  fetchPage(url: string): Promise<string | null>;
  checkMx?(domain: string): Promise<boolean>;
}

export type EmailCheck = { ok: true; email: string; sourceUrl: string; evidence: Evidence } | { ok: false; reason: string };

/**
 * The checks a task-result submission gets (syntax, free mail, blocked inbox, source, MX, do-not-contact, duplicates), plus
 * one more: the source page is fetched and must show the address. `ownEmail` is the address being replaced, which does
 * not count as a duplicate of itself.
 */
export async function checkReplacementEmail(
  input: { contactEmail: string; emailSourceUrl?: string | null; emailEvidence?: string | null; website: string | null },
  ownEmail: string | null,
  deps: EmailCheckDeps,
): Promise<EmailCheck> {
  const email = normalizeEmail(input.contactEmail);
  const problem = emailProblem(email);
  if (problem === "invalid_email") return { ok: false, reason: problem };
  const noSource = sourceProblem({ email, website: input.website, sourceUrl: input.emailSourceUrl, evidence: input.emailEvidence });
  if (noSource) return { ok: false, reason: noSource };
  // The existing reason code for a role or junk inbox is role_inbox; corrections call it blocked_inbox.
  if (problem) return { ok: false, reason: problem === "role_inbox" ? "blocked_inbox" : problem };

  const existing = await deps.existing();
  const domain = emailDomain(email);
  if (existing.suppressedEmails.has(email) || existing.suppressedDomains.has(domain)) return { ok: false, reason: "suppressed" };
  if (email !== ownEmail && existing.emails.has(email)) return { ok: false, reason: "duplicate_email" };

  if (!(await (deps.checkMx ?? checkMx)(domain))) return { ok: false, reason: "mx_failed" };
  const sourceUrl = httpsPage(input.emailSourceUrl ?? "")!.toString();
  const html = await deps.fetchPage(sourceUrl);
  if (!html || !pageShowsEmail(html, email)) return { ok: false, reason: "no_source" };
  return { ok: true, email, sourceUrl, evidence: input.emailEvidence as Evidence };
}

export { EVIDENCE };

/* ── Payload helpers ───────────────────────────────────────────────────────────────────────────────────────── */

type PooledPayload = { prospect?: Record<string, unknown> } & Record<string, unknown>;

const isPayload = (payload: unknown): payload is PooledPayload => !!payload && typeof payload === "object" && !!(payload as PooledPayload).prospect && typeof (payload as PooledPayload).prospect === "object";

export function payloadContact(payload: unknown): { email: string | null; name: string | null; role: string | null } {
  const p = isPayload(payload) ? payload.prospect! : {};
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  return { email: str(p.email), name: str(p.contactName), role: str(p.contactRole) };
}

/** The pooled payload with new contact fields (and the email's source kept as a fact). A payload-less candidate stays so. */
export function withPayloadContact(payload: unknown, contact: { email: string; name: string | null; role: string | null; sourceFact?: { text: string; sourceUrl: string } }): unknown {
  if (!isPayload(payload)) return payload ?? null;
  const facts = Array.isArray(payload.prospect!.facts) ? (payload.prospect!.facts as unknown[]) : [];
  const nextFacts = contact.sourceFact && !facts.some((f) => (f as { text?: unknown })?.text === contact.sourceFact!.text) ? [...facts, contact.sourceFact] : facts;
  return { ...payload, prospect: { ...payload.prospect, email: contact.email, contactName: contact.name, contactRole: contact.role, facts: nextFacts } };
}

export function withoutPayloadContact(payload: unknown): unknown {
  if (!isPayload(payload)) return payload ?? null;
  return { ...payload, prospect: { ...payload.prospect, email: "", contactName: null, contactRole: null } };
}

const sourceLabel: Record<Evidence, string> = {
  published_on_site: "on the company's own site",
  published_directory: "in a public directory",
  published_filing: "in a public filing",
  published_other: "in a public source",
};
export const sourceFactFor = (email: string, evidence: Evidence, sourceUrl: string) => ({ text: `${email} is published ${sourceLabel[evidence]}.`, sourceUrl });

/* ── PATCH /candidates/{id}/contact ────────────────────────────────────────────────────────────────────────── */

export interface CandidateContactDeps extends EmailCheckDeps {
  getCandidate(id: string): Promise<CandidateRow | null>;
  saveContact(
    id: string,
    change: { email: string | null; emailSourceUrl: string | null; payload: unknown; outcome?: string; reason?: string; resetAgent: boolean },
  ): Promise<void>;
  record(detail: Record<string, unknown>): Promise<void>;
}

export async function correctCandidateContact(id: string, body: unknown, deps: CandidateContactDeps): Promise<AuditResponse> {
  const parsed = parseContactBody(body);
  if (!parsed) return bad(400, "invalid_body");
  const candidate = await deps.getCandidate(id);
  if (!candidate) return bad(404, "not_found");
  if (candidate.outcome === "added") return bad(409, "already_added", { prospectId: candidate.prospect_id });
  if (!CORRECTABLE_OUTCOMES.has(candidate.outcome)) return bad(409, "not_correctable", { outcome: candidate.outcome });

  const old = payloadContact(candidate.payload);
  const oldEmail = old.email ?? candidate.email;

  if (parsed.kind === "invalidate") {
    const reason = `Stored email invalidated by research agent: ${parsed.reason}`.slice(0, 300);
    await deps.saveContact(candidate.id, { email: null, emailSourceUrl: null, payload: withoutPayloadContact(candidate.payload), outcome: "no_email", reason, resetAgent: true });
    await deps.record({ action: "contact_correction", field: "invalidated", target: "candidate", candidateId: candidate.id, company: candidate.company, oldEmail, newEmail: null, reason: parsed.reason, previousOutcome: candidate.outcome });
    return { status: 200, body: { id: candidate.id, outcome: "no_email", invalidated: true } };
  }

  const input = parsed.value;
  const checked = await checkReplacementEmail({ ...input, website: candidate.website }, oldEmail, { ...deps, existing: deps.existing, fetchPage: deps.fetchPage });
  if (!checked.ok) return bad(422, checked.reason, { status: "rejected", reason: checked.reason });

  const name = input.contactName || null;
  const role = input.contactRole || null;
  const payload = withPayloadContact(candidate.payload, { email: checked.email, name, role, sourceFact: sourceFactFor(checked.email, checked.evidence, checked.sourceUrl) });
  await deps.saveContact(candidate.id, { email: checked.email, emailSourceUrl: checked.sourceUrl, payload, resetAgent: false });
  await deps.record({
    action: "contact_correction",
    field: "replaced",
    target: "candidate",
    candidateId: candidate.id,
    company: candidate.company,
    oldEmail,
    newEmail: checked.email,
    evidence: checked.evidence,
    sourceUrl: checked.sourceUrl,
    outcome: candidate.outcome,
  });
  // A candidate with no pooled payload (nothing was staged for it) has nowhere to keep a name or role.
  return { status: 200, body: { id: candidate.id, outcome: candidate.outcome, contactEmail: checked.email, payloadUpdated: payload !== null && payload !== candidate.payload } };
}

/* ── POST /candidates/{id}/retire ──────────────────────────────────────────────────────────────────────────── */

export const CANDIDATE_RETIRE_REASONS = ["defunct", "acquired", "not_a_fit", "out_of_scope", "other"] as const;
export const PROSPECT_INVALIDATE_REASONS = ["junk_contact", "acquired", "defunct", "not_a_fit", "other"] as const;

export const retireSchema = z.object({ reason: z.enum(CANDIDATE_RETIRE_REASONS), detail: text(300).default("") });
export const invalidateSchema = z.object({ reason: z.enum(PROSPECT_INVALIDATE_REASONS), detail: text(300).default("") });

const reasonText = (reason: string, detail: string) => (detail ? `${reason}: ${detail}` : reason).slice(0, 300);

export interface RetireDeps {
  getCandidate(id: string): Promise<CandidateRow | null>;
  saveRetired(id: string, reason: string): Promise<void>;
  record(detail: Record<string, unknown>): Promise<void>;
}

export async function retireCandidate(id: string, body: unknown, deps: RetireDeps): Promise<AuditResponse> {
  const parsed = retireSchema.safeParse(body);
  if (!parsed.success) return bad(400, "invalid_body");
  const candidate = await deps.getCandidate(id);
  if (!candidate) return bad(404, "not_found");
  if (candidate.outcome === "added") return bad(409, "already_added", { prospectId: candidate.prospect_id });
  if (!CORRECTABLE_OUTCOMES.has(candidate.outcome)) return bad(409, "not_retirable", { outcome: candidate.outcome });
  const reason = `Retired (${reasonText(parsed.data.reason, parsed.data.detail)})`;
  await deps.saveRetired(candidate.id, reason);
  await deps.record({ action: "retire", target: "candidate", candidateId: candidate.id, company: candidate.company, reason: parsed.data.reason, detail: parsed.data.detail, previousOutcome: candidate.outcome });
  return { status: 200, body: { id: candidate.id, outcome: "retired" } };
}

/* ── Prospects ─────────────────────────────────────────────────────────────────────────────────────────────── */

export interface ProspectForCorrection {
  id: string;
  company: string;
  website: string | null;
  contactEmail: string;
  contactName: string | null;
  contactRole: string | null;
  status: string;
  lastSentAt: string | null;
}

export interface ProspectCorrectionDeps extends EmailCheckDeps {
  getProspect(id: string): Promise<ProspectForCorrection | null>;
  /** True when anything has gone to this prospect or they have replied: status, last-sent time or a sent message. */
  isEngaged(prospect: ProspectForCorrection): Promise<boolean>;
  /** Writes the new contact; `resetToNew` sends it back through verification and drops anything drafted or scheduled. */
  saveContact(id: string, change: { email: string; name: string | null; role: string | null; resetToNew: boolean }): Promise<"ok" | "duplicate_email">;
  /** Marks the prospect invalid and takes it out of drafting and sending. */
  markInvalid(id: string, reason: string): Promise<void>;
  /** Marks the prospect contacted (emailed outside the pipeline) and drops anything drafted or scheduled. */
  markContacted(id: string, reason: string): Promise<void>;
  record(detail: Record<string, unknown>): Promise<void>;
}

/** Statuses a replaced contact goes back to "new" from, so the new address is verified before any send. */
const RESET_STATUSES = new Set(["verified", "drafted", "queued", "invalid"]);

export async function correctProspectContact(id: string, body: unknown, deps: ProspectCorrectionDeps): Promise<AuditResponse> {
  const parsed = parseContactBody(body);
  if (!parsed) return bad(400, "invalid_body");
  const prospect = await deps.getProspect(id);
  if (!prospect) return bad(404, "not_found");
  if (ENGAGED_STATUSES.has(prospect.status) || (await deps.isEngaged(prospect))) return bad(409, "already_engaged", { status: prospect.status });

  if (parsed.kind === "invalidate") {
    const reason = `Contact invalidated by research agent: ${parsed.reason}`.slice(0, 300);
    await deps.markInvalid(prospect.id, reason);
    await deps.record({ action: "contact_correction", field: "invalidated", target: "prospect", prospectId: prospect.id, company: prospect.company, oldEmail: prospect.contactEmail, newEmail: null, reason: parsed.reason, previousStatus: prospect.status });
    return { status: 200, body: { id: prospect.id, status: "invalid" } };
  }

  const checked = await checkReplacementEmail({ ...parsed.value, website: prospect.website }, prospect.contactEmail, { ...deps, fetchPage: deps.fetchPage, existing: deps.existing });
  if (!checked.ok) return bad(422, checked.reason, { status: "rejected", reason: checked.reason });

  const resetToNew = RESET_STATUSES.has(prospect.status);
  const saved = await deps.saveContact(prospect.id, { email: checked.email, name: parsed.value.contactName || prospect.contactName, role: parsed.value.contactRole || prospect.contactRole, resetToNew });
  if (saved === "duplicate_email") return bad(422, "duplicate_email", { status: "rejected", reason: "duplicate_email" });
  await deps.record({
    action: "contact_correction",
    field: "replaced",
    target: "prospect",
    prospectId: prospect.id,
    company: prospect.company,
    oldEmail: prospect.contactEmail,
    newEmail: checked.email,
    evidence: checked.evidence,
    sourceUrl: checked.sourceUrl,
    previousStatus: prospect.status,
    status: resetToNew ? "new" : prospect.status,
  });
  return { status: 200, body: { id: prospect.id, contactEmail: checked.email, status: resetToNew ? "new" : prospect.status } };
}

export async function invalidateProspect(id: string, body: unknown, deps: Pick<ProspectCorrectionDeps, "getProspect" | "isEngaged" | "markInvalid" | "record">): Promise<AuditResponse> {
  const parsed = invalidateSchema.safeParse(body);
  if (!parsed.success) return bad(400, "invalid_body");
  const prospect = await deps.getProspect(id);
  if (!prospect) return bad(404, "not_found");
  if (prospect.status === "invalid") return { status: 200, body: { id: prospect.id, status: "invalid", unchanged: true } };
  if (ENGAGED_STATUSES.has(prospect.status) || (await deps.isEngaged(prospect))) return bad(409, "already_engaged", { status: prospect.status });
  await deps.markInvalid(prospect.id, reasonText(parsed.data.reason, parsed.data.detail));
  await deps.record({ action: "invalidate", target: "prospect", prospectId: prospect.id, company: prospect.company, reason: parsed.data.reason, detail: parsed.data.detail, previousStatus: prospect.status });
  return { status: 200, body: { id: prospect.id, status: "invalid" } };
}

export const contactedSchema = z.object({ note: text(300).default("") });

/**
 * Records that someone already emailed this prospect outside the pipeline, so drafting, sending and follow-ups skip it.
 * A prospect the pipeline has already written to keeps its own status and the call is a no-op.
 */
export async function markProspectContacted(id: string, body: unknown, deps: Pick<ProspectCorrectionDeps, "getProspect" | "isEngaged" | "markContacted" | "record">): Promise<AuditResponse> {
  const parsed = contactedSchema.safeParse(body ?? {});
  if (!parsed.success) return bad(400, "invalid_body");
  const prospect = await deps.getProspect(id);
  if (!prospect) return bad(404, "not_found");
  if (ENGAGED_STATUSES.has(prospect.status) || (await deps.isEngaged(prospect))) return { status: 200, body: { id: prospect.id, status: prospect.status, unchanged: true } };
  const reason = (parsed.data.note ? `Contacted outside the pipeline: ${parsed.data.note}` : "Contacted outside the pipeline.").slice(0, 300);
  await deps.markContacted(prospect.id, reason);
  await deps.record({ action: "contacted", target: "prospect", prospectId: prospect.id, company: prospect.company, detail: parsed.data.note, previousStatus: prospect.status });
  return { status: 200, body: { id: prospect.id, status: "contacted" } };
}
