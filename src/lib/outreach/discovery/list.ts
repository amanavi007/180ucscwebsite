import { parseCsvText } from "@/lib/csv-parse";

/** A company someone found (by hand or with Claude Research): a name and website, never an email. */
export interface ListLead {
  name: string;
  website: string;
  summary: string | null;
  niche: "strategy" | "tech" | "med-tech" | "other" | null;
  sources: string[];
}

export interface ListError {
  line: number;
  message: string;
}

/** One paste is crawled inside a single request, so it is capped. */
export const MAX_LIST_COMPANIES = 150;

const NICHES = ["strategy", "tech", "med-tech", "other"] as const;
const headerKey = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** "acme.com", "https://www.acme.com/about" -> "https://www.acme.com", or null when it is not a website. */
function normalizeWebsite(raw: string): string | null {
  const trimmed = raw.trim().replace(/[),.;]+$/, "");
  if (!trimmed || /\s/.test(trimmed)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.hostname.includes(".") && !url.hostname.endsWith(".") ? url.origin : null;
  } catch {
    return null;
  }
}

const hostOf = (website: string) => new URL(website).hostname.replace(/^www\./, "");

function nameFromHost(website: string): string {
  const label = hostOf(website).split(".")[0];
  return label.split(/[-_]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

const URL_IN_LINE = /(https?:\/\/\S+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?)/i;

export function parseCompanyList(text: string): { leads: ListLead[]; errors: ListError[] } {
  if (text.trim() === "") return { leads: [], errors: [{ line: 1, message: "The list is empty." }] };
  const errors: ListError[] = [];
  const found: { line: number; lead: ListLead }[] = [];

  const header = parseCsvText(text)[0] ?? [];
  const keys = header.map(headerKey);
  if (keys.includes("company") && keys.includes("website")) {
    const table = parseCsvText(text);
    const col = (name: string) => keys.indexOf(name);
    table.slice(1).forEach((cells, i) => {
      const line = i + 2;
      if (cells.every((c) => c.trim() === "")) return;
      const get = (name: string) => (col(name) === -1 ? "" : (cells[col(name)] ?? "").trim());
      const website = normalizeWebsite(get("website"));
      if (!website) return void errors.push({ line, message: "No usable website on this row." });
      const niche = get("niche").toLowerCase();
      found.push({
        line,
        lead: {
          name: get("company") || nameFromHost(website),
          website,
          summary: get("whattheydo") || null,
          niche: (NICHES as readonly string[]).includes(niche) ? (niche as ListLead["niche"]) : null,
          sources: get("sourceurls").split(/[;\n]/).map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s)),
        },
      });
    });
  } else {
    text.split(/\r?\n/).forEach((raw, i) => {
      const line = i + 1;
      if (raw.trim() === "") return;
      const match = URL_IN_LINE.exec(raw);
      // "ftp://x.com" holds a bare-domain match; a scheme other than http(s) directly before it means this is not a website.
      const otherScheme = match && /[a-z][a-z0-9+.-]*:\/\/$/i.test(raw.slice(0, match.index)) && !/^https?:\/\//i.test(match[0]);
      const website = match && !otherScheme ? normalizeWebsite(match[0]) : null;
      if (!match || !website) return void errors.push({ line, message: "No website found on this line." });
      const name = (raw.slice(0, match.index) + raw.slice(match.index + match[0].length)).replace(/^[\s,;|:\t-]+|[\s,;|:\t-]+$/g, "").replace(/^[-–—]\s*|\s*[-–—]$/g, "").trim();
      found.push({ line, lead: { name: name || nameFromHost(website), website, summary: null, niche: null, sources: [] } });
    });
  }

  const seen = new Set<string>();
  const leads: ListLead[] = [];
  for (const { lead } of found) {
    const host = hostOf(lead.website);
    if (seen.has(host)) continue;
    seen.add(host);
    if (leads.length >= MAX_LIST_COMPANIES) {
      errors.push({ line: 0, message: `Only the first ${MAX_LIST_COMPANIES} companies were kept. Paste the rest separately.` });
      break;
    }
    leads.push(lead);
  }
  return { leads, errors };
}
