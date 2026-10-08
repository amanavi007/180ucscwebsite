export type Resolved<T> =
  | { kind: "one"; item: T }
  | { kind: "none" }
  | { kind: "many"; items: T[] };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Resolve a name the user typed to one record. The tightest tier that matches anything wins
 * (exact, then prefix, then all words present, then substring), so "Sam" finds "Sam Lee" even
 * when "Samantha Ortiz" also exists, but two "Sam"s come back as `many` for the user to pick.
 */
export function resolveByName<T>(query: string, items: T[], nameOf: (item: T) => string): Resolved<T> {
  const q = norm(query);
  if (!q) return { kind: "none" };
  const words = q.split(" ");
  const tiers: ((n: string) => boolean)[] = [
    (n) => n === q,
    (n) => n.startsWith(q),
    (n) => words.every((w) => n.split(" ").some((nw) => nw.startsWith(w))),
    (n) => n.includes(q),
  ];
  for (const test of tiers) {
    const hits = items.filter((i) => test(norm(nameOf(i))));
    if (hits.length === 1) return { kind: "one", item: hits[0] };
    if (hits.length > 1) return { kind: "many", items: hits };
  }
  return { kind: "none" };
}

/** Same person can appear once per project in the directory; keep one row per id. */
export function uniqueBy<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = keyOf(i);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
