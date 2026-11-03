import type { ProspectFact } from "../types";
import { extractCompanyEmails, pickBestEmail } from "./emails";
import { isAllowedByRobots, metaDescription, pageUrlsToTry } from "./page";
import { nicheForIndustries, rankYcCompanies, ycFacts, type YcCompany, type YcFilter } from "./yc";

export type CandidateOutcome = "added" | "duplicate" | "no_email" | "unreachable" | "no_facts" | "error";

export interface CandidateRecord {
  source: "yc";
  sourceRef: string;
  company: string;
  website: string;
  domain: string;
  outcome: CandidateOutcome;
  reason: string | null;
  prospectId: string | null;
  email: string | null;
  emailSourceUrl: string | null;
}

export interface NewProspect {
  company: string;
  website: string;
  niche: "med-tech" | "tech";
  sizeStage: string | null;
  summary: string | null;
  facts: ProspectFact[];
  email: string;
}

export interface DiscoveryDeps {
  enabled: boolean;
  /** New prospects wanted per day. */
  perDay: number;
  /** Most companies to look at in one run. */
  maxAttempts: number;
  /** Stop starting new companies after this many milliseconds. */
  budgetMs: number;
  /** Pause while this many prospects are waiting to be sent. */
  backlogLimit: number;
  filter: YcFilter;
  now(): number;
  loadDataset(): Promise<YcCompany[]>;
  seenDomains(): Promise<Set<string>>;
  addedToday(): Promise<number>;
  backlog(): Promise<number>;
  /** A reason when this company is already a prospect, a past client or suppressed. */
  findDuplicate(args: { domain: string; name: string }): Promise<string | null>;
  /** A reason when this exact address is already a prospect or suppressed. */
  emailTaken(email: string): Promise<string | null>;
  fetchRobots(origin: string): Promise<string>;
  /** The page's HTML, or null when it could not be read. */
  fetchPage(url: string): Promise<string | null>;
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

const isPlatform = (host: string) => PLATFORM_HOSTS.some((p) => host === p || host.endsWith(`.${p}`));

/** Looks at one company's own website and either adds it as a prospect or records why not. Never throws. */
export async function evaluateCandidate(c: YcCompany, deps: DiscoveryDeps): Promise<CandidateRecord> {
  const host = hostOf(c.website);
  const record: CandidateRecord = {
    source: "yc",
    sourceRef: c.slug,
    company: c.name,
    website: c.website ?? "",
    domain: host ?? "",
    outcome: "unreachable",
    reason: null,
    prospectId: null,
    email: null,
    emailSourceUrl: null,
  };
  const finish = (outcome: CandidateOutcome, reason: string | null): CandidateRecord => ({ ...record, outcome, reason });

  try {
    if (!host || isPlatform(host)) return finish("unreachable", "The listed website is a profile page, not the company's own site.");

    const duplicate = await deps.findDuplicate({ domain: host, name: c.name });
    if (duplicate) return finish("duplicate", duplicate);

    const origin = new URL(c.website!).origin;
    const robots = await deps.fetchRobots(origin);
    const urls = pageUrlsToTry(c.website!);
    const found = new Map<string, string>();
    let homeHtml: string | null = null;
    let fetchedAny = false;
    let blocked = 0;
    for (const url of urls) {
      if (!isAllowedByRobots(robots, new URL(url).pathname)) {
        blocked++;
        continue;
      }
      const html = await deps.fetchPage(url);
      if (html === null) continue;
      fetchedAny = true;
      if (url === urls[0]) homeHtml = html;
      for (const email of extractCompanyEmails(html, host)) if (!found.has(email)) found.set(email, url);
      if (pickBestEmail([...found.keys()])) break;
    }

    if (!fetchedAny) return finish("unreachable", blocked === urls.length ? "The site's robots.txt does not allow it." : "Could not load the website.");

    const email = pickBestEmail([...found.keys()]);
    if (!email) {
      const roles = [...found.keys()].slice(0, 3);
      return finish("no_email", roles.length > 0 ? `Only role inboxes published (${roles.join(", ")}).` : "No email address published on the company's site.");
    }
    record.email = email;
    record.emailSourceUrl = found.get(email) ?? null;

    const taken = await deps.emailTaken(email);
    if (taken) return finish("duplicate", taken);

    const facts = ycFacts(c);
    const description = homeHtml ? metaDescription(homeHtml) : null;
    if (description) facts.push({ text: description, sourceUrl: urls[0] });
    if (facts.length === 0) return finish("no_facts", "Nothing sourced to say about this company.");

    const size = c.team_size ? Number(c.team_size) : 0;
    record.prospectId = await deps.addProspect({
      company: c.name,
      website: c.website!,
      niche: nicheForIndustries(c.industries),
      sizeStage: size > 0 ? `${size} people${c.batch ? `, YC ${c.batch}` : ""}` : c.batch ? `YC ${c.batch}` : null,
      summary: c.one_liner?.trim() || null,
      facts,
      email,
    });
    return finish("added", null);
  } catch (err) {
    return finish("error", err instanceof Error ? err.message : String(err));
  }
}

export interface DiscoveryResult {
  added: number;
  evaluated: number;
  skipped: "disabled" | "target_met" | "backlog_full" | null;
}

/** One daily run: looks at new companies until the day's target is met, the attempt cap is hit, or time is up. */
export async function runDiscovery(deps: DiscoveryDeps): Promise<DiscoveryResult> {
  if (!deps.enabled) return { added: 0, evaluated: 0, skipped: "disabled" };
  const target = deps.perDay - (await deps.addedToday());
  if (target <= 0) return { added: 0, evaluated: 0, skipped: "target_met" };
  if ((await deps.backlog()) > deps.backlogLimit) return { added: 0, evaluated: 0, skipped: "backlog_full" };

  const seen = await deps.seenDomains();
  const started = deps.now();
  let added = 0;
  let evaluated = 0;
  for (const c of rankYcCompanies(await deps.loadDataset(), deps.filter)) {
    if (added >= target || evaluated >= deps.maxAttempts || deps.now() - started >= deps.budgetMs) break;
    const host = hostOf(c.website);
    if (!host || seen.has(host)) continue;
    seen.add(host);
    const result = await evaluateCandidate(c, deps);
    await deps.recordCandidate(result);
    evaluated++;
    if (result.outcome === "added") added++;
  }
  return { added, evaluated, skipped: null };
}
