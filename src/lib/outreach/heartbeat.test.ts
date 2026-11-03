import { describe, expect, it } from "vitest";
import { HEARTBEAT_JOBS, heartbeatKey, jobHealth, staleSiblings, summarizeRun } from "./heartbeat";

const now = new Date("2026-11-04T16:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

describe("heartbeatKey", () => {
  it("names a setting per job", () => {
    expect(heartbeatKey("prepare")).toBe("outreach_heartbeat_prepare");
    expect(HEARTBEAT_JOBS).toEqual(["discover", "repair", "prepare", "send", "agent"]);
  });
});

describe("staleSiblings", () => {
  it("flags another job whose last run is more than 30 hours old", () => {
    expect(staleSiblings(now, { discover: hoursAgo(10), repair: hoursAgo(9), prepare: hoursAgo(9), send: hoursAgo(40), agent: null }, "prepare")).toEqual(["send"]);
  });
  it("never flags the job doing the checking", () => {
    expect(staleSiblings(now, { discover: hoursAgo(100), repair: hoursAgo(1), prepare: hoursAgo(100), send: hoursAgo(1), agent: null }, "discover")).toEqual(["prepare"]);
  });
  it("ignores a job that has never reported, since a new job has no history yet", () => {
    expect(staleSiblings(now, { discover: null, repair: null, prepare: hoursAgo(5), send: null, agent: null }, "send")).toEqual([]);
  });
  it("is quiet when everything ran in the last day", () => {
    expect(staleSiblings(now, { discover: hoursAgo(10), repair: hoursAgo(9), prepare: hoursAgo(9), send: hoursAgo(8), agent: null }, "send")).toEqual([]);
  });
});

describe("jobHealth", () => {
  const prospectsFor = (hours: number) => ({ oldestProspectAt: hoursAgo(hours) });
  it("is fine when the job ran in the last 30 hours", () => {
    expect(jobHealth(now, hoursAgo(20), { mode: "live", ...prospectsFor(500) })).toEqual({ state: "ok", lastRunAt: hoursAgo(20) });
  });
  it("is overdue when it last ran longer ago, but only while outreach is switched on", () => {
    expect(jobHealth(now, hoursAgo(50), { mode: "live", ...prospectsFor(500) }).state).toBe("overdue");
    expect(jobHealth(now, hoursAgo(50), { mode: "off", ...prospectsFor(500) }).state).toBe("ok");
  });
  it("says it has never run when outreach has had prospects for more than a day and no heartbeat exists", () => {
    expect(jobHealth(now, null, { mode: "self_only", ...prospectsFor(48) }).state).toBe("never_ran");
  });
  it("gives a brand-new setup a day before calling a missing heartbeat a problem", () => {
    expect(jobHealth(now, null, { mode: "self_only", ...prospectsFor(5) }).state).toBe("ok");
    expect(jobHealth(now, null, { mode: "self_only", oldestProspectAt: null }).state).toBe("ok");
  });
});

describe("summarizeRun", () => {
  it("says what repair did", () => {
    expect(summarizeRun("repair", { tried: 40, recovered: 6, gaveUp: 30, stillTrying: 4 })).toBe("tried 40, recovered 6, gave up on 30, still trying 4");
  });
  it("says what drafting did", () => {
    expect(summarizeRun("prepare", { verified: 3, drafted: 1, followUps: 2, needsAttention: 2 })).toBe("checked 3, wrote 1 draft, 2 follow-ups, 2 need attention");
  });
  it("says why nothing was sent", () => {
    expect(summarizeRun("send", { scheduled: 0, skipped: "cap_reached" })).toBe("sent none (cap reached)");
    expect(summarizeRun("send", { scheduled: 4, skipped: null })).toBe("scheduled 4 emails");
  });
  it("says what discovery added", () => {
    expect(summarizeRun("discover", { added: 10, fromPool: 10, evaluated: 0, skipped: null })).toBe("added 10 companies, 10 from the pool");
    expect(summarizeRun("discover", { added: 0, skipped: "backlog_full" })).toBe("added none (backlog full)");
  });
});
