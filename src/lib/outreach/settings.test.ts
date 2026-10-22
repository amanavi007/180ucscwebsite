import { describe, expect, it } from "vitest";
import { DEFAULT_OUTREACH_SETTINGS, OUTREACH_SETTING_KEYS, parseOutreachSettings } from "./settings";

describe("parseOutreachSettings", () => {
  it("returns the defaults for no rows", () => {
    expect(parseOutreachSettings([])).toEqual(DEFAULT_OUTREACH_SETTINGS);
    expect(DEFAULT_OUTREACH_SETTINGS).toMatchObject({
      mode: "off",
      paused: false,
      dailyCapOverride: null,
      startedOn: null,
      windowStartHour: 9,
      windowEndHour: 16,
      senderName: "180 Degrees Consulting at UCSC",
      postalAddress: "1156 High St, Santa Cruz, CA 95064",
      followupDays: [4, 9, 15],
    });
  });

  it("parses every key", () => {
    const rows = [
      ["outreach_mode", "live"],
      ["outreach_paused", "true"],
      ["outreach_daily_cap_override", "12"],
      ["outreach_started_on", "2026-10-26"],
      ["outreach_window_start_hour", "10"],
      ["outreach_window_end_hour", "15"],
      ["outreach_sender_name", "Team X"],
      ["outreach_postal_address", "1 Main St"],
      ["outreach_followup_days", "3, 7, 14"],
    ].map(([key, value]) => ({ key, value }));
    expect(parseOutreachSettings(rows)).toEqual({
      mode: "live",
      paused: true,
      dailyCapOverride: 12,
      startedOn: "2026-10-26",
      windowStartHour: 10,
      windowEndHour: 15,
      senderName: "Team X",
      postalAddress: "1 Main St",
      followupDays: [3, 7, 14],
    });
  });

  it("falls back to defaults for bad values", () => {
    const rows = [
      ["outreach_mode", "turbo"],
      ["outreach_daily_cap_override", "lots"],
      ["outreach_started_on", "yesterday"],
      ["outreach_window_start_hour", "17"],
      ["outreach_window_end_hour", "9"],
      ["outreach_followup_days", "9,4"],
      ["outreach_sender_name", "   "],
    ].map(([key, value]) => ({ key, value }));
    expect(parseOutreachSettings(rows)).toEqual(DEFAULT_OUTREACH_SETTINGS);
  });

  it("lists every key it reads", () => {
    expect(OUTREACH_SETTING_KEYS).toHaveLength(9);
    expect(OUTREACH_SETTING_KEYS).toContain("outreach_mode");
  });
});
