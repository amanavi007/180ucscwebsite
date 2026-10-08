type Page = { title: string; slug: string; section: string; body: string };

const STOP = new Set(
  "a an and are as at be but by can do does for from how i if in is it its me my of on or our should so that the their them then there these this to us was we what when where which who why will with would you your".split(" "),
);

/** Lowercase words with a light stem so "writing"/"writes"/"write" meet. */
export function terms(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

/** Crude on purpose: both sides of a comparison go through it, so it only has to be consistent. */
function stem(w: string): string {
  let s = w;
  if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1);
  if (s.length > 5 && s.endsWith("ing")) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith("ed")) s = s.slice(0, -2);
  if (s.length > 3 && s.endsWith("e")) s = s.slice(0, -1);
  return s;
}

/** Split a markdown body into paragraph-sized pieces, each carrying the heading it sits under. */
export function chunkBody(body: string, maxLen = 700): { heading: string; text: string }[] {
  const out: { heading: string; text: string }[] = [];
  let heading = "";
  let buf = "";
  const flush = () => {
    const text = buf.trim();
    if (text) out.push({ heading, text });
    buf = "";
  };
  for (const line of body.split(/\r?\n/)) {
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) {
      flush();
      heading = h[1].trim();
      continue;
    }
    if (!line.trim()) {
      if (buf.length >= 200) flush();
      else if (buf) buf += "\n";
      continue;
    }
    buf += (buf && !buf.endsWith("\n") ? "\n" : "") + line;
    if (buf.length >= maxLen) flush();
  }
  flush();
  return out;
}

export interface WikiHit {
  title: string;
  section: string;
  slug: string;
  score: number;
  excerpt: string;
}

const count = (hay: string[], needle: string) => hay.reduce((n, w) => n + (w === needle ? 1 : 0), 0);

/** Keyword-ranked passages: title and heading matches weigh most, and a page is represented by its best passages. */
export function searchWiki(pages: Page[], query: string, opts: { maxPages?: number; excerptChars?: number } = {}): WikiHit[] {
  const q = [...new Set(terms(query))];
  if (q.length === 0) return [];
  const { maxPages = 3, excerptChars = 900 } = opts;
  const hits: WikiHit[] = [];
  for (const page of pages) {
    const titleTerms = terms(page.title);
    const titleScore = q.reduce((n, t) => n + (titleTerms.includes(t) ? 6 : 0), 0);
    const chunks = chunkBody(page.body).map((c) => {
      const words = terms(`${c.heading} ${c.text}`);
      const headTerms = terms(c.heading);
      const score = q.reduce((n, t) => n + Math.min(3, count(words, t)) + (headTerms.includes(t) ? 3 : 0), 0);
      return { ...c, score };
    });
    const best = chunks.filter((c) => c.score > 0).sort((a, b) => b.score - a.score).slice(0, 2);
    const score = titleScore + best.reduce((n, c) => n + c.score, 0);
    if (score === 0) continue;
    let excerpt = best.map((c) => (c.heading ? `${c.heading}: ${c.text}` : c.text)).join("\n…\n");
    if (!excerpt) excerpt = chunks[0] ? chunks[0].text : "";
    if (excerpt.length > excerptChars) excerpt = `${excerpt.slice(0, excerptChars - 1)}…`;
    hits.push({ title: page.title, section: page.section, slug: page.slug, score, excerpt });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, maxPages);
}

export const wikiHref = (section: string, slug: string) => `/portal/resources?section=${section}&page=${slug}`;
