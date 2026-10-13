export interface ReviewSettings {
  perApplicant: number;
  /** Profile ids allowed to review; empty means every exec. */
  pool: string[];
}

export const DEFAULT_REVIEW_SETTINGS: ReviewSettings = { perApplicant: 2, pool: [] };

export const REVIEW_SETTING_KEYS = {
  perApplicant: "recruit_reviewers_per_applicant",
  pool: "recruit_reviewer_pool",
} as const;

export function validateReviewSettings(partial: Partial<ReviewSettings>): string | null {
  if (partial.perApplicant !== undefined) {
    if (!Number.isInteger(partial.perApplicant)) return "Reviewers per applicant has to be a whole number.";
    if (partial.perApplicant < 1 || partial.perApplicant > 10) return "Reviewers per applicant has to be between 1 and 10.";
  }
  return null;
}

export function parseReviewSettings(rows: { key: string; value: string }[]): ReviewSettings {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const n = Number(byKey.get(REVIEW_SETTING_KEYS.perApplicant));
  const perApplicant =
    Number.isFinite(n) && validateReviewSettings({ perApplicant: n }) === null ? n : DEFAULT_REVIEW_SETTINGS.perApplicant;
  const pool = (byKey.get(REVIEW_SETTING_KEYS.pool) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { perApplicant, pool };
}
