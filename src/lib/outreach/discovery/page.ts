export const BOT_NAME = "180dcucsc-research-bot";
export const USER_AGENT = `${BOT_NAME}/1.0 (+https://www.ucsc180dc.org)`;

interface Rule {
  allow: boolean;
  pattern: RegExp;
  length: number;
}

function ruleFor(allow: boolean, value: string): Rule | null {
  if (!value) return null;
  const source = value.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\$$/, "$$");
  return { allow, pattern: new RegExp(`^${source}`), length: value.length };
}

/** Whether robots.txt lets us fetch `path`. Missing or unreadable rules mean yes. */
export function isAllowedByRobots(robotsTxt: string, path: string): boolean {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    const rule = field === "allow" ? ruleFor(true, value) : field === "disallow" ? ruleFor(false, value) : null;
    if (rule) current.rules.push(rule);
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && BOT_NAME.toLowerCase().includes(a)));
  const applicable = mine.length > 0 ? mine : groups.filter((g) => g.agents.includes("*"));
  const matches = applicable.flatMap((g) => g.rules).filter((r) => r.pattern.test(path));
  if (matches.length === 0) return true;
  const longest = Math.max(...matches.map((r) => r.length));
  // On a tie, Allow wins.
  return matches.filter((r) => r.length === longest).some((r) => r.allow);
}

const decodeEntities = (text: string) =>
  text.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** The page's own one-line description of itself, when it is long enough to be a fact. */
export function metaDescription(html: string): string | null {
  const patterns = [
    /<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]*content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["'](?:og:)?description["']/i,
  ];
  for (const pattern of patterns) {
    const text = pattern.exec(html)?.[1];
    if (text) {
      const clean = decodeEntities(text).replace(/\s+/g, " ").trim();
      return clean.length >= 25 ? clean : null;
    }
  }
  return null;
}

const PAGE_PATHS = ["/", "/contact", "/about", "/team", "/company", "/contact-us"];

export function pageUrlsToTry(homeUrl: string): string[] {
  return PAGE_PATHS.map((path) => new URL(path, homeUrl).toString());
}

/** Pages a first look skips. Privacy and terms pages often name a real contact; "about us" and "people" often name the team. */
const DEEP_PATHS = ["/about-us", "/people", "/our-team", "/leadership", "/contact/", "/privacy", "/privacy-policy", "/terms", "/legal", "/imprint", "/support", "/press", "/partners", "/careers"];
const CONTACT_LINK = /contact|about|team|people|company|leadership|privacy|terms|legal|imprint|press|partner|reach|connect|hello|support/i;

/** Links on the homepage that point at a page likely to publish a contact, on the same site. At most `max`. */
export function contactLinks(html: string, homeUrl: string, max = 6): string[] {
  const home = new URL(homeUrl);
  const found = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*?href=["']([^"'#]+)["'][^>]*>/gi)) {
    try {
      const url = new URL(m[1].trim(), home);
      if (url.hostname.replace(/^www\./, "") !== home.hostname.replace(/^www\./, "")) continue;
      if (!/^https?:$/.test(url.protocol) || /\.(png|jpe?g|gif|svg|webp|pdf|zip|css|js)$/i.test(url.pathname)) continue;
      if (url.pathname === "/" || !CONTACT_LINK.test(url.pathname)) continue;
      found.add(`${url.origin}${url.pathname}`);
    } catch {
      // not a usable link
    }
    if (found.size >= max) break;
  }
  return [...found];
}

/** The extra pages for a deeper look: the usual ones plus the links the homepage itself points to. */
export function deepPageUrls(homeUrl: string, homeHtml: string | null, already: string[]): string[] {
  const known = new Set(already);
  // The site's own links come first: they are known to exist, unlike the guessed paths.
  const extra = [...(homeHtml ? contactLinks(homeHtml, homeUrl) : []), ...DEEP_PATHS.map((path) => new URL(path, homeUrl).toString())];
  return [...new Set(extra)].filter((u) => !known.has(u));
}
