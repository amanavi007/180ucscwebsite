export interface RecruitSettings {
  normalizeMinN: number;
  disagreementThreshold: number;
  /** Combined total an applicant needs to be invited to interview; null means no cutoff is set. */
  interviewCutoff: number | null;
  /** Combined total needed after interviews to be offered a JC spot; null means no cutoff is set. */
  jcCutoff: number | null;
}

export const DEFAULT_RECRUIT_SETTINGS: RecruitSettings = {
  normalizeMinN: 8,
  disagreementThreshold: 1.5,
  interviewCutoff: null,
  jcCutoff: null,
};

export const RECRUIT_SETTING_KEYS: Record<keyof RecruitSettings, string> = {
  normalizeMinN: "recruit_normalize_min_n",
  disagreementThreshold: "recruit_disagreement_threshold",
  interviewCutoff: "recruit_interview_cutoff",
  jcCutoff: "recruit_jc_cutoff",
};

/** The value stored in org_settings; an unset cutoff is stored as an empty string. */
export function serializeRecruitSetting(field: keyof RecruitSettings, value: RecruitSettings[keyof RecruitSettings]): string {
  return value === null || value === undefined ? "" : String(value);
}

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
  if (partial.interviewCutoff !== undefined && partial.interviewCutoff !== null) {
    if (!Number.isFinite(partial.interviewCutoff)) return "Enter the interview cutoff as a number.";
    if (partial.interviewCutoff < 0) return "The interview cutoff can't be negative.";
  }
  if (partial.jcCutoff !== undefined && partial.jcCutoff !== null) {
    if (!Number.isFinite(partial.jcCutoff)) return "Enter the JC cutoff as a number.";
    if (partial.jcCutoff < 0) return "The JC cutoff can't be negative.";
  }
  return null;
}

export function parseRecruitSettings(rows: { key: string; value: string }[]): RecruitSettings {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const read = (field: "normalizeMinN" | "disagreementThreshold"): number => {
    const parsed = Number(byKey.get(RECRUIT_SETTING_KEYS[field]));
    const candidate = { [field]: parsed } as Partial<RecruitSettings>;
    return Number.isFinite(parsed) && validateRecruitSettings(candidate) === null
      ? parsed
      : DEFAULT_RECRUIT_SETTINGS[field];
  };
  return {
    normalizeMinN: read("normalizeMinN"),
    disagreementThreshold: read("disagreementThreshold"),
    interviewCutoff: readCutoff(byKey.get(RECRUIT_SETTING_KEYS.interviewCutoff), "interviewCutoff"),
    jcCutoff: readCutoff(byKey.get(RECRUIT_SETTING_KEYS.jcCutoff), "jcCutoff"),
  };
}

function readCutoff(raw: string | undefined, field: "interviewCutoff" | "jcCutoff"): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && validateRecruitSettings({ [field]: parsed }) === null ? parsed : null;
}
