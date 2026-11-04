import type { OnboardingMark } from "@/lib/supabase/database.types";

export const ONBOARDING_MARKS: OnboardingMark[] = ["present", "tardy", "excused", "unexcused"];

export const ONBOARDING_MARK_LABEL: Record<OnboardingMark, string> = {
  present: "Present",
  tardy: "Late",
  excused: "Excused",
  unexcused: "Unexcused",
};

export interface OnboardingThresholds {
  /** Flag a JC at this many unexcused absences. 0 = off. */
  maxUnexcused: number;
  /** Flag a JC at this many absences of any kind. 0 = off. */
  maxAbsences: number;
  /** Flag a JC whose rate falls below this (0-1). 0 = off. */
  minRate: number;
}

export const DEFAULT_ONBOARDING_THRESHOLDS: OnboardingThresholds = {
  maxUnexcused: 2,
  maxAbsences: 3,
  minRate: 0.8,
};

export interface OnboardingStats {
  /** Meetings where this JC has a mark (so a JC added later isn't charged for earlier meetings). */
  meetings: number;
  present: number;
  tardy: number;
  excused: number;
  unexcused: number;
  /** Excused + unexcused. */
  absences: number;
  /** (present + late) / (meetings - excused). Late counts as attended. Null with nothing to count. */
  rate: number | null;
}

export function computeOnboardingStats(marks: OnboardingMark[]): OnboardingStats {
  const count = (m: OnboardingMark) => marks.filter((x) => x === m).length;
  const present = count("present");
  const tardy = count("tardy");
  const excused = count("excused");
  const unexcused = count("unexcused");
  const denominator = marks.length - excused;
  return {
    meetings: marks.length,
    present,
    tardy,
    excused,
    unexcused,
    absences: excused + unexcused,
    rate: denominator > 0 ? (present + tardy) / denominator : null,
  };
}

/** Why a JC is flagged, as short plain phrases. Empty means they're fine. */
export function onboardingFlagReasons(stats: OnboardingStats, t: OnboardingThresholds): string[] {
  const reasons: string[] = [];
  if (t.maxUnexcused > 0 && stats.unexcused >= t.maxUnexcused) {
    reasons.push(`${stats.unexcused} unexcused`);
  }
  if (t.maxAbsences > 0 && stats.absences >= t.maxAbsences) {
    reasons.push(`${stats.absences} absences`);
  }
  if (t.minRate > 0 && stats.rate !== null && stats.rate < t.minRate) {
    reasons.push(`${Math.round(stats.rate * 100)}% attendance`);
  }
  return reasons;
}

export interface ParsedJc {
  name: string;
  email: string | null;
}

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/**
 * Pasted roster: one JC per line, "Name", "Name, email" or "Name <email>" (also tab-separated,
 * so a copied spreadsheet works). Any email domain is fine; JCs don't have chapter emails.
 */
export function parseJcLines(text: string): { jcs: ParsedJc[]; problems: string[] } {
  const jcs: ParsedJc[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let name = line;
    let email: string | null = null;
    const angle = line.match(/^(.*?)<([^>]*)>\s*$/);
    if (angle) {
      name = angle[1];
      email = angle[2];
    } else {
      const parts = line.split(/[\t,;]/).map((p) => p.trim()).filter(Boolean);
      const emailPart = parts.find((p) => p.includes("@"));
      if (emailPart) {
        email = emailPart;
        name = parts.filter((p) => p !== emailPart).join(" ");
      }
    }
    name = name.trim().replace(/\s+/g, " ");
    email = email ? email.trim().toLowerCase() : null;
    if (!name) {
      problems.push(`"${line}" has no name.`);
      continue;
    }
    if (email && !EMAIL_RE.test(email)) {
      problems.push(`${name}: "${email}" isn't a valid email.`);
      continue;
    }
    const key = (email ?? name.toLowerCase());
    if (seen.has(key)) continue;
    seen.add(key);
    jcs.push({ name, email });
  }
  return { jcs, problems };
}
