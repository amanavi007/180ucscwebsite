import { z } from "zod";
import { isBusinessInbox } from "./discovery/emails";
import type { AgentSegment, OutreachMode } from "./settings";
import { AGENT_SEGMENTS } from "./settings";
import type { ProspectDraftRow, ProspectFact } from "./types";
import { checkEmailSyntax, classifyEmail, emailDomain, normalizeEmail, partitionImport, type ExistingProspectData, type SkipReason } from "./verify";

/**
 * The rules behind the outreach agent API, kept free of the database and the network so they can be tested.
 * The routes and src/lib/data/outreach-agent.ts only wire real storage into these functions.
 */

export const MAX_BATCH = 50;
export const MAX_CLAIM = 25;
export const DEFAULT_CLAIM = 20;
/** A candidate leased to the agent is its own for this long. */
export const LEASE_MS = 24 * 3_600_000;
export const MAX_AGENT_ATTEMPTS = 3;

export const EVIDENCE = ["published_on_site", "published_directory", "published_filing", "published_other"] as const;
export type Evidence = (typeof EVIDENCE)[number];

const EVIDENCE_LABEL: Record<Evidence, string> = {
  published_on_site: "on the company's own site",
  published_directory: "in a public directory",
  published_filing: "in a public filing",
  published_other: "in a public source",
};

/** Reasons a row is not accepted: the importer's, plus the ones only the agent can hit. */
export type AgentSkipReason = SkipReason | "no_source" | "no_facts" | "mx_failed" | "free_mail" | "role_inbox" | "quota" | "backlog_full" | "invalid_row";

const NICHES = ["med-tech", "tech", "strategy", "other"] as const;

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).nullish();

const factSchema = z.object({ text: text(400), sourceUrl: text(500) });

export const prospectRowSchema = z.object({
  company: text(200).min(1),
  website: optionalText(300),
  segment: z.enum(AGENT_SEGMENTS),
  niche: z.enum(NICHES),
  sizeStage: optionalText(120),
  summary: optionalText(400),
  whyFit: optionalText(400),
  contactName: optionalText(120),
  contactRole: optionalText(120),
  contactEmail: text(254).min(1),
  emailSourceUrl: optionalText(500),
  emailEvidence: optionalText(40),
  facts: z.array(factSchema).max(12).default([]),
});
export type AgentProspectInput = z.infer<typeof prospectRowSchema>;

export const submitBodySchema = z.object({
  batchId: z.string().uuid(),
  prospects: z.array(z.unknown()).min(1).max(MAX_BATCH),
});

const httpsUrl = (value: string | null | undefined): URL | null => {
  try {
    const url = new URL((value ?? "").trim());
    return url.protocol === "https:" && url.hostname.includes(".") ? url : null;
  } catch {
    return null;
  }
};

const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, "");

/** The reason an email cannot be used for a company contact, judged on the address alone. */
export function emailProblem(email: string): AgentSkipReason | null {
  const e = normalizeEmail(email);
  if (!checkEmailSyntax(e).ok) return "invalid_email";
  const kind = classifyEmail(e);
  if (kind.disposable) return "invalid_email";
  if (kind.freeMail) return "free_mail";
  if (!isBusinessInbox(e)) return "role_inbox";
  return null;
}

/**
 * Every email must say where it was published. Any https page counts as a public source, but an address claimed to be
 * on the company's own site must come from a page on that site: a guess cannot name a page that proves it.
 */
export function sourceProblem(args: { email: string; website: string | null | undefined; sourceUrl: string | null | undefined; evidence: string | null | undefined }): "no_source" | null {
  const url = httpsUrl(args.sourceUrl);
  if (!url) return "no_source";
  if (!(EVIDENCE as readonly string[]).includes(args.evidence ?? "")) return "no_source";
  if (args.evidence === "published_on_site") {
    const own = bareHost(httpsUrl(args.website)?.hostname ?? emailDomain(args.email));
    const host = bareHost(url.hostname);
    if (host !== own && !host.endsWith(`.${own}`)) return "no_source";
  }
  return null;
}

/** Facts with a real https source only; the draft may state nothing else. */
function sourcedFacts(facts: { text: string; sourceUrl: string }[]): ProspectFact[] {
  return facts.filter((f) => f.text.length > 0 && httpsUrl(f.sourceUrl)).map((f) => ({ text: f.text, sourceUrl: f.sourceUrl.trim() }));
}

/** Where the email came from, kept with the other facts so a reviewer sees it next to the draft. */
function sourceFact(email: string, evidence: Evidence, sourceUrl: string): ProspectFact {
  return { text: `${email} is published ${EVIDENCE_LABEL[evidence]}.`, sourceUrl };
}

