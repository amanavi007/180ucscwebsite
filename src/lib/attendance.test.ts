import { describe, expect, it } from "vitest";
import { computeAttendanceRate } from "./attendance";

const DATES_5 = ["2026-01-06", "2026-01-08", "2026-01-13", "2026-01-15", "2026-01-20"];

describe("computeAttendanceRate", () => {
  it("is 100% when a member has no marks at all (all sessions present)", () => {
    const result = computeAttendanceRate({
      totalSessionDates: DATES_5,
      teamSessionDates: DATES_5,
      marks: [],
    });
    expect(result.totalSessions).toBe(5);
    expect(result.presentCount).toBe(5);
    expect(result.rate).toBe(1);
    expect(result.missingSessionDates).toEqual([]);
  });

  it("hand-computed mix: 1 excused, 1 unexcused, 1 tardy, 2 present out of 5 sessions", () => {
    // present = 5 - 1(excused) - 1(unexcused) - 1(tardy) = 2
    // denominator = 5 - 1(excused) = 4
    // numerator = 2 + 0.5*1(tardy) = 2.5
    // rate = 2.5 / 4 = 0.625
    const result = computeAttendanceRate({
      totalSessionDates: DATES_5,
      teamSessionDates: DATES_5,
      marks: [
        { date: DATES_5[0], mark: "excused" },
        { date: DATES_5[1], mark: "unexcused" },
        { date: DATES_5[2], mark: "tardy" },
      ],
    });
    expect(result.presentCount).toBe(2);
    expect(result.excusedCount).toBe(1);
    expect(result.unexcusedCount).toBe(1);
    expect(result.tardyCount).toBe(1);
    expect(result.rate).toBeCloseTo(0.625, 10);
  });

  it("unexcused absences hurt the rate; excused ones don't", () => {
    // 2 unexcused out of 4 sessions, no excused: present=2, denom=4, rate=0.5
    const unexcusedOnly = computeAttendanceRate({
      totalSessionDates: DATES_5.slice(0, 4),
      teamSessionDates: DATES_5.slice(0, 4),
      marks: [
        { date: DATES_5[0], mark: "unexcused" },
        { date: DATES_5[1], mark: "unexcused" },
      ],
    });
    expect(unexcusedOnly.rate).toBeCloseTo(0.5, 10);

    // 2 excused out of 4 sessions instead: present=2, denom=4-2=2, rate=1 (fully forgiven)
    const excusedOnly = computeAttendanceRate({
      totalSessionDates: DATES_5.slice(0, 4),
      teamSessionDates: DATES_5.slice(0, 4),
      marks: [
        { date: DATES_5[0], mark: "excused" },
        { date: DATES_5[1], mark: "excused" },
      ],
    });
    expect(excusedOnly.rate).toBe(1);
  });

  it("tardy is half-credit, not full credit and not zero credit", () => {
    // 1 tardy out of 2 sessions: present = 2-1=1, denom=2, numerator=1+0.5=1.5, rate=0.75
    const result = computeAttendanceRate({
      totalSessionDates: DATES_5.slice(0, 2),
      teamSessionDates: DATES_5.slice(0, 2),
      marks: [{ date: DATES_5[0], mark: "tardy" }],
    });
    expect(result.rate).toBeCloseTo(0.75, 10);
  });

  it("returns a null rate instead of dividing by zero when every session is excused", () => {
    const result = computeAttendanceRate({
      totalSessionDates: [DATES_5[0]],
      teamSessionDates: [DATES_5[0]],
      marks: [{ date: DATES_5[0], mark: "excused" }],
    });
    expect(result.rate).toBeNull();
  });

  it("a member with zero marks still reads 100%, regardless of when they joined", () => {
    // Mirrors a mid-quarter join: no marks recorded yet, org-wide denominator unaffected.
    const result = computeAttendanceRate({
      totalSessionDates: DATES_5,
      teamSessionDates: DATES_5,
      marks: [],
    });
    expect(result.rate).toBe(1);
  });

  it("flags dates the org logged that this member's own team never logged", () => {
    const result = computeAttendanceRate({
      totalSessionDates: DATES_5,
      teamSessionDates: DATES_5.slice(0, 3),
      marks: [],
    });
    expect(result.missingSessionDates).toEqual([DATES_5[3], DATES_5[4]]);
    // Known trade-off: an unlogged date still reads as "present" for rate
    // purposes (no mark exists for it), which is why callers surface
    // missingSessionDates separately instead of silently trusting the rate.
    expect(result.presentCount).toBe(5);
    expect(result.rate).toBe(1);
  });
});
