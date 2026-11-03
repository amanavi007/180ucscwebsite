import { evaluateCandidate, evaluateListLead, hostOf, inParallel, type CandidateRecord, type DiscoveryDeps, type PoolOptions } from "./runner";
import type { YcCompany } from "./yc";

/** A company that could not be used gets this many tries (a day apart) before discovery gives up on it. */
export const MAX_TRIES = 3;

/** A problem company waiting to be fixed, with how many tries it has had. */
export interface RepairItem {
  id: string;
  record: CandidateRecord;
  attempts: number;
}

export interface RepairDeps extends DiscoveryDeps {
  /** Problem companies that are due another try (never tried, or last tried over a day ago), least-tried first. */
  repairQueue(limit: number): Promise<RepairItem[]>;
  /** Stores the new state. The record may carry a new website and domain. */
  saveRepair(id: string, record: CandidateRecord, attempts: number): Promise<void>;
  /** Whether the host has a DNS address at all. */
  resolves(host: string): Promise<boolean>;
}

export interface RepairResult {
  tried: number;
  recovered: number;
  gaveUp: number;
  stillTrying: number;
  notReached: number;
}

const TLDS = ["com", "io", "ai", "co", "app", "dev", "so", "health"];
const PREFIXES = ["", "get", "try", "use", "join"];
const SUFFIXES = ["", "hq", "app"];

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Likely hostnames for a company that moved: its name or directory slug, with common startup prefixes and endings, over common endings. */
export function guessHosts(name: string, slug: string | null, skip: string[]): string[] {
  const bases = [...new Set([squash(slug ?? ""), squash(name), (slug ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "")].filter((b) => b.length >= 3))];
  const hosts: string[] = [];
  for (const base of bases) {
    for (const prefix of PREFIXES) for (const suffix of SUFFIXES) for (const tld of TLDS) hosts.push(`${prefix}${base}${suffix}.${tld}`);
  }
  const unique = [...new Set(hosts)].filter((h) => !skip.includes(h));
  // The plain names first: they are the likeliest.
  return unique.sort((a, b) => a.split(".")[0].length - b.split(".")[0].length);
}

/** The same site on the other scheme and with or without www. */
export function websiteVariants(website: string): string[] {
  try {
    const url = new URL(website);
    const bare = url.hostname.replace(/^www\./, "");
    return [...new Set([`https://${bare}`, `https://www.${bare}`, `http://${bare}`, `http://www.${bare}`])].filter((u) => new URL(u).origin !== url.origin);
  } catch {
    return [];
  }
}