export function computeQuota(args: { dailyTarget: number; acceptedToday: number; backlog: number; backlogLimit: number }): number {
  if (args.backlog > args.backlogLimit) return 0;
  return Math.max(0, args.dailyTarget - args.acceptedToday);
}

export function exclusionsFrom(existing: ExistingProspectData) {
  return {
    domains: [...new Set([...existing.companyDomains, ...existing.suppressedDomains])].sort(),
    emails: [...new Set([...existing.emails, ...existing.suppressedEmails])].sort(),
    companyNames: [...existing.clientNames].sort(),
  };
}

function cloneExisting(e: ExistingProspectData): ExistingProspectData {
  return {
    emails: new Set(e.emails),
    companyDomains: new Set(e.companyDomains),
    clientNames: new Set(e.clientNames),
    suppressedEmails: new Set(e.suppressedEmails),
    suppressedDomains: new Set(e.suppressedDomains),
  };
}

/** Checks everything about a contact that does not need the database. Returns the row ready to insert, or why not. */
function checkContact(
  input: AgentProspectInput,
  extra: { facts: ProspectFact[] },
): { ok: true; row: ProspectDraftRow; evidence: Evidence; sourceUrl: string } | { ok: false; reason: AgentSkipReason } {
  const email = normalizeEmail(input.contactEmail);
  const bad = emailProblem(email);
  if (bad === "invalid_email") return { ok: false, reason: bad };
  // A missing source is reported before the address kind: a guess is a guess whatever the domain.
  const noSource = sourceProblem({ email, website: input.website, sourceUrl: input.emailSourceUrl, evidence: input.emailEvidence });
  if (noSource) return { ok: false, reason: noSource };
  if (bad) return { ok: false, reason: bad };
  const facts = extra.facts;
  if (facts.length === 0) return { ok: false, reason: "no_facts" };
  const evidence = input.emailEvidence as Evidence;
  const sourceUrl = httpsUrl(input.emailSourceUrl)!.toString();
  return {
    ok: true,
    evidence,
    sourceUrl,
    row: {
      company: input.company,
      website: httpsUrl(input.website)?.toString() ?? null,
      niche: input.niche,
      segment: input.segment,
      sizeStage: input.sizeStage || null,
      summary: input.summary || null,
      whyFit: input.whyFit || null,
      facts: [...facts, sourceFact(email, evidence, sourceUrl)],
      contactName: input.contactName || null,
      contactRole: input.contactRole || null,
      contactEmail: email,
    },
  };
}

export interface RowResult {
  company: string;
  status: "accepted" | "skipped";
  prospectId?: string;
  reason?: AgentSkipReason;
}

export interface SubmitResponse {
  accepted: number;
  mode?: OutreachMode;
  results: RowResult[];
}

export interface SubmitDeps {
  mode: OutreachMode;
  loadExisting(): Promise<ExistingProspectData>;
  /** How many more net-new prospects may be accepted today, and whether sending is too far behind to take any. */
  quota(): Promise<{ remaining: number; backlogFull: boolean }>;
  checkMx(domain: string): Promise<boolean>;
  /** Inserts the rows; an `id` of null means that address was taken by someone else a moment ago. */
  insertProspects(rows: ProspectDraftRow[]): Promise<{ email: string; id: string | null }[]>;
  /** Records the batch id so a repeat can be recognised. Returns the earlier answer for a batch seen before. */
  claimBatch(batchId: string): Promise<{ claimed: true; runId: string } | { claimed: false; stored: SubmitResponse | null }>;
  finishBatch(runId: string, response: SubmitResponse, detail: Record<string, unknown>): Promise<void>;
  /** Frees a batch id after a crash so the same batch can be sent again. */
  releaseBatch(runId: string): Promise<void>;
}

export type SubmitOutcome = { kind: "done"; body: SubmitResponse } | { kind: "in_progress" };

const rowCompany = (raw: unknown): string => {
  const company = (raw as { company?: unknown } | null)?.company;
  return typeof company === "string" && company.trim() ? company.trim().slice(0, 200) : "(unnamed)";
};

