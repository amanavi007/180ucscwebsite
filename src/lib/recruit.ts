export type RecruitSection = "engagement" | "resume" | "interview";

export const RECRUIT_SECTIONS: { value: RecruitSection; label: string }[] = [
  { value: "engagement", label: "Engagement" },
  { value: "resume", label: "Resume / written app" },
  { value: "interview", label: "Interview" },
];

export function roundPoints(n: number): number {
  return Math.round(n * 100) / 100;
}

export function sumPoints(entries: { points: number; voidedAt: string | null }[]): number {
  return roundPoints(entries.reduce((sum, e) => (e.voidedAt ? sum : sum + e.points), 0));
}

/** Attendance points plus the adjusted resume and interview scores; a stage with no reviews yet adds nothing. */
export function combinedTotal(
  points: number,
  resume: { normalized: number } | undefined,
  interview: { normalized: number } | undefined,
): number {
  return roundPoints(points + (resume?.normalized ?? 0) + (interview?.normalized ?? 0));
}

export function formatPoints(n: number): string {
  const r = roundPoints(n);
  return r > 0 ? `+${r}` : String(r);
}

/** Returns an error message, or null when the entry is fine to save. */
export function validateAward(input: { points: number; reason?: string | null }): string | null {
  if (!Number.isFinite(input.points)) return "Enter the points as a number.";
  if (input.points < 0 && !input.reason?.trim()) return "Add a reason when giving negative points.";
  return null;
}

export function normalizeApplicantEmail(raw?: string | null): string | null {
  const e = raw?.trim().toLowerCase();
  return e ? e : null;
}

export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export interface MergeSide {
  email: string | null;
  major: string | null;
  year: string | null;
  notes: string;
}

export function needsEmailChoice(survivor: MergeSide, absorbed: MergeSide): boolean {
  return !!survivor.email && !!absorbed.email && survivor.email !== absorbed.email;
}

/** Mirrors `merge_recruit_applicants` in SQL; used to preview a merge and to validate before calling it. */
export function resolveMerge(
  survivor: MergeSide,
  absorbed: MergeSide,
  keepEmail?: string | null,
): { ok: true; merged: MergeSide } | { ok: false; error: string } {
  let email = survivor.email ?? absorbed.email;
  if (needsEmailChoice(survivor, absorbed)) {
    if (!keepEmail) return { ok: false, error: "Both applicants have different emails. Choose which one to keep." };
    if (keepEmail !== survivor.email && keepEmail !== absorbed.email) {
      return { ok: false, error: "The email to keep must be one of the two records' emails." };
    }
    email = keepEmail;
  }

  const sNotes = survivor.notes.trim();
  const aNotes = absorbed.notes.trim();
  const notes = !sNotes ? absorbed.notes : !aNotes ? survivor.notes : `${survivor.notes}\n\n${absorbed.notes}`;

  return {
    ok: true,
    merged: {
      email,
      major: survivor.major ?? absorbed.major,
      year: survivor.year ?? absorbed.year,
      notes,
    },
  };
}

/** Sorts by total (desc) then name; applicants with equal totals share a rank. */
export function rankByTotal<T extends { id: string; name: string; total: number }>(
  rows: T[],
): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  let rank = 0;
  let lastTotal: number | null = null;
  return sorted.map((row, i) => {
    if (row.total !== lastTotal) {
      rank = i + 1;
      lastTotal = row.total;
    }
    return { ...row, rank };
  });
}

/** What the Add-applicant dialog should do with `addApplicantAction`'s result: only "added" means a row was saved. */
export function classifyAddResult(result: { error?: string; needsConfirm?: boolean }): "added" | "needs-confirm" | "error" {
  if (result.error) return "error";
  if (result.needsConfirm) return "needs-confirm";
  return "added";
}

/**
 * Merges that can be undone safely: the newest not-yet-undone merge per survivor. Undoing an older one first
 * would restore a stale snapshot of the survivor and could clobber the later merge's data.
 */
export function undoableMergeIds(
  logs: { id: string; survivorId: string; createdAt: string; undoneAt: string | null }[],
): Set<string> {
  const newest = new Map<string, { id: string; createdAt: string }>();
  for (const l of logs) {
    if (l.undoneAt) continue;
    const current = newest.get(l.survivorId);
    if (!current || l.createdAt > current.createdAt) newest.set(l.survivorId, { id: l.id, createdAt: l.createdAt });
  }
  return new Set([...newest.values()].map((v) => v.id));
}

export function ringFraction(total: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, total / max));
}
