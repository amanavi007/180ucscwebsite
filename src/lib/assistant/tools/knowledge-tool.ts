import { KB_CHUNKS, type KbChunk } from "../kb";
import { searchKnowledge } from "./kb-search";
import { capped, empty } from "./read-tools";
import type { ToolDeps } from "./types";

/**
 * The chapter knowledge base: org, roles, recruitment, project lifecycle, consulting methods, FAQ. Static and
 * bundled, so it needs no data layer and no per-user scoping. Ids and Drive urls are deliberately left out.
 */
export function runKnowledge(deps: Pick<ToolDeps, "rowCap">, query: string, chunks: KbChunk[] = KB_CHUNKS) {
  const hits = searchKnowledge(chunks, query).map(({ title, section, source, updated, excerpt }) => ({ title, section, source, updated, excerpt }));
  if (hits.length === 0) {
    return empty<(typeof hits)[number]>("The chapter knowledge base doesn't cover that. Say so; do not invent an answer, and suggest asking a PM or exec.");
  }
  return capped(hits, deps.rowCap);
}
