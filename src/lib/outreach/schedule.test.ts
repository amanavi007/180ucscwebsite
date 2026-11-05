import { describe, expect, it } from "vitest";
import { buildSchedule, type ScheduleMessage, type ScheduleProspect } from "./schedule";

// Wednesday 2026-11-04, 5 PM Pacific: the morning job has run.
const NOW = new Date("2026-11-05T01:00:00Z");
const settings = { mode: "live" as const, startedOn: "2026-11-02", dailyCapOverride: null, windowStartHour: 9 };

const prospect = (n: number, over: Partial<ScheduleProspect> = {}): ScheduleProspect => ({
  id: `p${n}`, company: `Co${n}`, contactName: null, contactEmail: `hi@co${n}.com`, status: "drafted", step: 0, nextActionAt: null, ...over,
});
const draft = (n: number, over: Partial<ScheduleMessage> = {}): ScheduleMessage => ({
  prospectId: `p${n}`, step: 0, subject: `UCSC students for Co${n}`, status: "draft", scheduledFor: null, sentAt: null, createdAt: `2026-11-03T0${n % 10}:00:00Z`, ...over,
});

describe("buildSchedule", () => {
  it("shows today's real sends with their times and the next working days as a plan", () => {
    const prospects = [1, 2, 3].map((n) => prospect(n));
    const messages = [draft(1), draft(2), draft(3)];
    const sentToday = draft(9, { status: "scheduled", scheduledFor: "2026-11-04T18:30:00Z" });
    const s = buildSchedule({ prospects: [...prospects, prospect(9, { status: "queued" })], messages: [...messages, sentToday], settings, now: NOW });
    expect(s.days[0].label).toBe("Today");
    expect(s.days[0].items.map((i) => [i.company, i.state])).toEqual([["Co9", "scheduled"]]);
    expect(s.days[1].label).toBe("Tomorrow");
    expect(s.days[1].items.map((i) => i.company)).toEqual(["Co1", "Co2", "Co3"]);
    expect(s.days[1].items.every((i) => i.state === "planned" && i.at === null)).toBe(true);
  });

  it("stops at the daily limit and carries the rest to the next working day, skipping the weekend", () => {
    const n = 30;
    const prospects = Array.from({ length: n }, (_, i) => prospect(i + 1));
    const messages = Array.from({ length: n }, (_, i) => draft(i + 1, { createdAt: `2026-11-03T00:${String(i).padStart(2, "0")}:00Z` }));
    const s = buildSchedule({ prospects, messages, settings, now: NOW });
    const tomorrow = s.days[1];
    expect(tomorrow.date).toBe("2026-11-05");
    expect(tomorrow.items).toHaveLength(tomorrow.cap);
    const friday = s.days[2];
    const saturday = s.days[3];
    expect(saturday.weekend).toBe(true);
    expect(saturday.items).toHaveLength(0);
    expect(s.days[5].date).toBe("2026-11-09");
    expect(friday.items[0].company).not.toBe(tomorrow.items[0].company);
  });

  it("sends only one email per company domain on a day", () => {
    const prospects = [prospect(1), prospect(2, { contactEmail: "other@co1.com" })];
    const s = buildSchedule({ prospects, messages: [draft(1), draft(2)], settings, now: NOW });
    expect(s.days[1].items.map((i) => i.company)).toEqual(["Co1"]);
    expect(s.days[2].items.map((i) => i.company)).toEqual(["Co2"]);
  });

  it("lists a follow-up on the day it is due even though its draft is not written yet", () => {
    const p = prospect(1, { status: "sent", step: 1, nextActionAt: "2026-11-09T08:00:00Z" });
    const s = buildSchedule({ prospects: [p], messages: [], settings, now: NOW });
    const day = s.days.find((d) => d.items.length > 0)!;
    expect(day.date).toBe("2026-11-09");
    expect(day.items[0]).toMatchObject({ step: 1, subject: null, state: "planned" });
  });

  it("does not plan anything for a prospect that replied or whose draft is spent", () => {
    const s = buildSchedule({ prospects: [prospect(1, { status: "replied" })], messages: [draft(1)], settings, now: NOW });
    expect(s.days.every((d) => d.items.length === 0)).toBe(true);
    expect(s.needsAttention).toBe(1);
  });

  it("starts the ramp on the first sending day when outreach has not started", () => {
    const s = buildSchedule({ prospects: [prospect(1)], messages: [draft(1)], settings: { ...settings, mode: "self_only", startedOn: null }, now: NOW });
    expect(s.days[1].cap).toBe(5);
  });

  it("counts companies still waiting for an email", () => {
    const s = buildSchedule({ prospects: [prospect(1, { status: "verified" }), prospect(2, { status: "new" })], messages: [], settings, now: NOW });
    expect(s.notDrafted).toBe(2);
  });
});
