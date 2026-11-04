import type { ProspectFact } from "../types";
import { extractCompanyEmails, isBlockedInbox, pickBestEmail } from "./emails";
import { matchFounderToEmail, type Founder } from "./founders";
import type { ListLead } from "./list";
import { deepPageUrls, isAllowedByRobots, metaDescription, pageUrlsToTry } from "./page";
import {
  interleaveMedTech,
  matchesFilter,
  nicheForIndustries,
  rankYcCompanies,
  ycFacts,
  ycMeta,
  ycPriority,
  type YcCompany,
  type YcFilter,
  type YcMeta,
} from "./yc";

/** `ready` is a company already looked at and waiting in the pool; `added` is one that became a prospect. */
export type CandidateOutcome = "ready" | "added" | "duplicate" | "no_email" | "unreachable" | "no_facts" | "error" | "failed" | "retired";

export interface NewProspect {
  company: string;
  website: string;
  niche: "med-tech" | "tech" | "strategy" | "other" | null;
  /** Unset on prospects stored before segments existed. */
  segment?: "nonprofit" | "startup" | "small_business" | "other" | null;
  sizeStage: string | null;
  summary: string | null;
  facts: ProspectFact[];
  email: string;
  contactName: string | null;
  contactRole: string | null;
}

/** Everything needed to add a ready company later without looking at its website again. */
export interface PoolPayload {
  prospect: NewProspect;
  /** Directory data, so today's settings can be applied to it later. Pasted companies have none. */
  meta: YcMeta | null;
  /** Higher is added sooner. */
  priority: number;
}

export interface CandidateRecord {
  source: "yc" | "list";
  sourceRef: string | null;
  company: string;
  website: string;
  domain: string;
  outcome: CandidateOutcome;
  reason: string | null;
  prospectId: string | null;
  email: string | null;
  emailSourceUrl: string | null;
  founders: Founder[];
  payload: PoolPayload | null;
}

export interface DiscoveryDeps {
  enabled: boolean;
  /** New prospects wanted per day. */
  perDay: number;
  /** Most companies to look at live in one run. */
  maxAttempts: number;
  /** Stop starting new companies after this many milliseconds. */
  budgetMs: number;
  /** Pause while this many prospects are waiting to be sent. */
  backlogLimit: number;
  filter: YcFilter;
  now(): number;
  loadDataset(): Promise<YcCompany[]>;
  /** Domains of every company already looked at, ready ones included. */
  seenDomains(): Promise<Set<string>>;
  /** Companies looked at ahead of time and waiting to be added. */
  readyPool(): Promise<CandidateRecord[]>;
  addedToday(): Promise<number>;
  backlog(): Promise<number>;
  /** A reason when this company is already a prospect, a past client or suppressed. */
  findDuplicate(args: { domain: string; name: string }): Promise<string | null>;
  /** A reason when this exact address is already a prospect or suppressed. */
  emailTaken(email: string): Promise<string | null>;
  fetchRobots(origin: string): Promise<string>;
  /** The page's HTML, or null when it could not be read. */
  fetchPage(url: string): Promise<string | null>;
  /** The founders the directory lists for a company. */
  fetchFounders(slug: string): Promise<Founder[]>;
  recordCandidate(record: CandidateRecord): Promise<void>;
  addProspect(prospect: NewProspect): Promise<string>;
}

/** Sites that are somebody else's page about the company, not its own domain. */
const PLATFORM_HOSTS = [
  "linkedin.com", "facebook.com", "twitter.com", "x.com", "instagram.com", "github.com", "github.io", "notion.site", "notion.so",
  "linktr.ee", "ycombinator.com", "medium.com", "producthunt.com", "apps.apple.com", "play.google.com", "calendly.com", "substack.com", "wixsite.com",
];

