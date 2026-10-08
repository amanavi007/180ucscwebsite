export interface RecruitSettings {
  normalizeMinN: number;
  disagreementThreshold: number;
}

export const DEFAULT_RECRUIT_SETTINGS: RecruitSettings = {
  normalizeMinN: 8,
  disagreementThreshold: 1.5,
};

export const RECRUIT_SETTING_KEYS: Record<keyof RecruitSettings, string> = {
  normalizeMinN: "recruit_normalize_min_n",
  disagreementThreshold: "recruit_disagreement_threshold",
};

/** Errors for the fields present in `partial`; null when everything given is fine. */
export function validateRecruitSettings(partial: Partial<RecruitSettings>): string | null {
  if (partial.normalizeMinN !== undefined) {
    if (!Number.isFinite(partial.normalizeMinN)) return "Enter the minimum number of scores as a number.";
    if (!Number.isInteger(partial.normalizeMinN)) return "The minimum number of scores has to be a whole number.";
    if (partial.normalizeMinN < 2) return "Normalizing needs at least 2 scores per reviewer.";
  }
  if (partial.disagreementThreshold !== undefined) {
    if (!Number.isFinite(partial.disagreementThreshold) || partial.disagreementThreshold <= 0) {
      return "The disagreement threshold has to be greater than 0.";
    }
  }
  return null;
}

export function parseRecruitSettings(rows: { key: string; value: string }[]): RecruitSettings {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const read = (field: keyof RecruitSettings): number => {
    const parsed = Number(byKey.get(RECRUIT_SETTING_KEYS[field]));
    const candidate = { [field]: parsed } as Partial<RecruitSettings>;
    return Number.isFinite(parsed) && validateRecruitSettings(candidate) === null
      ? parsed
      : DEFAULT_RECRUIT_SETTINGS[field];
  };
  return {
    normalizeMinN: read("normalizeMinN"),
    disagreementThreshold: read("disagreementThreshold"),
  };
}