/** Sorts a batch of researched prospects into the ones to add and the ones to skip, and adds the first kind. */
export async function submitProspects(input: { batchId: string; rows: unknown[] }, deps: SubmitDeps): Promise<SubmitOutcome> {
  if (deps.mode === "off") return { kind: "done", body: { accepted: 0, mode: "off", results: [] } };

  const claim = await deps.claimBatch(input.batchId);
  if (!claim.claimed) return claim.stored ? { kind: "done", body: claim.stored } : { kind: "in_progress" };

  try {
    const results: RowResult[] = input.rows.map((raw) => ({ company: rowCompany(raw), status: "skipped" as const }));
    const skip = (i: number, reason: AgentSkipReason) => {
      results[i] = { company: results[i].company, status: "skipped", reason };
    };

    const quota = await deps.quota();
    if (quota.backlogFull) {
      input.rows.forEach((_, i) => skip(i, "backlog_full"));
    } else {
      const existing = cloneExisting(await deps.loadExisting());
      const mxByDomain = new Map<string, boolean>();
      let remaining = quota.remaining;
      const pending: { index: number; row: ProspectDraftRow; evidence: Evidence; sourceUrl: string }[] = [];

      for (let i = 0; i < input.rows.length; i++) {
        const parsed = prospectRowSchema.safeParse(input.rows[i]);
        if (!parsed.success) {
          skip(i, "invalid_row");
          continue;
        }
        const checked = checkContact(parsed.data, { facts: sourcedFacts(parsed.data.facts) });
        if (!checked.ok) {
          skip(i, checked.reason);
          continue;
        }
        const { accept, skipped } = partitionImport([checked.row], existing);
        if (skipped.length > 0) {
          skip(i, skipped[0].reason);
          continue;
        }
        const domain = emailDomain(checked.row.contactEmail);
        if (!mxByDomain.has(domain)) mxByDomain.set(domain, await deps.checkMx(domain));
        if (!mxByDomain.get(domain)) {
          skip(i, "mx_failed");
          continue;
        }
        if (remaining <= 0) {
          skip(i, "quota");
          continue;
        }
        remaining -= 1;
        // Later rows in this same batch are checked against this one.
        existing.emails.add(accept[0].contactEmail);
        existing.companyDomains.add(domain);
        existing.clientNames.add(accept[0].company.trim().toLowerCase());
        pending.push({ index: i, row: accept[0], evidence: checked.evidence, sourceUrl: checked.sourceUrl });
      }

      const inserted = pending.length > 0 ? await deps.insertProspects(pending.map((p) => p.row)) : [];
      const idByEmail = new Map(inserted.map((r) => [r.email, r.id]));
      for (const p of pending) {
        const id = idByEmail.get(p.row.contactEmail) ?? null;
        if (id) results[p.index] = { company: p.row.company, status: "accepted", prospectId: id };
        else skip(p.index, "duplicate_email");
      }
    }

    const accepted = results.filter((r) => r.status === "accepted");
    const body: SubmitResponse = { accepted: accepted.length, results };
    const skipped: Record<string, number> = {};
    for (const r of results) if (r.reason) skipped[r.reason] = (skipped[r.reason] ?? 0) + 1;
    await deps.finishBatch(claim.runId, body, {
      skipped,
      submitted: input.rows.length,
      sources: accepted.map((r) => {
        const p = results.indexOf(r);
        const raw = prospectRowSchema.safeParse(input.rows[p]);
        return raw.success ? { company: r.company, evidence: raw.data.emailEvidence, sourceUrl: raw.data.emailSourceUrl } : { company: r.company };
      }),
    });
    return { kind: "done", body };
  } catch (err) {
    await deps.releaseBatch(claim.runId).catch(() => {});
    throw err;
  }
}

/* ── Tasks: stranded companies leased to the agent ─────────────────────────────────────────────────────────── */

export function parseClaimCount(raw: string | null): number {
  const n = Number(raw);
  if (raw === null || raw.trim() === "" || !Number.isFinite(n)) return DEFAULT_CLAIM;
  return Math.min(MAX_CLAIM, Math.max(1, Math.floor(n)));
}

export interface TaskCandidate {
  id: string;
  company: string;
  website: string;
  domain: string;
  segment: string | null;
  outcome: string;
  reason: string | null;
  founders: unknown[];
  /** Facts the crawler already stored for the company. */
  knownFacts: ProspectFact[];
  niche: (typeof NICHES)[number] | null;
  sizeStage: string | null;
  summary: string | null;
  claimToken: string | null;
  claimedAt: string | null;
  attempts: number;
}

export function toTask(c: TaskCandidate) {
  return {
    candidateId: c.id,
    claimToken: c.claimToken,
    company: c.company,
    website: c.website,
    domain: c.domain,
    segment: c.segment,
    founders: c.founders,
    knownFacts: c.knownFacts,
    previousOutcome: c.outcome,
    previousReason: c.reason,
  };
}

const NOT_FOUND_REASONS = ["no_published_email", "no_named_contact", "site_down", "not_a_fit", "other"] as const;

