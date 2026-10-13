export interface Assignment {
  applicantId: string;
  reviewerId: string;
}

export interface AssignInput {
  applicantIds: string[];
  pool: string[];
  perApplicant: number;
  excluded: Set<string>;
  existing: Assignment[];
  seed: number;
}

export type AssignResult =
  | { ok: true; added: Assignment[] }
  | { ok: false; applicantId: string; need: number; eligible: number };

export const exclusionKey = (applicantId: string, reviewerId: string) => `${applicantId}:${reviewerId}`;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Greedy least-loaded assignment with seeded random tie-breaking. Existing assignments count toward N,
 * so running it again only fills shortfalls. All-or-nothing: if any applicant can't be filled, nothing is added.
 */
export function assignReviewers(input: AssignInput): AssignResult {
  const rand = mulberry32(input.seed);
  const load = new Map(input.pool.map((id) => [id, 0]));
  const have = new Map<string, Set<string>>();
  for (const e of input.existing) {
    have.set(e.applicantId, (have.get(e.applicantId) ?? new Set()).add(e.reviewerId));
    if (load.has(e.reviewerId)) load.set(e.reviewerId, load.get(e.reviewerId)! + 1);
  }

  const order = [...input.applicantIds];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const added: Assignment[] = [];
  for (const applicantId of order) {
    const mine = have.get(applicantId) ?? new Set<string>();
    const need = input.perApplicant - mine.size;
    if (need <= 0) continue;
    const eligible = input.pool.filter((id) => !mine.has(id) && !input.excluded.has(exclusionKey(applicantId, id)));
    if (eligible.length < need) return { ok: false, applicantId, need, eligible: eligible.length };
    const ranked = eligible
      .map((id) => ({ id, load: load.get(id)!, tie: rand() }))
      .sort((x, y) => x.load - y.load || x.tie - y.tie);
    for (const pick of ranked.slice(0, need)) {
      added.push({ applicantId, reviewerId: pick.id });
      load.set(pick.id, pick.load + 1);
    }
  }
  return { ok: true, added };
}

export function selfExclusions(
  applicants: { id: string; email: string | null }[],
  reviewers: { id: string; email: string }[],
): Set<string> {
  const byEmail = new Map(reviewers.map((r) => [r.email.trim().toLowerCase(), r.id]));
  const out = new Set<string>();
  for (const a of applicants) {
    const reviewerId = a.email ? byEmail.get(a.email.trim().toLowerCase()) : undefined;
    if (reviewerId) out.add(exclusionKey(a.id, reviewerId));
  }
  return out;
}

export interface ApplicantReviewState {
  assigned: number;
  submitted: number;
  unlocked: boolean;
  status: "unassigned" | "not-started" | "in-progress" | "complete" | "revealed";
}

export function reviewState(assigned: string[], submitted: string[], forceRevealed: boolean): ApplicantReviewState {
  const done = new Set(submitted);
  const submittedCount = assigned.filter((id) => done.has(id)).length;
  const allDone = assigned.length > 0 && submittedCount === assigned.length;
  const status: ApplicantReviewState["status"] = allDone
    ? "complete"
    : forceRevealed
      ? "revealed"
      : assigned.length === 0
        ? "unassigned"
        : submittedCount === 0
          ? "not-started"
          : "in-progress";
  return { assigned: assigned.length, submitted: submittedCount, unlocked: allDone || forceRevealed, status };
}

/** Resume-stage blindness: my own review always; others' submitted reviews only once unlocked. */
export function resumeVisibility<T extends { reviewerId: string; submitted: boolean }>(
  viewerId: string,
  reviews: T[],
  unlocked: boolean,
): { mine: T | null; others: T[] } {
  return {
    mine: reviews.find((r) => r.reviewerId === viewerId) ?? null,
    others: unlocked ? reviews.filter((r) => r.reviewerId !== viewerId && r.submitted) : [],
  };
}
