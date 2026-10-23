import { describe, expect, it } from "vitest";
import { dailyCap, evaluateBrakes, planSendTimes } from "./pacing";
import { DEFAULT_OUTREACH_SETTINGS } from "./settings";
import { isInterviewReminderHour, isPacificHour } from "@/lib/interview-reminders";

describe("dailyCap", () => {
  it("is 0 before outreach has started", () => {
    expect(dailyCap(null, "2026-10-26", null)).toBe(0);
    expect(dailyCap(null, "2026-10-26", 20)).toBe(0);
  });
  it("holds at 15 for the first 5 days, then ramps by 5 a day up to 40", () => {
    expect(dailyCap("2026-10-26", "2026-10-26", null)).toBe(15);
    expect(dailyCap("2026-10-26", "2026-10-30", null)).toBe(15); // day 4
    expect(dailyCap("2026-10-26", "2026-10-31", null)).toBe(20); // day 5
    expect(dailyCap("2026-10-26", "2026-11-04", null)).toBe(40); // day 9
    expect(dailyCap("2026-10-26", "2027-03-01", null)).toBe(40);
  });
  it("honors an override but never above 100", () => {
    expect(dailyCap("2026-10-26", "2026-10-27", 12)).toBe(12);
    expect(dailyCap("2026-10-26", "2026-10-27", 500)).toBe(100);
  });
});

const pacificHm = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).format(d);
const minutes = (d: Date) => {
  const [h, m] = pacificHm(d).split(":").map(Number);
  return h * 60 + m;
};

describe("planSendTimes", () => {
  const base = { windowStartHour: 9, windowEndHour: 16 };

  it("returns sorted times inside the Pacific window, at least 3 minutes apart (PDT)", () => {
    const now = new Date("2026-10-21T14:00:00Z"); // 7:00 PDT Wed
    const times = planSendTimes({ ...base, now, count: 20 });
    expect(times).toHaveLength(20);
    for (const t of times) {
      expect(minutes(t)).toBeGreaterThanOrEqual(9 * 60);
      expect(minutes(t)).toBeLessThan(16 * 60);
    }
    for (let i = 1; i < times.length; i++) {
      expect(times[i].getTime() - times[i - 1].getTime()).toBeGreaterThanOrEqual(3 * 60_000);
    }
  });

  it("is correct in PST too", () => {
    const now = new Date("2026-12-09T15:00:00Z"); // 7:00 PST Wed
    const times = planSendTimes({ ...base, now, count: 5 });
    expect(times).toHaveLength(5);
    for (const t of times) {
      expect(minutes(t)).toBeGreaterThanOrEqual(9 * 60);
      expect(minutes(t)).toBeLessThan(16 * 60);
    }
  });

  it("never schedules in the past: starts at least 2 minutes after now", () => {
    const now = new Date("2026-10-21T18:00:00Z"); // 11:00 PDT
    const times = planSendTimes({ ...base, now, count: 4 });
    for (const t of times) expect(t.getTime()).toBeGreaterThanOrEqual(now.getTime() + 2 * 60_000);
  });

  it("returns nothing on weekends and after the window closes", () => {
    expect(planSendTimes({ ...base, now: new Date("2026-10-24T16:00:00Z"), count: 5 })).toEqual([]); // Sat
    expect(planSendTimes({ ...base, now: new Date("2026-10-25T16:00:00Z"), count: 5 })).toEqual([]); // Sun
    expect(planSendTimes({ ...base, now: new Date("2026-10-21T23:30:00Z"), count: 5 })).toEqual([]); // 16:30 PDT
  });

  it("returns fewer times when they do not fit", () => {
    const now = new Date("2026-10-21T22:55:00Z"); // 15:55 PDT
    const times = planSendTimes({ ...base, now, count: 10 });
    expect(times.length).toBeLessThan(10);
    for (const t of times) expect(minutes(t)).toBeLessThan(16 * 60);
  });

  it("varies with the random source", () => {
    const now = new Date("2026-10-21T14:00:00Z");
    const a = planSendTimes({ ...base, now, count: 3, rng: () => 0 });
    const b = planSendTimes({ ...base, now, count: 3, rng: () => 0.99 });
    expect(a[0].getTime()).not.toBe(b[0].getTime());
  });
});

describe("evaluateBrakes", () => {
  const healthy = {
    sent: 100,
    bounced: 0,
    complained: 0,
    settings: { ...DEFAULT_OUTREACH_SETTINGS, mode: "live" as const },
    bookingOpen: true,
    resendAccountError: false,
  };
  it("allows a healthy day", () => expect(evaluateBrakes(healthy)).toEqual({ allow: true, reason: null }));
  it("stops when mode is off", () =>
    expect(evaluateBrakes({ ...healthy, settings: { ...healthy.settings, mode: "off" } })).toEqual({ allow: false, reason: "mode_off" }));
  it("stops when paused", () =>
    expect(evaluateBrakes({ ...healthy, settings: { ...healthy.settings, paused: true } })).toEqual({ allow: false, reason: "paused" }));
  it("stops when booking is closed", () =>
    expect(evaluateBrakes({ ...healthy, bookingOpen: false })).toEqual({ allow: false, reason: "booking_closed" }));
  it("stops on a Resend account error", () =>
    expect(evaluateBrakes({ ...healthy, resendAccountError: true })).toEqual({ allow: false, reason: "account_error" }));
  it("trips the bounce brake at 2% with at least 2 bounces", () => {
    expect(evaluateBrakes({ ...healthy, bounced: 2 })).toEqual({ allow: false, reason: "bounce_rate" });
    expect(evaluateBrakes({ ...healthy, sent: 300, bounced: 5 })).toEqual({ allow: true, reason: null });
  });
  it("does not trip on a single bounce in a tiny batch", () =>
    expect(evaluateBrakes({ ...healthy, sent: 5, bounced: 1 })).toEqual({ allow: true, reason: null }));
  it("trips the complaint brake on one complaint in 100 sends", () =>
    expect(evaluateBrakes({ ...healthy, complained: 1 })).toEqual({ allow: false, reason: "complaint_rate" }));
});

describe("isPacificHour", () => {
  it("matches isInterviewReminderHour for hour 8 in both DST regimes", () => {
    for (const iso of ["2026-07-15T15:00:00Z", "2026-12-15T16:00:00Z", "2026-07-15T16:00:00Z"]) {
      const d = new Date(iso);
      expect(isPacificHour(d, 8)).toBe(isInterviewReminderHour(d));
    }
  });
  it("works for another hour", () => {
    expect(isPacificHour(new Date("2026-07-15T14:00:00Z"), 7)).toBe(true);
    expect(isPacificHour(new Date("2026-12-15T15:00:00Z"), 7)).toBe(true);
    expect(isPacificHour(new Date("2026-07-15T15:00:00Z"), 7)).toBe(false);
  });
});
