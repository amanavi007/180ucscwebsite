/** Below this score two names are treated as different people. */
export const MAYBE_MIN_SCORE = 75;

export type MatchClass = "duplicate" | "likely" | "maybe";
export type MatchReason = "email" | "name" | "alias" | "fuzzy";

export interface MatchableApplicant {
  id: string;
  name: string;
  email: string | null;
  aliases: string[];
}

export interface MatchCandidate {
  applicantId: string;
  score: number;
  kind: MatchClass;
  reason: MatchReason;
}

export interface DuplicatePair {
  a: string;
  b: string;
  score: number;
  kind: MatchClass;
  reason: MatchReason;
}

/** Lowercase, de-accent, drop pronouns/device suffixes, flip "Last, First", keep letters and single spaces only. */
export function normalizeName(raw: string): string {
  let s = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/\s+-\s+.*$/, " ");
  if (/^[^,]+,[^,]+$/.test(s)) {
    const [last, first] = s.split(",");
    s = `${first} ${last}`;
  }
  s = s.replace(/['’`]/g, "");
  s = s.replace(/[^a-z\s]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = temp;
    }
  }
  return prev[b.length];
}

// First names allow nicknames ("jess" ~ "jessica"); last names do not, so
// "kim" never matches "kimball".
function firstNameScore(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 1 || b.length === 1) return a[0] === b[0] ? 0.8 : 0;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 3 && long.startsWith(short)) return 0.85;
  if (Math.min(a.length, b.length) >= 4 && editDistance(a, b) === 1) return 0.9;
  return 0;
}

function lastNameScore(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 1 || b.length === 1) return a[0] === b[0] ? 0.8 : 0;
  const shortest = Math.min(a.length, b.length);
  const d = editDistance(a, b);
  if (d === 1 && shortest >= 4) return 0.9;
  if (d === 2 && shortest >= 8) return 0.8;
  return 0;
}

/** Similarity 0–100 between two already-normalized names. */
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 100;
  const ta = a.split(" ");
  const tb = b.split(" ");
  if (ta.length === 1 || tb.length === 1) {
    return Math.round(Math.min(firstNameScore(ta[0], tb[0]), 0.6) * 100);
  }
  const direct = (firstNameScore(ta[0], tb[0]) + lastNameScore(ta[ta.length - 1], tb[tb.length - 1])) / 2;
  const swapped = (firstNameScore(ta[0], tb[tb.length - 1]) + lastNameScore(ta[ta.length - 1], tb[0])) / 2;
  return Math.round(Math.max(direct, swapped) * 100);
}

function normalizeEmail(email: string | null | undefined): string | null {
  const e = email?.trim().toLowerCase();
  return e ? e : null;
}

interface Comparable {
  names: string[]; // normalized; names[0] is the applicant's own name, the rest are aliases
  email: string | null;
}

function compare(a: Comparable, b: Comparable): Omit<MatchCandidate, "applicantId"> | null {
  if (a.email && b.email && a.email === b.email) {
    return { score: 100, kind: "duplicate", reason: "email" };
  }
  const emailsConflict = !!a.email && !!b.email && a.email !== b.email;

  let best = 0;
  let viaAlias = false;
  for (const an of a.names) {
    b.names.forEach((bn, j) => {
      const s = nameSimilarity(an, bn);
      if (s > best) {
        best = s;
        viaAlias = j > 0;
      }
    });
  }

  if (best === 100) {
    if (emailsConflict) return { score: 90, kind: "maybe", reason: "name" };
    return { score: 100, kind: "likely", reason: viaAlias ? "alias" : "name" };
  }
  if (best >= MAYBE_MIN_SCORE) return { score: best, kind: "maybe", reason: "fuzzy" };
  return null;
}

function toComparable(a: { name: string; email: string | null; aliases?: string[] }): Comparable {
  return {
    names: [normalizeName(a.name), ...(a.aliases ?? []).map(normalizeName)].filter(Boolean),
    email: normalizeEmail(a.email),
  };
}

const KIND_ORDER: Record<MatchClass, number> = { duplicate: 0, likely: 1, maybe: 2 };

function bySeverity(
  x: { score: number; kind: MatchClass },
  y: { score: number; kind: MatchClass },
): number {
  return y.score - x.score || KIND_ORDER[x.kind] - KIND_ORDER[y.kind];
}

/** Who in `existing` might be the person described by `input`, best match first. */
export function findMatches(
  input: { name: string; email?: string | null },
  existing: MatchableApplicant[],
): MatchCandidate[] {
  const probe = toComparable({ name: input.name, email: input.email ?? null });
  if (probe.names.length === 0 && !probe.email) return [];

  const out: MatchCandidate[] = [];
  for (const ap of existing) {
    const result = compare(probe, toComparable(ap));
    if (result) out.push({ applicantId: ap.id, ...result });
  }
  return out.sort(bySeverity);
}

export function pairKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

/** Every suspected duplicate pair in `applicants`, minus pairs an exec dismissed. */
export function findDuplicatePairs(applicants: MatchableApplicant[], dismissed: Set<string>): DuplicatePair[] {
  const comparables = applicants.map(toComparable);
  const out: DuplicatePair[] = [];
  for (let i = 0; i < applicants.length; i++) {
    for (let j = i + 1; j < applicants.length; j++) {
      if (dismissed.has(pairKey(applicants[i].id, applicants[j].id))) continue;
      const result = compare(comparables[i], comparables[j]);
      if (result) out.push({ a: applicants[i].id, b: applicants[j].id, ...result });
    }
  }
  return out.sort(bySeverity);
}
