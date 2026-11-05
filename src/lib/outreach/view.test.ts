import { describe, expect, it } from "vitest";
import { STAGE_FILTERS, filterByStage, funnelCounts, isDiscoveryStage, needsYouItems, nicheOptions, normalizeStage, senderState, stageChip, todaySends } from "./view";
import type { Schedule } from "./schedule";
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
  it("puts every status in at least one group", () => {
    const groups = STAGE_FILTERS.filter((f) => f.key !== "all");
    for (const s of ALL_STATUSES) expect(groups.filter((g) => g.statuses.includes(s)).length).toBeGreaterThanOrEqual(1);
  });
  it("counts a replied company in both needs-you and replied", () => {
    expect(filterByStage(prospects, "replied").map((p) => p.status)).toEqual(["replied"]);
    expect(filterByStage(prospects, "needs-you").map((p) => p.status).sort()).toEqual(["bounced", "needs_attention", "replied"]);
  });
  it("filters by group and returns everything for all", () => {
    expect(filterByStage(prospects, "all")).toHaveLength(ALL_STATUSES.length);
    expect(filterByStage(prospects, "drafted").map((p) => p.status).sort()).toEqual(["drafted", "new", "verified"]);
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

describe("normalizeStage and discovery stages", () => {
  it("maps old keys and falls back sensibly", () => {
    expect(normalizeStage("not-sent")).toBe("drafted");
    expect(normalizeStage("in-progress")).toBe("sent");
    expect(normalizeStage("stopped")).toBe("finished");
    expect(normalizeStage(undefined)).toBe("needs-you");
    expect(normalizeStage("bogus")).toBe("all");
    expect(normalizeStage("found")).toBe("found");
    expect(normalizeStage("skipped")).toBe("skipped");
    expect(normalizeStage("sent")).toBe("sent");
  });
  it("knows which stages are Discovery's", () => {
    expect(isDiscoveryStage("found")).toBe(true);
    expect(isDiscoveryStage("sent")).toBe(false);
    expect(isDiscoveryStage(null)).toBe(false);
  });
});

describe("needsYouItems", () => {
  const p = (id: string, status: string, statusReason: string | null = null) => ({ id, company: `Co ${id}`, status, statusReason, contactEmail: `${id}@x.com` });
  it("lists replies, then stuck, then bounced, and skips exec stops", () => {
    const items = needsYouItems(
      [p("a", "bounced"), p("b", "needs_attention", "Draft failed the check."), p("c", "replied"), p("d", "needs_attention", "Stopped by an exec."), p("e", "sent")],
      [{ prospectId: "c", snippet: "Can we talk Thursday?", createdAt: "2026-11-04T10:00:00Z" }],
    );
    expect(items.map((i) => [i.prospectId, i.kind, i.actionLabel])).toEqual([
      ["c", "reply", "Open reply"],
      ["b", "stuck", "Fix draft"],
      ["a", "bounced", "Add another email"],
    ]);
    expect(items[0].reason).toBe("Can we talk Thursday?");
    expect(items[1].reason).toBe("Draft failed the check.");
    expect(items[2].reason).toBe("a@x.com did not accept the email");
  });
  it("trims long replies to 90 characters and handles empty input", () => {
    const items = needsYouItems([p("c", "replied")], [{ prospectId: "c", snippet: "x".repeat(200), createdAt: "2026-11-04T10:00:00Z" }]);
    expect(items[0].reason.length).toBeLessThanOrEqual(90);
    expect(needsYouItems([], [])).toEqual([]);
  });
  it("uses the newest reply for a company", () => {
    const items = needsYouItems([p("c", "replied")], [
      { prospectId: "c", snippet: "old", createdAt: "2026-11-01T10:00:00Z" },
      { prospectId: "c", snippet: "new", createdAt: "2026-11-04T10:00:00Z" },
    ]);
    expect(items[0].reason).toBe("new");
  });
});

describe("todaySends", () => {
  const item = (id: string, state: "sent" | "scheduled" | "planned") => ({ prospectId: id, company: id, contact: "", step: 0, subject: null, body: null, state, at: null });
  const day = (label: string, weekend: boolean, items: ReturnType<typeof item>[]) => ({ date: label, label, weekend, cap: 20, items });
  const sched = (days: Schedule["days"]): Schedule => ({ days, notDrafted: 0, needsAttention: 0, waitingBeyond: 0 });
  const times = { windowStartHour: 9, windowEndHour: 16 };
  it("counts what is left today and what is planned tomorrow", () => {
    const r = todaySends(sched([day("Today", false, [item("a", "sent"), item("b", "scheduled"), item("c", "planned")]), day("Tomorrow", false, [item("d", "planned"), item("e", "planned")])]), (id) => (id === "b" ? "Aman" : null), times);
    expect(r.items).toHaveLength(3);
    expect(r.left).toBe(2);
    expect(r.tomorrow).toBe(2);
    expect(r.items[1].senderName).toBe("Aman");
    expect(r.windowLabel).toBe("9 AM to 4 PM");
  });
  it("is calm on an empty weekend", () => {
    const r = todaySends(sched([day("Today", true, []), day("Monday", false, [item("a", "planned")])]), () => null, times);
    expect(r.items).toEqual([]);
    expect(r.left).toBe(0);
    expect(r.tomorrow).toBe(1);
  });
  it("handles no days at all", () => {
    expect(todaySends(sched([]), () => null, times)).toMatchObject({ items: [], left: 0, tomorrow: 0 });
  });
});

describe("funnelCounts", () => {
  it("uses the found count and counts replied on its own", () => {
    const f = funnelCounts([{ status: "replied" }, { status: "sent" }, { status: "follow_up_1" }, { status: "booked" }], 1141);
    expect(f.map((x) => [x.key, x.count])).toEqual([["found", 1141], ["drafted", 0], ["scheduled", 0], ["sent", 2], ["replied", 1], ["booked", 1]]);
    expect(f[0].href).toBe("/portal/admin/outreach/companies?stage=found");
  });
});
