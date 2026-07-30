/** Org-wide meeting schedule: Tuesday and Thursday, per the org's locked-in schedule. */
const MEETING_WEEKDAYS = [2, 4];

function parseDateOnly(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isMeetingDate(dateString: string): boolean {
  return MEETING_WEEKDAYS.includes(parseDateOnly(dateString).getDay());
}

/** Every Tue/Thu between start and end (both inclusive, "YYYY-MM-DD"), in order. */
export function getMeetingDatesInRange(startDate: string, endDate: string): string[] {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  const dates: string[] = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (MEETING_WEEKDAYS.includes(d.getDay())) dates.push(toDateString(d));
  }
  return dates;
}

export type AttendanceMark = "excused" | "unexcused" | "tardy";

export interface AttendanceMarkEntry {
  date: string;
  mark: AttendanceMark;
}

export interface AttendanceRateInput {
  /** Distinct session dates logged org-wide for the quarter (the shared denominator). */
  totalSessionDates: string[];
  /** Distinct session dates this member's own team has logged for the quarter. */
  teamSessionDates: string[];
  /** This member's excused/unexcused/tardy marks within the quarter. */
  marks: AttendanceMarkEntry[];
}

export interface AttendanceRateResult {
  /** Present + 0.5*tardy over (total - excused). Null when the denominator is 0. */
  rate: number | null;
  totalSessions: number;
  presentCount: number;
  excusedCount: number;
  unexcusedCount: number;
  tardyCount: number;
  /** Dates logged by other teams this quarter but not by this member's own team. */
  missingSessionDates: string[];
}

/**
 * Excused absences are removed from the denominator entirely (don't hurt
 * you); tardy counts as half-credit. The denominator is the org-wide
 * session count, not a per-team one, since every team meets the same two
 * days -- see the attendance design notes for why "team never logged a
 * date" is handled as a visibility flag (missingSessionDates) rather than
 * changing the formula.
 */
export function computeAttendanceRate(input: AttendanceRateInput): AttendanceRateResult {
  const totalSessions = input.totalSessionDates.length;
  const excusedCount = input.marks.filter((m) => m.mark === "excused").length;
  const unexcusedCount = input.marks.filter((m) => m.mark === "unexcused").length;
  const tardyCount = input.marks.filter((m) => m.mark === "tardy").length;
  const presentCount = totalSessions - excusedCount - unexcusedCount - tardyCount;

  const denominator = totalSessions - excusedCount;
  const numerator = presentCount + 0.5 * tardyCount;
  const rate = denominator > 0 ? numerator / denominator : null;

  const teamDates = new Set(input.teamSessionDates);
  const missingSessionDates = input.totalSessionDates.filter((d) => !teamDates.has(d));

  return {
    rate,
    totalSessions,
    presentCount,
    excusedCount,
    unexcusedCount,
    tardyCount,
    missingSessionDates,
  };
}
