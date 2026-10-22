export type OutreachMode = "off" | "dry_run" | "exec_only" | "live";

export interface OutreachSettings {
  mode: OutreachMode;
  paused: boolean;
  dailyCapOverride: number | null;
  /** "YYYY-MM-DD" (Pacific) of the first day outreach left `off`; the ramp counts from here. */
  startedOn: string | null;
  windowStartHour: number;
  windowEndHour: number;
  senderName: string;
  postalAddress: string;
  /** Business days after the first send for each follow-up, ascending. */
  followupDays: number[];
}

export const DEFAULT_OUTREACH_SETTINGS: OutreachSettings = {
  mode: "off",
  paused: false,
  dailyCapOverride: null,
  startedOn: null,
  windowStartHour: 9,
  windowEndHour: 16,
  senderName: "180 Degrees Consulting at UCSC",
  postalAddress: "1156 High St, Santa Cruz, CA 95064",
  followupDays: [4, 9, 15],
};

export const OUTREACH_SETTING_KEYS = [
  "outreach_mode",
  "outreach_paused",
  "outreach_daily_cap_override",
  "outreach_started_on",
  "outreach_window_start_hour",
  "outreach_window_end_hour",
  "outreach_sender_name",
  "outreach_postal_address",
  "outreach_followup_days",
];

const MODES: OutreachMode[] = ["off", "dry_run", "exec_only", "live"];

function hour(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : null;
}

function followupDays(value: string | undefined): number[] | null {
  if (!value) return null;
  const days = value.split(",").map((d) => Number(d.trim()));
  const ascending = days.every((d, i) => Number.isInteger(d) && d > 0 && (i === 0 || d > days[i - 1]));
  return days.length > 0 && ascending ? days : null;
}

export function parseOutreachSettings(rows: { key: string; value: string }[]): OutreachSettings {
  const get = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const d = DEFAULT_OUTREACH_SETTINGS;

  const start = hour(get.outreach_window_start_hour);
  const end = hour(get.outreach_window_end_hour);
  const windowOk = start !== null && end !== null && end > start;

  const cap = Number(get.outreach_daily_cap_override);
  const startedOn = /^\d{4}-\d{2}-\d{2}$/.test(get.outreach_started_on ?? "") ? get.outreach_started_on : null;

  return {
    mode: MODES.includes(get.outreach_mode as OutreachMode) ? (get.outreach_mode as OutreachMode) : d.mode,
    paused: get.outreach_paused === "true",
    dailyCapOverride:
      get.outreach_daily_cap_override && Number.isInteger(cap) && cap >= 0 ? cap : d.dailyCapOverride,
    startedOn,
    windowStartHour: windowOk ? start : d.windowStartHour,
    windowEndHour: windowOk ? end : d.windowEndHour,
    senderName: get.outreach_sender_name?.trim() || d.senderName,
    postalAddress: get.outreach_postal_address?.trim() || d.postalAddress,
    followupDays: followupDays(get.outreach_followup_days) ?? d.followupDays,
  };
}

/**
 * Switching on after being fully off starts the slow ramp again, so a long break never
 * turns into a full-speed restart from a cold sender.
 */
export function shouldRestartRamp(previous: OutreachMode, next: OutreachMode): boolean {
  return previous === "off" && next === "live";
}