export function hostOf(website: string | null): string | null {
  try {
    return new URL(website ?? "").hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export const isPlatform = (host: string) => PLATFORM_HOSTS.some((p) => host === p || host.endsWith(`.${p}`));

/** The prospect to add for a directory company and the email chosen for it; used by discovery and by adding an email by hand. */
export function prospectFromYc(c: YcCompany, email: string, extraFacts: ProspectFact[] = [], founder: Founder | null = null): NewProspect {
  const size = c.team_size ? Number(c.team_size) : 0;
  return {
    company: c.name,
    website: c.website ?? "",
    niche: nicheForIndustries(c.industries),
    segment: c.nonprofit ? "nonprofit" : "startup",
    sizeStage: size > 0 ? `${size} people${c.batch ? `, YC ${c.batch}` : ""}` : c.batch ? `YC ${c.batch}` : null,
    summary: c.one_liner?.trim() || null,
    facts: [...ycFacts(c), ...extraFacts],
    email,
    contactName: founder?.name ?? null,
    contactRole: founder?.title ?? null,
  };
}

type Crawl =
  | { ok: true; domain: string; email: string; emailSourceUrl: string | null; homeHtml: string | null; homeUrl: string }
  | { ok: false; domain: string; outcome: CandidateOutcome; reason: string; email: string | null; emailSourceUrl: string | null };

/** Reads a company's own website for the email it publishes. Shared by every source of companies. */
/** Pages read in one deep look; keeps a slow site from eating the time budget. */
const MAX_DEEP_PAGES = 16;

async function crawlSite(args: { name: string; website: string }, deps: DiscoveryDeps, opts: { deep?: boolean } = {}): Promise<Crawl> {
  const host = hostOf(args.website);
  const fail = (outcome: CandidateOutcome, reason: string, email: string | null = null, emailSourceUrl: string | null = null): Crawl => ({
    ok: false,
    domain: host ?? "",
    outcome,
    reason,
    email,
    emailSourceUrl,
  });
  if (!host || isPlatform(host)) return fail("unreachable", "The listed website is a profile page, not the company's own site.");

  const duplicate = await deps.findDuplicate({ domain: host, name: args.name });
  if (duplicate) return fail("duplicate", duplicate);

  const origin = new URL(args.website).origin;
  const robots = await deps.fetchRobots(origin);
  const urls = pageUrlsToTry(args.website);
  const queue = [...urls];
  const found = new Map<string, string>();
  let homeHtml: string | null = null;
  let fetchedAny = false;
  let blocked = 0;
  for (let i = 0; i < queue.length; i++) {
    const url = queue[i];
    if (!isAllowedByRobots(robots, new URL(url).pathname)) {
      blocked++;
      continue;
    }
    const html = await deps.fetchPage(url);
    if (html === null) continue;
    fetchedAny = true;
    if (url === urls[0]) {
      homeHtml = html;
      // A deeper look adds the extra pages and whatever contact-like links the homepage itself shows.
      if (opts.deep) queue.push(...deepPageUrls(args.website, html, queue).slice(0, MAX_DEEP_PAGES - queue.length));
    }
    for (const email of extractCompanyEmails(html, host)) if (!found.has(email)) found.set(email, url);
    if (pickBestEmail([...found.keys()])) break;
  }

  if (!fetchedAny) return fail("unreachable", blocked === queue.length ? "The site's robots.txt does not allow it." : "Could not load the website.");

  const email = pickBestEmail([...found.keys()]);
  if (!email) {
    const roles = [...found.keys()].slice(0, 3);
    return fail("no_email", roles.length > 0 ? `Only role inboxes published (${roles.join(", ")}).` : "No email address published on the company's site.");
  }
  const emailSourceUrl = found.get(email) ?? null;
  const taken = await deps.emailTaken(email);
  if (taken) return fail("duplicate", taken, email, emailSourceUrl);
  return { ok: true, domain: host, email, emailSourceUrl, homeHtml, homeUrl: urls[0] };
}

function baseRecord(source: "yc" | "list", sourceRef: string | null, name: string, website: string | null): CandidateRecord {
  return {
    source,
    sourceRef,
    company: name,
    website: website ?? "",
    domain: hostOf(website) ?? "",
    outcome: "unreachable",
    reason: null,
    prospectId: null,
    email: null,
    emailSourceUrl: null,
    founders: [],
    payload: null,
  };
}

/** Add the prospect now, or (stage) keep it ready in the pool with everything needed to add it later. */
async function finishWithProspect(record: CandidateRecord, prospect: NewProspect, meta: YcMeta | null, priority: number, mode: "add" | "stage", deps: DiscoveryDeps): Promise<CandidateRecord> {
  if (prospect.facts.length === 0) return { ...record, outcome: "no_facts", reason: "Nothing sourced to say about this company." };
  if (mode === "stage") return { ...record, outcome: "ready", reason: null, payload: { prospect, meta, priority } };
  return { ...record, outcome: "added", reason: null, prospectId: await deps.addProspect(prospect) };
}

/** Looks at one directory company's own website and either adds it, stages it, or records why not. Never throws. */
export async function evaluateCandidate(c: YcCompany, deps: DiscoveryDeps, mode: "add" | "stage" = "add", opts: { deep?: boolean } = {}): Promise<CandidateRecord> {
  const record = baseRecord("yc", c.slug, c.name, c.website);
  try {
    // The founders are kept even when no email is found, so a person adding one by hand knows who to look for.
    record.founders = await deps.fetchFounders(c.slug).catch(() => []);
    const crawl = await crawlSite({ name: c.name, website: c.website ?? "" }, deps, opts);
    record.domain = crawl.domain;
    record.email = crawl.ok ? crawl.email : crawl.email;
    record.emailSourceUrl = crawl.emailSourceUrl;
    if (!crawl.ok) return { ...record, outcome: crawl.outcome, reason: crawl.reason };

    const description = crawl.homeHtml ? metaDescription(crawl.homeHtml) : null;
    const prospect = prospectFromYc(c, crawl.email, description ? [{ text: description, sourceUrl: crawl.homeUrl }] : [], matchFounderToEmail(crawl.email, record.founders));
    return await finishWithProspect(record, prospect, ycMeta(c), ycPriority(c), mode, deps);
  } catch (err) {
    return { ...record, outcome: "error", reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Pasted companies are tried before directory ones. */
const LIST_PRIORITY = 10_000_000;

/** Same as evaluateCandidate, for a company someone pasted in (a name and website, never an email). */
export async function evaluateListLead(lead: ListLead, deps: DiscoveryDeps, mode: "add" | "stage" = "stage", opts: { deep?: boolean } = {}): Promise<CandidateRecord> {
  const record = baseRecord("list", null, lead.name, lead.website);
  try {
    const crawl = await crawlSite({ name: lead.name, website: lead.website }, deps, opts);
    record.domain = crawl.domain;
    record.email = crawl.email;
    record.emailSourceUrl = crawl.emailSourceUrl;
    if (!crawl.ok) return { ...record, outcome: crawl.outcome, reason: crawl.reason };

    const facts: ProspectFact[] = [];
    if (lead.summary) facts.push({ text: lead.summary, sourceUrl: lead.sources[0] ?? lead.website });
    const description = crawl.homeHtml ? metaDescription(crawl.homeHtml) : null;
    if (description) facts.push({ text: description, sourceUrl: crawl.homeUrl });
    const prospect: NewProspect = {
      company: lead.name,
      website: lead.website,
      niche: lead.niche,
      sizeStage: null,
      summary: lead.summary,
      facts,
      email: crawl.email,
      contactName: null,
      contactRole: null,
    };
    return await finishWithProspect(record, prospect, null, LIST_PRIORITY, mode, deps);
  } catch (err) {
    return { ...record, outcome: "error", reason: err instanceof Error ? err.message : String(err) };
  }
}

/** The pool in the order companies should be added: pasted ones first, then directory ones, best first, med-tech alternating. */
function orderPool(entries: CandidateRecord[]): CandidateRecord[] {
  const byPriority = (a: CandidateRecord, b: CandidateRecord) => (b.payload?.priority ?? 0) - (a.payload?.priority ?? 0);
  const pasted = entries.filter((e) => e.payload?.meta === null).sort(byPriority);
  const directory = entries.filter((e) => e.payload?.meta !== null).sort(byPriority);
  return [...pasted, ...interleaveMedTech(directory, (e) => e.payload?.prospect.niche === "med-tech")];
}

/** Adds a ready company after checking again that it is still new. */
async function addFromPool(entry: CandidateRecord, deps: DiscoveryDeps): Promise<CandidateRecord> {
  const pooled = entry.payload!.prospect;
  // Most pooled payloads carry no contact name although the founders are stored: default to the first founder.
  const lead = entry.founders[0];
  const prospect = !pooled.contactName && lead?.name ? { ...pooled, contactName: lead.name, contactRole: pooled.contactRole ?? lead.title } : pooled;
  try {
    if (isBlockedInbox(prospect.email)) return { ...entry, outcome: "no_email", reason: `Stored email ${prospect.email} is a role or junk inbox.` };
    const duplicate = (await deps.findDuplicate({ domain: entry.domain, name: entry.company })) ?? (await deps.emailTaken(prospect.email));
    if (duplicate) return { ...entry, outcome: "duplicate", reason: duplicate };
    return { ...entry, outcome: "added", reason: null, prospectId: await deps.addProspect(prospect) };
  } catch (err) {
    return { ...entry, outcome: "error", reason: err instanceof Error ? err.message : String(err) };
  }
}

export interface DiscoveryResult {
  added: number;
  /** Companies looked at live (crawled) in this run. */
  evaluated: number;
  /** Companies added straight from the pool. */
  fromPool: number;
  skipped: "disabled" | "target_met" | "backlog_full" | null;
}

/**
 * One daily run. Adds the day's target, taking ready companies from the pool first (no crawling), then looking at
 * new directory companies live for whatever is left, until the target is met, the attempt cap is hit, or time is up.
 */
export async function runDiscovery(deps: DiscoveryDeps): Promise<DiscoveryResult> {
  if (!deps.enabled) return { added: 0, evaluated: 0, fromPool: 0, skipped: "disabled" };
  const target = deps.perDay - (await deps.addedToday());
  if (target <= 0) return { added: 0, evaluated: 0, fromPool: 0, skipped: "target_met" };
  if ((await deps.backlog()) > deps.backlogLimit) return { added: 0, evaluated: 0, fromPool: 0, skipped: "backlog_full" };

  let added = 0;
  let fromPool = 0;
  const pool = orderPool((await deps.readyPool()).filter((e) => e.payload && matchesFilter(e.payload.meta, deps.filter)));
  for (const entry of pool) {
    if (added >= target) break;
    const result = await addFromPool(entry, deps);
    await deps.recordCandidate(result);
    if (result.outcome === "added") {
      added++;
      fromPool++;
    }
  }

  const seen = await deps.seenDomains();
  const started = deps.now();
  let evaluated = 0;
  if (added < target) {
    for (const c of rankYcCompanies(await deps.loadDataset(), deps.filter)) {
      if (added >= target || evaluated >= deps.maxAttempts || deps.now() - started >= deps.budgetMs) break;
      const host = hostOf(c.website);
      if (!host || seen.has(host)) continue;
      seen.add(host);
      const result = await evaluateCandidate(c, deps, "add");
      await deps.recordCandidate(result);
      evaluated++;
      if (result.outcome === "added") added++;
    }
  }
  return { added, evaluated, fromPool, skipped: null };
}

export interface PoolOptions {
  concurrency: number;
  budgetMs: number;
}

/** Runs `work` over `items` with a few at a time, stopping to start new ones when time is up. Returns how many were never started. */
export async function inParallel<T>(items: T[], opts: PoolOptions, now: () => number, work: (item: T) => Promise<void>): Promise<number> {
  const started = now();
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, opts.concurrency) }, async () => {
      while (next < items.length && now() - started < opts.budgetMs) {
        const item = items[next++];
        // One company failing to be recorded must not stop the rest of a long run.
        await work(item).catch((err) => console.error("discovery worker failed:", err));
      }
    }),
  );
  return items.length - next;
}

export interface BackfillResult {
  evaluated: number;
  byOutcome: Record<string, number>;
  notReached: number;
}

/** Looks at directory companies ahead of time, storing each as ready (or why not), so the daily run can add them without crawling. */
export async function backfillPool(deps: DiscoveryDeps, opts: PoolOptions & { limit: number; filter?: YcFilter; onProgress?: (done: number, record: CandidateRecord) => void }): Promise<BackfillResult> {
  const seen = await deps.seenDomains();
  const todo = rankYcCompanies(await deps.loadDataset(), opts.filter ?? deps.filter)
    .filter((c) => {
      const host = hostOf(c.website);
      if (!host || seen.has(host)) return false;
      seen.add(host);
      return true;
    })
    .slice(0, opts.limit);
  const byOutcome: Record<string, number> = {};
  let evaluated = 0;
  const notReached = await inParallel(todo, opts, deps.now, async (c) => {
    const result = await evaluateCandidate(c, deps, "stage");
    await deps.recordCandidate(result);
    byOutcome[result.outcome] = (byOutcome[result.outcome] ?? 0) + 1;
    evaluated++;
    opts.onProgress?.(evaluated, result);
  });
  return { evaluated, byOutcome, notReached };
}

export interface StageResult {
  staged: number;
  skippedKnown: number;
  notReached: number;
  byOutcome: Record<string, number>;
}

/** Reads each pasted company's website and stores the result: ready to add, or why not. */
export async function stageLeads(leads: ListLead[], deps: DiscoveryDeps, opts: PoolOptions): Promise<StageResult> {
  const seen = await deps.seenDomains();
  const todo = leads.filter((lead) => {
    const host = hostOf(lead.website);
    if (!host || seen.has(host)) return false;
    seen.add(host);
    return true;
  });
  const byOutcome: Record<string, number> = {};
  let staged = 0;
  const notReached = await inParallel(todo, opts, deps.now, async (lead) => {
    const result = await evaluateListLead(lead, deps, "stage");
    await deps.recordCandidate(result);
    byOutcome[result.outcome] = (byOutcome[result.outcome] ?? 0) + 1;
    if (result.outcome === "ready") staged++;
  });
  return { staged, skippedKnown: leads.length - todo.length, notReached, byOutcome };
}
