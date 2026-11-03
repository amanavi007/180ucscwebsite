import type { OutreachMode } from "./settings";

/** The daily jobs. Each records when it last ran, so a job that quietly stops can be noticed. */
export const HEARTBEAT_JOBS = ["discover", "prepare", "send"] as const;
export type HeartbeatJob = (typeof HEARTBEAT_JOBS)[number];
export type Heartbeats = Record<HeartbeatJob, string | null>;

export const heartbeatKey = (job: HeartbeatJob) => `outreach_heartbeat_${job}`;

/** Jobs run once a day; allow a little over a day for the schedule to drift before calling one overdue. */
export const STALE_AFTER_HOURS = 30;
const HOUR_MS = 3_600_000;

const ageHours = (now: Date, iso: string) => (now.getTime() - new Date(iso).getTime()) / HOUR_MS;

/** Other jobs that have reported before but not within 30 hours. A job that never reported is not flagged: it has no history yet. */
export function staleSiblings(now: Date, beats: Heartbeats, self: HeartbeatJob): HeartbeatJob[] {
  return HEARTBEAT_JOBS.filter((job) => job !== self && beats[job] !== null && ageHours(now, beats[job]!) > STALE_AFTER_HOURS);
}

export interface JobHealth {
  state: "ok" | "overdue" | "never_ran";
  lastRunAt: string | null;
}

/**
 * For the portal: is this job running as it should? Checked on the read side so it works even when every job is dead.
 * Nothing is overdue while outreach is off. A missing heartbeat only counts once there have been prospects for over a day.
 */
export function jobHealth(now: Date, lastRunAt: string | null, context: { mode: OutreachMode; oldestProspectAt: string | null }): JobHealth {
  if (context.mode === "off") return { state: "ok", lastRunAt };
  if (lastRunAt) return { state: ageHours(now, lastRunAt) > STALE_AFTER_HOURS ? "overdue" : "ok", lastRunAt };
  const waited = context.oldestProspectAt !== null && ageHours(now, context.oldestProspectAt) > 24;
  return { state: waited ? "never_ran" : "ok", lastRunAt: null };
}
