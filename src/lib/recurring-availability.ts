import { expandAvailabilityEntry, type AvailabilityRowInput, type TimeBlockInput } from "./coffee-chat";

/** Longest date range one recurring entry may cover (guards against a typo'd end year). */
export const MAX_RECURRING_DAYS = 120;

export interface WeekdaySchedule {
  /** 0 = Sunday ... 6 = Saturday, like `Date.getDay()`. */
  weekday: number;
  blocks: TimeBlockInput[];
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" -> UTC midnight ms, or null if it isn't a real calendar date. UTC keeps daylight-saving shifts out of the day count. */
function dateToUtcMs(date: string): number | null {
  const match = DATE_RE.exec(date);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return ms;
}

/**
 * Expands a weekly pattern over a date range (both ends inclusive) into one
 * availability row per matching day and block. Weekdays with no blocks are
 * ignored; if a weekday is listed twice, the last entry wins. Each weekday's
 * blocks are validated the same way as the one-off form.
 */
export function expandRecurringAvailability(input: {
  startDate: string;
  endDate: string;
  schedules: WeekdaySchedule[];
}): { rows: AvailabilityRowInput[]; dayCount: number } | { error: string } {
  const startMs = dateToUtcMs(input.startDate);
  const endMs = dateToUtcMs(input.endDate);
  if (startMs === null || endMs === null) return { error: "Pick both a start and end date." };
  if (endMs < startMs) return { error: "The end date must be on or after the start date." };
  const totalDays = Math.round((endMs - startMs) / DAY_MS) + 1;
  if (totalDays > MAX_RECURRING_DAYS) return { error: `Pick a range of ${MAX_RECURRING_DAYS} days or fewer.` };

  const byWeekday = new Map<number, TimeBlockInput[]>();
  for (const schedule of input.schedules) {
    if (!Number.isInteger(schedule.weekday) || schedule.weekday < 0 || schedule.weekday > 6) {
      return { error: "Each schedule needs a valid weekday." };
    }
    byWeekday.set(schedule.weekday, schedule.blocks);
  }
  const active = [...byWeekday].filter(([, blocks]) => blocks.length > 0);
  if (active.length === 0) return { error: "Add a time block to at least one weekday." };

  const datesByWeekday = new Map<number, string[]>();
  for (let i = 0; i < totalDays; i++) {
    const day = new Date(startMs + i * DAY_MS);
    const weekday = day.getUTCDay();
    if (!byWeekday.get(weekday)?.length) continue;
    if (!datesByWeekday.has(weekday)) datesByWeekday.set(weekday, []);
    datesByWeekday.get(weekday)!.push(day.toISOString().slice(0, 10));
  }
  if (datesByWeekday.size === 0) return { error: "None of the selected weekdays fall inside that date range." };

  const rows: AvailabilityRowInput[] = [];
  let dayCount = 0;
  for (const [weekday, dates] of datesByWeekday) {
    const expanded = expandAvailabilityEntry(dates, byWeekday.get(weekday)!);
    if ("error" in expanded) return { error: expanded.error };
    rows.push(...expanded.rows);
    dayCount += dates.length;
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  return { rows, dayCount };
}
