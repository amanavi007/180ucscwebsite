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
      { key: RECRUIT_SETTING_KEYS.jcCutoff, value: "14.5" },
    ];
    expect(parseRecruitSettings(rows)).toEqual({
      normalizeMinN: 12,
      disagreementThreshold: 2,
      interviewCutoff: null,
      jcCutoff: 14.5,
    });
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

describe("interview cutoff", () => {
  it("is unset by default and when stored empty", () => {
    expect(parseRecruitSettings([]).interviewCutoff).toBeNull();
    expect(parseRecruitSettings([{ key: RECRUIT_SETTING_KEYS.interviewCutoff, value: "" }]).interviewCutoff).toBeNull();
  });
  it("reads a stored number, including 0", () => {
    expect(parseRecruitSettings([{ key: RECRUIT_SETTING_KEYS.interviewCutoff, value: "12.5" }]).interviewCutoff).toBe(12.5);
    expect(parseRecruitSettings([{ key: RECRUIT_SETTING_KEYS.interviewCutoff, value: "0" }]).interviewCutoff).toBe(0);
  });
  it("ignores garbage and negatives", () => {
    expect(parseRecruitSettings([{ key: RECRUIT_SETTING_KEYS.interviewCutoff, value: "abc" }]).interviewCutoff).toBeNull();
    expect(parseRecruitSettings([{ key: RECRUIT_SETTING_KEYS.interviewCutoff, value: "-2" }]).interviewCutoff).toBeNull();
  });
  it("validates but allows clearing", () => {
    expect(validateRecruitSettings({ interviewCutoff: null })).toBeNull();
    expect(validateRecruitSettings({ interviewCutoff: -1 })).toMatch(/negative/i);
    expect(validateRecruitSettings({ interviewCutoff: Number.NaN })).toMatch(/number/i);
  });
});
