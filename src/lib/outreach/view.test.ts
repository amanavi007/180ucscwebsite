import { describe, expect, it } from "vitest";
import { STAGE_FILTERS, filterByStage, nicheOptions, senderState, stageChip } from "./view";
import { DEFAULT_OUTREACH_SETTINGS } from "./settings";

const ALL_STATUSES = [
  "new", "verified", "drafted", "queued", "sent", "follow_up_1", "follow_up_2", "closing_note", "no_response",
  "replied", "booked", "unsubscribed", "bounced", "invalid", "needs_attention",
];

describe("stageChip", () => {
  it("gives every status a word and one of the status chip variants", () => {
    for (const s of ALL_STATUSES) {
      const chip = stageChip(s);
      expect(chip.label.length).toBeGreaterThan(2);
      expect(["ok", "warn", "bad", "info", "muted"]).toContain(chip.variant);
    }
  });
  it("uses caution for things an exec should look at and bad for dead ends", () => {
    expect(stageChip("replied").variant).toBe("warn");
    expect(stageChip("needs_attention").variant).toBe("warn");
    expect(stageChip("bounced").variant).toBe("bad");
    expect(stageChip("invalid").variant).toBe("bad");
    expect(stageChip("booked").variant).toBe("ok");
  });
  it("falls back to the raw status for an unknown one", () => {
    expect(stageChip("mystery")).toEqual({ label: "mystery", variant: "muted" });
  });
});

describe("stage filters", () => {
  const prospects = ALL_STATUSES.map((status) => ({ status, niche: null as string | null }));
  it("puts every status in exactly one group", () => {
    const groups = STAGE_FILTERS.filter((f) => f.key !== "all");
    for (const s of ALL_STATUSES) expect(groups.filter((g) => g.statuses.includes(s))).toHaveLength(1);
  });
  it("filters by group and returns everything for all", () => {
    expect(filterByStage(prospects, "all")).toHaveLength(ALL_STATUSES.length);
    expect(filterByStage(prospects, "needs-you").map((p) => p.status).sort()).toEqual(["needs_attention", "replied"]);
  });
  it("treats an unknown group as all", () => {
    expect(filterByStage(prospects, "bogus")).toHaveLength(ALL_STATUSES.length);
  });
});

describe("nicheOptions", () => {
  it("lists distinct niches alphabetically, ignoring blanks", () => {
    expect(nicheOptions([{ niche: "tech" }, { niche: null }, { niche: "med-tech" }, { niche: "tech" }, { niche: " " }])).toEqual(["med-tech", "tech"]);
  });
});

describe("senderState", () => {
  const healthy = { sent: 100, bounced: 0, complained: 0 };
  const live = { ...DEFAULT_OUTREACH_SETTINGS, mode: "live" as const };
  it("says Off when outreach is off", () => {
    expect(senderState({ settings: DEFAULT_OUTREACH_SETTINGS, health: healthy, bookingOpen: true })).toMatchObject({ label: "Off", variant: "muted" });
  });
  it("says Test mode for dry run and exec only", () => {
    expect(senderState({ settings: { ...live, mode: "dry_run" }, health: healthy, bookingOpen: true }).label).toBe("Test mode");
    expect(senderState({ settings: { ...live, mode: "exec_only" }, health: healthy, bookingOpen: true }).label).toBe("Test mode");
  });
  it("says Paused when paused, and Braked with the reason when a limit is hit", () => {
    expect(senderState({ settings: { ...live, paused: true }, health: healthy, bookingOpen: true })).toMatchObject({ label: "Paused", variant: "warn" });
    const braked = senderState({ settings: live, health: { sent: 50, bounced: 5, complained: 0 }, bookingOpen: true });
    expect(braked).toMatchObject({ label: "Braked", variant: "bad" });
    expect(braked.detail).toMatch(/bounce/i);
  });
  it("says On hold while booking is closed", () => {
    expect(senderState({ settings: live, health: healthy, bookingOpen: false })).toMatchObject({ label: "On hold", variant: "warn" });
  });
  it("says Running when everything is fine", () => {
    expect(senderState({ settings: live, health: healthy, bookingOpen: true })).toMatchObject({ label: "Running", variant: "ok" });
  });
});

import { eventLabel, formatWhen, replyLabel, stepLabel } from "./view";

describe("labels", () => {
  it("names each email in the sequence", () => {
    expect([0, 1, 2, 3, 4].map(stepLabel)).toEqual(["First email", "Follow-up 1", "Follow-up 2", "Closing note", "Closing note"]);
  });
  it("names reply classes and events in plain words", () => {
    expect(replyLabel("not_interested")).toBe("Not interested");
    expect(replyLabel("auto_reply")).toBe("Automatic reply");
    expect(replyLabel("something_new")).toBe("Other");
    expect(eventLabel("complained")).toBe("Marked as spam");
    expect(eventLabel("booked")).toBe("Booked a call");
    expect(eventLabel("zzz")).toBe("zzz");
  });
  it("formats dates in Pacific time, with a dash for none", () => {
    expect(formatWhen(null)).toBe("–");
    expect(formatWhen("2026-10-23T06:00:00Z")).toBe("Oct 22"); // still the 22nd in Santa Cruz
    expect(formatWhen("2026-10-23T20:00:00Z")).toBe("Oct 23");
  });
});
