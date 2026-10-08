import { describe, expect, it } from "vitest";
import { DEFAULT_RECRUIT_SETTINGS, RECRUIT_SETTING_KEYS, parseRecruitSettings, validateRecruitSettings } from "./recruit-settings";

describe("parseRecruitSettings", () => {
  it("falls back to defaults when nothing is stored", () => {
    expect(parseRecruitSettings([])).toEqual(DEFAULT_RECRUIT_SETTINGS);
  });
  it("reads stored values", () => {
    const rows = [
      { key: RECRUIT_SETTING_KEYS.normalizeMinN, value: "12" },
      { key: RECRUIT_SETTING_KEYS.disagreementThreshold, value: "2" },
    ];
    expect(parseRecruitSettings(rows)).toEqual({ normalizeMinN: 12, disagreementThreshold: 2 });
  });
  it("ignores garbage and out-of-range values", () => {
    const rows = [
      { key: RECRUIT_SETTING_KEYS.normalizeMinN, value: "abc" },
      { key: RECRUIT_SETTING_KEYS.disagreementThreshold, value: "-3" },
    ];
    expect(parseRecruitSettings(rows)).toEqual(DEFAULT_RECRUIT_SETTINGS);
  });
});

describe("validateRecruitSettings", () => {
  it("accepts sensible values", () => {
    expect(validateRecruitSettings({ normalizeMinN: 8, disagreementThreshold: 1.5 })).toBeNull();
  });
  it("requires a whole minimum of at least 2", () => {
    expect(validateRecruitSettings({ normalizeMinN: 1 })).toMatch(/at least 2/i);
    expect(validateRecruitSettings({ normalizeMinN: 3.5 })).toMatch(/whole/i);
  });
  it("requires a positive disagreement threshold", () => {
    expect(validateRecruitSettings({ disagreementThreshold: 0 })).toMatch(/greater than 0/i);
  });
});
