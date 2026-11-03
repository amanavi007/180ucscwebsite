import { describe, expect, it } from "vitest";
import { DEFAULT_OUTREACH_SETTINGS, OUTREACH_SETTING_KEYS, buildFromAddress, parseOutreachSettings, replyForwardRecipients } from "./settings";

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
      ["outreach_test_recipient", "aman@x.com"],
      ["outreach_from_name", "Aman Avinash"],
      ["outreach_signature", "Best regards,\n\nAman"],
      ["outreach_discovery_enabled", "true"],
      ["outreach_discovery_per_day", "6"],
      ["outreach_discovery_regions", "Oakland, Berkeley"],
      ["outreach_discovery_industries", "Healthcare; Engineering, Product and Design"],
      ["outreach_discovery_max_team", "30"],
    ].map(([key, value]) => ({ key, value }));
    expect(parseOutreachSettings(rows)).toEqual({
      mode: "live",
      paused: true,
      testRecipient: "aman@x.com",
      dailyCapOverride: 12,
      startedOn: "2026-10-26",
      windowStartHour: 10,
      windowEndHour: 15,
      senderName: "Team X",
      fromName: "Aman Avinash",
      signature: "Best regards,\n\nAman",
      discoveryEnabled: true,
      discoveryPerDay: 6,
      discoveryRegions: ["Oakland", "Berkeley"],
      discoveryIndustries: ["Healthcare", "Engineering, Product and Design"],
      discoveryMaxTeam: 30,
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
    expect(OUTREACH_SETTING_KEYS).toHaveLength(17);
    expect(OUTREACH_SETTING_KEYS).toContain("outreach_mode");
  });
});

import { shouldRestartRamp } from "./settings";

describe("shouldRestartRamp", () => {
  it("restarts the slow ramp when outreach goes from off to live", () => {
    expect(shouldRestartRamp("off", "live")).toBe(true);
  });
  it("does not restart it for pausing, testing or staying live", () => {
    expect(shouldRestartRamp("live", "live")).toBe(false);
    expect(shouldRestartRamp("live", "off")).toBe(false);
    expect(shouldRestartRamp("dry_run", "live")).toBe(false);
    expect(shouldRestartRamp("exec_only", "live")).toBe(false);
    expect(shouldRestartRamp("off", "dry_run")).toBe(false);
  });
});

describe("replyForwardRecipients", () => {
  const execs = ["a@180dc.org", "b@180dc.org"];
  const base = { ...DEFAULT_OUTREACH_SETTINGS, testRecipient: "me@180dc.org" };

  it("sends only to the test recipient while testing", () => {
    for (const mode of ["off", "dry_run", "self_only", "exec_only"] as const) {
      expect(replyForwardRecipients({ ...base, mode }, execs)).toEqual(["me@180dc.org"]);
    }
  });
  it("sends to every exec once live", () => {
    expect(replyForwardRecipients({ ...base, mode: "live" }, execs)).toEqual(execs);
  });
  it("falls back to every exec when testing with no test recipient, so a reply is never lost", () => {
    expect(replyForwardRecipients({ ...base, mode: "self_only", testRecipient: null }, execs)).toEqual(execs);
  });
});

describe("discovery settings", () => {
  const parse = (rows: [string, string][]) => parseOutreachSettings(rows.map(([key, value]) => ({ key, value })));

  it("is off by default, aiming for 10 a day in the Bay Area, in teams of up to 50", () => {
    const s = parseOutreachSettings([]);
    expect(s.discoveryEnabled).toBe(false);
    expect(s.discoveryPerDay).toBe(10);
    expect(s.discoveryMaxTeam).toBe(50);
    expect(s.discoveryRegions).toContain("San Francisco");
    expect(s.discoveryIndustries).toContain("Healthcare");
    expect(s.discoveryIndustries).toContain("Engineering, Product and Design");
  });
  it("only switches on for the exact word true", () => {
    expect(parse([["outreach_discovery_enabled", "yes"]]).discoveryEnabled).toBe(false);
    expect(parse([["outreach_discovery_enabled", "true"]]).discoveryEnabled).toBe(true);
  });
  it("falls back to the default for a number that is not whole or is out of range", () => {
    expect(parse([["outreach_discovery_per_day", "lots"]]).discoveryPerDay).toBe(10);
    expect(parse([["outreach_discovery_per_day", "-3"]]).discoveryPerDay).toBe(10);
    expect(parse([["outreach_discovery_per_day", "500"]]).discoveryPerDay).toBe(10);
    expect(parse([["outreach_discovery_per_day", "0"]]).discoveryPerDay).toBe(0);
    expect(parse([["outreach_discovery_max_team", "0"]]).discoveryMaxTeam).toBe(50);
  });
  it("splits regions on commas and industries on semicolons, so an industry name can hold a comma", () => {
    const s = parse([
      ["outreach_discovery_regions", " Oakland ,, Berkeley "],
      ["outreach_discovery_industries", "Healthcare;  Engineering, Product and Design ; "],
    ]);
    expect(s.discoveryRegions).toEqual(["Oakland", "Berkeley"]);
    expect(s.discoveryIndustries).toEqual(["Healthcare", "Engineering, Product and Design"]);
  });
  it("falls back to the defaults for empty lists", () => {
    const s = parse([["outreach_discovery_regions", " , "], ["outreach_discovery_industries", ";"]]);
    expect(s.discoveryRegions.length).toBeGreaterThan(3);
    expect(s.discoveryIndustries.length).toBeGreaterThan(2);
  });
});

describe("sender person", () => {
  it("defaults to no person, so emails come from the team address in the environment", () => {
    const s = parseOutreachSettings([]);
    expect(s.fromName).toBe("");
    expect(s.signature).toBe("");
  });
  it("reads the sender name and the multi-line signature", () => {
    const s = parseOutreachSettings([
      { key: "outreach_from_name", value: " Aman Avinash " },
      { key: "outreach_signature", value: "Best regards,\r\n\r\nAman Avinash\r\nDirector of Projects\r\n" },
    ]);
    expect(s.fromName).toBe("Aman Avinash");
    expect(s.signature).toBe("Best regards,\n\nAman Avinash\nDirector of Projects");
  });
});

describe("buildFromAddress", () => {
  const env = "180 Degrees Consulting at UCSC <team@consulting.ucsc180dc.org>";
  it("keeps the environment address when no person is set", () => {
    expect(buildFromAddress(env, "")).toBe(env);
  });
  it("uses the person's name and a mailbox named after their first name, on the same domain", () => {
    expect(buildFromAddress(env, "Aman Avinash")).toBe("Aman Avinash <aman@consulting.ucsc180dc.org>");
  });
  it("copes with a bare address and strips characters that do not belong in a mailbox", () => {
    expect(buildFromAddress("team@consulting.ucsc180dc.org", "Jo-Ann! Lee")).toBe("Jo-Ann! Lee <joann@consulting.ucsc180dc.org>");
  });
  it("drops quotes and angle brackets from the display name", () => {
    expect(buildFromAddress(env, 'Aman "The" <Avinash>')).toBe("Aman The Avinash <aman@consulting.ucsc180dc.org>");
  });
});
