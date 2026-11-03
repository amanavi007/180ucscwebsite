import type { ProspectFact } from "../types";

/** The fields we use from the open Y Combinator dataset (https://yc-oss.github.io/api/companies/all.json). */
export interface YcCompany {
  id: number;
  name: string;
  slug: string;
  website: string | null;
  one_liner: string | null;
  long_description: string | null;
  team_size: number | null;
  all_locations: string | null;
  industries: string[] | null;
  batch: string | null;
  status: string;
  url: string;
  nonprofit?: boolean;
}

export interface YcFilter {
  /** City names matched anywhere in the company's locations. */
  regions: string[];
  /** YC industry labels, e.g. "Healthcare", "B2B". */
  industries: string[];
  maxTeamSize: number;
}

export const YC_DATASET_URL = "https://yc-oss.github.io/api/companies/all.json";

const SEASON_ORDER: Record<string, number> = { winter: 1, spring: 2, summer: 3, fall: 4 };

/** "Summer 2024" -> 20243, so a higher number is a newer batch. */
function batchRank(batch: string | null): number {
  const match = /(winter|spring|summer|fall)\s+(\d{4})/i.exec(batch ?? "");
  return match ? Number(match[2]) * 10 + SEASON_ORDER[match[1].toLowerCase()] : 0;
}

const teamSizeOf = (c: { team_size: number | null | undefined }) => (c.team_size === null || c.team_size === undefined ? 0 : Number(c.team_size));

/** Teams of five or more come first (they have something to consult on and someone to answer); newer batches first within that. */
export function ycPriority(c: YcCompany): number {
  return (teamSizeOf(c) >= 5 ? 1_000_000 : 0) + batchRank(c.batch);
}

/** What a stored company needs to keep, so settings can be applied to it later. */
export interface YcMeta {
  industries: string[];
  locations: string;
  teamSize: number | null;
}

export function ycMeta(c: YcCompany): YcMeta {
  return { industries: c.industries ?? [], locations: c.all_locations ?? "", teamSize: c.team_size === null || c.team_size === undefined ? null : Number(c.team_size) };
}

/** Does a company fit today's settings? One with no directory data (a pasted company) always does. */
export function matchesFilter(meta: YcMeta | null, filter: YcFilter): boolean {
  if (!meta) return true;
  const regions = filter.regions.map((r) => r.trim().toLowerCase()).filter(Boolean);
  const industries = new Set(filter.industries.map((i) => i.trim().toLowerCase()).filter(Boolean));
  const size = meta.teamSize ?? 0;
  if (Number.isFinite(size) && size > filter.maxTeamSize) return false;
  const where = meta.locations.toLowerCase();
  if (!regions.some((r) => where.includes(r))) return false;
  return meta.industries.some((i) => industries.has(i.toLowerCase()));
}

/** Alternates med-tech items with the rest, keeping each group's own order. Med-tech is a focus niche but a small slice. */
export function interleaveMedTech<T>(items: T[], isMedTech: (item: T) => boolean): T[] {
  const medTech = items.filter(isMedTech);
  const rest = items.filter((i) => !isMedTech(i));
  const merged: T[] = [];
  for (let i = 0; i < Math.max(medTech.length, rest.length); i++) {
    if (i < medTech.length) merged.push(medTech[i]);
    if (i < rest.length) merged.push(rest[i]);
  }
  return merged;
}

/** Active, small, in-region, in-industry companies that have a website, best fit first, med-tech alternating with the rest. */
export function rankYcCompanies(companies: YcCompany[], filter: YcFilter): YcCompany[] {
  const ranked = companies
    .filter((c) => c.status === "Active" && !!c.website?.trim() && matchesFilter(ycMeta(c), filter))
    .sort((a, b) => ycPriority(b) - ycPriority(a));
  return interleaveMedTech(ranked, (c) => nicheForIndustries(c.industries) === "med-tech");
}

const MAX_FACT_LENGTH = 400;

function shorten(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= MAX_FACT_LENGTH) return clean;
  const cut = clean.slice(0, MAX_FACT_LENGTH);
  const lastSentence = cut.lastIndexOf(". ");
  return lastSentence > 80 ? cut.slice(0, lastSentence + 1) : `${cut.trimEnd()}...`;
}

/** Facts stated by the directory itself, each with the directory page as its source: nothing here is generated. */
export function ycFacts(c: YcCompany): ProspectFact[] {
  const facts: ProspectFact[] = [];
  const oneLiner = c.one_liner?.trim().replace(/\.$/, "");
  if (oneLiner) facts.push({ text: `${c.name}: ${oneLiner}.`, sourceUrl: c.url });
  const description = c.long_description?.trim();
  if (description && description.replace(/\W/g, "").toLowerCase() !== (oneLiner ?? "").replace(/\W/g, "").toLowerCase()) {
    facts.push({ text: shorten(description), sourceUrl: c.url });
  }
  const size = c.team_size === null || c.team_size === undefined ? 0 : Number(c.team_size);
  if (size > 0) {
    const city = (c.all_locations ?? "").split(";")[0].split(",")[0].trim();
    facts.push({ text: `${c.name} is a team of ${size}${city ? ` in ${city}` : ""}.`, sourceUrl: c.url });
  }
  if (c.batch?.trim()) facts.push({ text: `${c.name} is part of Y Combinator ${c.batch.trim()}.`, sourceUrl: c.url });
  return facts;
}

export function nicheForIndustries(industries: string[] | null): "med-tech" | "tech" {
  return (industries ?? []).some((i) => i.toLowerCase() === "healthcare") ? "med-tech" : "tech";
}
