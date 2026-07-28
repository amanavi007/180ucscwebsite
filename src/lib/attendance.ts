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
