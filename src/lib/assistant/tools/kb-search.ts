import type { KbChunk } from "../kb";
import { terms } from "./wiki-search";

export interface KbHit {
  id: string;
  title: string;
  section: string;
  source: string;
  updated: string;
  excerpt: string;
}

/**
 * Chunk text opens with the section line and a "### Title" header and carries "*Source: …*" lines. All of that is
 * returned as fields instead, so it is stripped here. Markdown images are dropped too (the UI blocks them, and the
 * model must never be handed one to repeat).
 */
export function cleanKbText(text: string): string {
  return text
    .replace(/^[^\n]*\n\n###[^\n]*\n/, "")
    .replace(/^\*Source:.*\*\s*$/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Share of the question (by term rarity) a chunk must match to be returned at all. */
const MIN_COVERAGE = 0.4;

const count = (hay: string[], needle: string) => hay.reduce((n, w) => n + (w === needle ? 1 : 0), 0);

function trimTo(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const boundary = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(". "), cut.lastIndexOf(" "));
  return `${(boundary > max * 0.6 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
}

/**
 * Keyword-ranked chunks. Each query term is weighted by how rare it is across the chunks (idf), so words that sit in
 * nearly every chunk ("consulting", "degrees") cannot outvote the word that actually asks the question ("apply").
 * Title matches weigh most, then the section name, then body occurrences (capped per term so one repeated word cannot
 * win). A chunk only qualifies if its title or body matched terms carrying at least MIN_COVERAGE of the question's
 * idf weight: a section match alone never does, and one incidental word of a longer question ("filing" in "quarterly
 * tax filing") must not pull in an unrelated chunk.
 */
export function searchKnowledge(
  chunks: KbChunk[],
  query: string,
  opts: { maxChunks?: number; excerptChars?: number } = {},
): KbHit[] {
  const q = [...new Set(terms(query))];
  if (q.length === 0) return [];
  const { maxChunks = 2, excerptChars = 1200 } = opts;
  const docs = chunks.map((chunk) => {
    const body = cleanKbText(chunk.text);
    return { chunk, body, title: terms(chunk.title), section: terms(chunk.section), words: terms(body) };
  });
  const idf = new Map(
    q.map((t) => {
      const df = docs.reduce((n, d) => n + (d.title.includes(t) || d.words.includes(t) ? 1 : 0), 0);
      return [t, Math.log(1 + docs.length / Math.max(df, 1))] as const;
    }),
  );
  const totalWeight = [...idf.values()].reduce((a, b) => a + b, 0);
  const scored: { chunk: KbChunk; score: number; body: string }[] = [];
  for (const d of docs) {
    let matchedWeight = 0;
    let score = 0;
    for (const t of q) {
      const inTitle = d.title.includes(t);
      const inBody = Math.min(3, count(d.words, t));
      if (inTitle || inBody > 0) matchedWeight += idf.get(t) ?? 0;
      score += (idf.get(t) ?? 0) * ((inTitle ? 6 : 0) + inBody + (d.section.includes(t) ? 2 : 0));
    }
    if (matchedWeight > 0 && matchedWeight / totalWeight >= MIN_COVERAGE) scored.push({ chunk: d.chunk, score, body: d.body });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
    .slice(0, maxChunks)
    .map(({ chunk, body }) => ({
      id: chunk.id,
      title: chunk.title,
      section: chunk.section,
      source: chunk.source_title,
      updated: chunk.updated,
      excerpt: trimTo(body, excerptChars),
    }));
}
