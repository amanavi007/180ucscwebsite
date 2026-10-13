import { formatTimeRange } from "./coffee-chat";

/** Org settings keys for the time every meeting day starts and ends. */
export const MEETING_TIME_KEYS = { start: "meeting_start_time", end: "meeting_end_time" } as const;

export interface MeetingTime {
  /** 24-hour "HH:MM". */
  start: string;
  end: string;
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Reads the two settings rows. Returns null unless both are present and valid, so a half-saved time never shows. */
export function parseMeetingTime(rows: { key: string; value: string }[]): MeetingTime | null {
  const get = (key: string) => rows.find((r) => r.key === key)?.value?.slice(0, 5);
  const start = get(MEETING_TIME_KEYS.start);
  const end = get(MEETING_TIME_KEYS.end);
  if (!start || !end || !CLOCK.test(start) || !CLOCK.test(end) || end <= start) return null;
  return { start, end };
}

/** Returns an error message when the time can't be saved, otherwise null. */
export function validateMeetingTime(start: string, end: string): string | null {
  if (!CLOCK.test(start) || !CLOCK.test(end)) return "Pick a start and an end time.";
  if (end <= start) return "The end time must be after the start time.";
  return null;
}

/** "7:00 – 8:30 PM", or null when no time is set (meeting days then show as all-day). */
export function formatMeetingTime(time: MeetingTime | null): string | null {
  return time ? formatTimeRange(time.start, time.end) : null;
}
