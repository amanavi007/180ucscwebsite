import type { OutreachMode } from "./settings";

/** The daily jobs. Each records when it last ran, so a job that quietly stops can be noticed. */
export const HEARTBEAT_JOBS = ["discover", "repair", "prepare", "send", "agent"] as const;
export type HeartbeatJob = (typeof HEARTBEAT_JOBS)[number];
export type Heartbeats = Record<HeartbeatJob, string | null>;

export const heartbeatKey = (job: HeartbeatJob) => `outreach_heartbeat_${job}`;

/** What the job did on its last run, in a sentence. The hosting plan keeps no logs, so this is the only record. */
export const lastRunKey = (job: HeartbeatJob) => `outreach_lastrun_${job}`;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One short sentence for the portal from a job's result object. */
export function summarizeRun(job: HeartbeatJob, result: unknown): string {
  const r = (result ?? {}) as Record<string, unknown>;
  const num = (k: string) => (typeof r[k] === "number" ? (r[k] as number) : 0);
  if (job === "prepare") {
    const parts = [`checked ${num("verified")}`, `wrote ${plural(num("drafted"), "draft")}`, `${plural(num("followUps"), "follow-up")}`];
    if (num("needsAttention") > 0) parts.push(`${num("needsAttention")} need attention`);
    if (num("draftErrors") > 0) parts.push(`${plural(num("draftErrors"), "draft")} failed to write (AI error)`);
    return parts.join(", ");
  }
  if (job === "send") {
    return typeof r.skipped === "string" && r.skipped ? `sent none (${r.skipped.replace(/_/g, " ")})` : `scheduled ${plural(num("scheduled"), "email")}`;
  }
  if (job === "agent") return `evaluated ${num("evaluated")}, submitted ${num("submitted")}, accepted ${num("accepted")}`;
  if (job === "repair") return `tried ${num("tried")}, recovered ${num("recovered")}, gave up on ${num("gaveUp")}, still trying ${num("stillTrying")}`;
  return typeof r.skipped === "string" && r.skipped ? `added none (${r.skipped.replace(/_/g, " ")})` : `added ${plural(num("added"), "company", "companies")}, ${num("fromPool")} from the pool`;
}

/** Jobs run once a day; allow a little over a day for the schedule to drift before calling one overdue. */
export const STALE_AFTER_HOURS = 30;
const HOUR_MS = 3_600_000;

const ageHours = (now: Date, iso: string) => (now.getTime() - new Date(iso).getTime()) / HOUR_MS;

/**
 * The outreach agent runs on weekdays only, so a run on a Friday (or any weekend day) is not overdue until Monday's run
 * has had its chance. Every other job runs daily.
 */
function staleAfterHours(job: HeartbeatJob, lastRunAt: string): number {
  if (job !== "agent") return STALE_AFTER_HOURS;
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "short" }).format(new Date(lastRunAt));
  return ["Fri", "Sat", "Sun"].includes(weekday) ? STALE_AFTER_HOURS + 48 : STALE_AFTER_HOURS;
}

/** Other jobs that have reported before but not within 30 hours. A job that never reported is not flagged: it has no history yet. */
export function staleSiblings(now: Date, beats: Heartbeats, self: HeartbeatJob): HeartbeatJob[] {
  return HEARTBEAT_JOBS.filter((job) => job !== self && beats[job] !== null && beats[job] !== undefined && ageHours(now, beats[job]!) > staleAfterHours(job, beats[job]!));
}

export interface JobHealth {
  state: "ok" | "overdue" | "never_ran";
  lastRunAt: string | null;
}

/**
 * For the portal: is this job running as it should? Checked on the read side so it works even when every job is dead.
 * Nothing is overdue while outreach is off. A missing heartbeat only counts once there have been prospects for over a day.
 */
export function jobHealth(
  now: Date,
  lastRunAt: string | null,
  context: { mode: OutreachMode; oldestProspectAt: string | null; job?: HeartbeatJob },
): JobHealth {
  if (context.mode === "off") return { state: "ok", lastRunAt };
  if (lastRunAt) return { state: ageHours(now, lastRunAt) > staleAfterHours(context.job ?? "discover", lastRunAt) ? "overdue" : "ok", lastRunAt };
  const waited = context.oldestProspectAt !== null && ageHours(now, context.oldestProspectAt) > 24;
  return { state: waited ? "never_ran" : "ok", lastRunAt: null };
}
