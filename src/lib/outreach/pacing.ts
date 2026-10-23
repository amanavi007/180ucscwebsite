import { formatOrgDate, ORG_TIME_ZONE } from "@/lib/date";
import type { OutreachSettings } from "./settings";

const MIN_GAP_MS = 3 * 60_000;
const LEAD_MS = 2 * 60_000;
const RAMP_START_CAP = 15;
const RAMP_HOLD_DAYS = 5;
const RAMP_STEP = 5;
const RAMP_MAX_CAP = 40;
const OVERRIDE_MAX = 100;

const dayNumber = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
};

/** How many emails may go out today. Holds at 15 for five days, then +5 a day up to 40. */
export function dailyCap(startedOn: string | null, today: string, override: number | null): number {
  if (!startedOn) return 0;
  if (override !== null) return Math.min(override, OVERRIDE_MAX);
  const day = dayNumber(today) - dayNumber(startedOn);
  if (day < RAMP_HOLD_DAYS) return RAMP_START_CAP;
  return Math.min(RAMP_MAX_CAP, RAMP_START_CAP + RAMP_STEP * (day - RAMP_HOLD_DAYS + 1));
}

/** The UTC instant at which a Pacific wall clock reads `date` `hour`:00. */
export function pacificInstant(date: string, hour: number): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, 0);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ORG_TIME_ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(new Date(guess))
      .map((p) => [p.type, p.value]),
  );
  const asLocal = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return new Date(guess - (asLocal - guess));
}

const isWeekendPacific = (now: Date) => {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: ORG_TIME_ZONE, weekday: "short" }).format(now);
  return weekday === "Sat" || weekday === "Sun";
};

/**
 * Spreads up to `count` sends across the rest of today's Pacific send window. Each lands at a random
 * point in its own slice of the window, so they stay sorted and at least 3 minutes apart.
 */
export function planSendTimes(args: {
  now: Date;
  count: number;
  windowStartHour: number;
  windowEndHour: number;
  rng?: () => number;
}): Date[] {
  const { now, windowStartHour, windowEndHour, rng = Math.random } = args;
  if (args.count <= 0 || isWeekendPacific(now)) return [];
  const today = formatOrgDate(now);
  const windowStart = pacificInstant(today, windowStartHour).getTime();
  const windowEnd = pacificInstant(today, windowEndHour).getTime();
  const earliest = Math.max(windowStart, now.getTime() + LEAD_MS);
  const span = windowEnd - earliest;
  if (span < 0) return [];
  const count = Math.min(args.count, Math.floor(span / MIN_GAP_MS));
  if (count === 0) return [];
  const slice = span / count;
  return Array.from({ length: count }, (_, i) => {
    const t = earliest + i * slice + rng() * (slice - MIN_GAP_MS);
    return new Date(Math.floor(t / 1000) * 1000);
  });
}

export type BrakeReason = "paused" | "booking_closed" | "bounce_rate" | "complaint_rate" | "account_error" | "mode_off";

/** Whether sending may go ahead. Bounce and complaint limits sit well under Resend's 4% and 0.08%. */
export function evaluateBrakes(args: {
  sent: number;
  bounced: number;
  complained: number;
  settings: OutreachSettings;
  bookingOpen: boolean;
  resendAccountError: boolean;
}): { allow: boolean; reason: BrakeReason | null } {
  const { sent, bounced, complained, settings } = args;
  const checks: [BrakeReason, boolean][] = [
    ["mode_off", settings.mode === "off"],
    ["paused", settings.paused],
    ["booking_closed", !args.bookingOpen],
    ["account_error", args.resendAccountError],
    ["bounce_rate", bounced >= 2 && sent > 0 && bounced / sent >= 0.02],
    ["complaint_rate", complained >= 1 && sent > 0 && complained / sent >= 0.0005],
  ];
  const tripped = checks.find(([, on]) => on);
  return tripped ? { allow: false, reason: tripped[0] } : { allow: true, reason: null };
}