/** Does this page belong to the company? Its name must appear in the page, so a parked or unrelated domain is not taken for it. */
export function pageMentions(html: string, name: string): boolean {
  const wanted = squash(name);
  if (wanted.length < 3) return false;
  const text = squash(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").slice(0, 60_000));
  return text.includes(wanted);
}

const MAX_PROBES = 6;

/** Looks for the company's new website without a search engine: names it might have moved to, kept only when they exist and mention the company. */
export async function findNewWebsite(record: CandidateRecord, deps: RepairDeps): Promise<string | null> {
  const current = hostOf(record.website);
  const candidates: string[] = [];
  for (const host of guessHosts(record.company, record.sourceRef, current ? [current] : [])) {
    if (candidates.length >= 40) break;
    if (await deps.resolves(host)) candidates.push(host);
  }
  let probes = 0;
  for (const host of candidates) {
    if (probes++ >= MAX_PROBES) break;
    const html = await deps.fetchPage(`https://${host}/`);
    if (html && pageMentions(html, record.company)) return `https://${host}`;
  }
  return null;
}

const gaveUp = (record: CandidateRecord, reason: string): CandidateRecord => ({ ...record, outcome: "failed", reason, payload: null });

/** Looks at the company again, the way its problem calls for. Returns the new state and the tries it has used. Never throws. */
export async function repairOne(item: RepairItem, dataset: Map<string, YcCompany>, deps: RepairDeps): Promise<{ record: CandidateRecord; attempts: number }> {
  const { record } = item;
  const tries = item.attempts + 1;
  try {
    if (record.outcome === "unreachable" && /robots\.txt/i.test(record.reason ?? "")) {
      return { record: gaveUp(record, "Their robots.txt asks bots not to read the site, and we respect that."), attempts: tries };
    }
    if (record.outcome === "unreachable" && /profile page/i.test(record.reason ?? "")) {
      return { record: gaveUp(record, "The listed website is a profile page, not the company's own site."), attempts: tries };
    }

    const yc = record.source === "yc" && record.sourceRef ? dataset.get(record.sourceRef) : undefined;
    if (record.source === "yc" && !yc) return { record: gaveUp(record, "No longer listed in the directory."), attempts: tries };
    const look = (website: string, deep: boolean) =>
      yc
        ? evaluateCandidate({ ...yc, website }, deps, "stage", { deep })
        : evaluateListLead({ name: record.company, website, summary: null, niche: null, sources: [] }, deps, "stage", { deep });

    // The website did not load. Same site on another address first, then a hunt for a new one, then a last plain retry.
    if (record.outcome === "unreachable" || record.outcome === "error") {
      const websites = [record.website, ...(tries === 1 ? websiteVariants(record.website) : [])].filter(Boolean);
      if (tries >= 2) {
        const moved = await findNewWebsite(record, deps);
        if (moved) websites.unshift(moved);
      }
      let last: CandidateRecord = record;
      for (const website of websites) {
        last = await look(website, true);
        if (last.outcome !== "unreachable" && last.outcome !== "error") {
          // It loads now. The look above was already a deep one, so "no email" is final.
          if (last.outcome === "no_email") {
            return { record: gaveUp(last, `${last.reason ?? "No public email found."} A deeper search of the team, about, privacy and terms pages found nothing usable.`), attempts: tries };
          }
          return { record: last, attempts: 0 };
        }
      }
      if (tries >= MAX_TRIES) {
        return { record: gaveUp(record, `The website didn't load after ${MAX_TRIES} tries, and no new website was found.`), attempts: tries };
      }
      return { record: { ...record, outcome: last.outcome, reason: `${last.reason ?? "Could not load the website."} Try ${tries} of ${MAX_TRIES}; the next is tomorrow.` }, attempts: tries };
    }

    // No email on the usual pages: read the team, about, privacy and terms pages and the links the homepage shows.
    const deep = await look(record.website, true);
    if (deep.outcome === "no_email" || deep.outcome === "unreachable" || deep.outcome === "error") {
      return { record: gaveUp(record, `${deep.reason ?? "No public email found."} A deeper search of the team, about, privacy and terms pages found nothing usable.`), attempts: tries };
    }
    return { record: deep, attempts: item.attempts };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return tries >= MAX_TRIES
      ? { record: gaveUp(record, `Failed ${MAX_TRIES} times: ${reason}`), attempts: tries }
      : { record: { ...record, outcome: "error", reason }, attempts: tries };
  }
}

/** One repair pass: each due problem company gets its next try. After the last try it moves to "failed" and nobody needs to look at it. */
export async function runRepair(deps: RepairDeps, opts: PoolOptions & { limit: number }): Promise<RepairResult> {
  const result: RepairResult = { tried: 0, recovered: 0, gaveUp: 0, stillTrying: 0, notReached: 0 };
  const queue = await deps.repairQueue(opts.limit);
  if (queue.length === 0) return result;
  const dataset = new Map((await deps.loadDataset()).map((c) => [c.slug, c]));
  result.notReached = await inParallel(queue, opts, deps.now, async (item) => {
    const { record, attempts } = await repairOne(item, dataset, deps);
    await deps.saveRepair(item.id, record, attempts);
    result.tried++;
    if (record.outcome === "ready" || record.outcome === "added") result.recovered++;
    else if (record.outcome === "failed" || record.outcome === "no_facts" || record.outcome === "duplicate") result.gaveUp++;
    else result.stillTrying++;
  });
  return result;
}