const claimToken = z.string().uuid();
export const taskSuccessSchema = z.object({
  claimToken,
  contactName: optionalText(120),
  contactRole: optionalText(120),
  contactEmail: text(254).min(1),
  emailSourceUrl: optionalText(500),
  emailEvidence: optionalText(40),
  facts: z.array(factSchema).max(12).default([]),
});
export const taskFailureSchema = z.object({
  claimToken,
  outcome: z.literal("not_found"),
  reason: z.enum(NOT_FOUND_REASONS),
  detail: text(300).default(""),
});

export interface TaskResultDeps {
  getCandidate(id: string): Promise<TaskCandidate | null>;
  loadExisting(): Promise<ExistingProspectData>;
  checkMx(domain: string): Promise<boolean>;
  /** Turns the candidate into a prospect and marks it added. `duplicate` means the address was taken a moment ago. */
  promote(candidateId: string, row: ProspectDraftRow, emailSourceUrl: string): Promise<{ prospectId: string } | { duplicate: true }>;
  /** Clears the lease and remembers why the agent found nothing. */
  releaseClaim(candidateId: string, reason: string): Promise<void>;
  now(): Date;
}

export type TaskResultResponse = { status: number; body: Record<string, unknown> };

/** Applies the agent's answer for one leased company: promotes it to a prospect, or records that nothing was found. */
export async function submitTaskResult(candidateId: string, body: unknown, deps: TaskResultDeps): Promise<TaskResultResponse> {
  const isFailure = (body as { outcome?: unknown } | null)?.outcome === "not_found";
  const parsed = isFailure ? taskFailureSchema.safeParse(body) : taskSuccessSchema.safeParse(body);
  if (!parsed.success) return { status: 400, body: { error: "invalid_body" } };

  const candidate = await deps.getCandidate(candidateId);
  if (!candidate) return { status: 404, body: { error: "not_found" } };
  const leaseFresh = candidate.claimedAt !== null && deps.now().getTime() - new Date(candidate.claimedAt).getTime() < LEASE_MS;
  if (!candidate.claimToken || candidate.claimToken !== parsed.data.claimToken || !leaseFresh) {
    return { status: 409, body: { error: "claim_invalid" } };
  }

  if (isFailure) {
    const failure = parsed.data as z.infer<typeof taskFailureSchema>;
    await deps.releaseClaim(candidate.id, failure.detail ? `${failure.reason}: ${failure.detail}` : failure.reason);
    return { status: 200, body: { status: "recorded", attemptsLeft: Math.max(0, MAX_AGENT_ATTEMPTS - candidate.attempts) } };
  }

  const input = parsed.data as z.infer<typeof taskSuccessSchema>;
  const reject = (reason: AgentSkipReason): TaskResultResponse => ({ status: 422, body: { status: "rejected", reason } });

  const submitted = sourcedFacts(input.facts);
  const known = candidate.knownFacts;
  const checked = checkContact(
    {
      company: candidate.company,
      website: candidate.website,
      segment: (candidate.segment as AgentSegment | null) ?? "other",
      niche: candidate.niche ?? "other",
      sizeStage: candidate.sizeStage,
      summary: candidate.summary,
      contactName: input.contactName,
      contactRole: input.contactRole,
      contactEmail: input.contactEmail,
      emailSourceUrl: input.emailSourceUrl,
      emailEvidence: input.emailEvidence,
      facts: [],
    },
    { facts: [...known, ...submitted] },
  );
  if (!checked.ok) return reject(checked.reason);

  const { skipped } = partitionImport([checked.row], await deps.loadExisting());
  if (skipped.length > 0) return reject(skipped[0].reason);
  if (!(await deps.checkMx(emailDomain(checked.row.contactEmail)))) return reject("mx_failed");

  const promoted = await deps.promote(candidate.id, checked.row, checked.sourceUrl);
  if ("duplicate" in promoted) return reject("duplicate_email");
  return { status: 200, body: { status: "accepted", prospectId: promoted.prospectId } };
}

/* ── Runs: the agent's own report and heartbeat ────────────────────────────────────────────────────────────── */

const count = z.number().int().min(0).max(100_000);
export const runReportSchema = z.object({
  kind: z.enum(["research", "enrichment", "heartbeat"]).default("research"),
  evaluated: count.default(0),
  submitted: count.default(0),
  accepted: count.default(0),
  skipped: z.record(z.string().max(60), count).default({}),
  detail: z.record(z.string(), z.unknown()).default({}),
});
export type RunReport = z.infer<typeof runReportSchema>;

/** The best-known fallback when a stored run's detail is too large to keep as given. */
export function trimDetail(detail: Record<string, unknown>, maxChars = 8000): Record<string, unknown> {
  const json = JSON.stringify(detail);
  return json.length <= maxChars ? detail : { truncated: true, preview: json.slice(0, maxChars) };
}
