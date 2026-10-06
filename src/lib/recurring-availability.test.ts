import { describe, expect, it } from "vitest";
import { MAX_RECURRING_DAYS, expandRecurringAvailability } from "./recurring-availability";

const mon = { weekday: 1, blocks: [{ startTime: "09:00", endTime: "12:00" }] };
const wed = { weekday: 3, blocks: [{ startTime: "13:00", endTime: "15:00" }, { startTime: "16:00", endTime: "17:00" }] };

describe("expandRecurringAvailability", () => {
  it("creates a row per matching weekday and block, inclusive of both range ends", () => {
    // 2026-10-19 is a Monday; 2026-10-28 is a Wednesday.
    const result = expandRecurringAvailability({ startDate: "2026-10-19", endDate: "2026-10-28", schedules: [mon, wed] });
    if ("error" in result) throw new Error(result.error);
    expect(result.dayCount).toBe(4); // Mon 19, Wed 21, Mon 26, Wed 28
    expect(result.rows.map((r) => `${r.date} ${r.startTime}-${r.endTime}`)).toEqual([
      "2026-10-19 09:00-12:00",
      "2026-10-21 13:00-15:00",
      "2026-10-21 16:00-17:00",
      "2026-10-26 09:00-12:00",
      "2026-10-28 13:00-15:00",
      "2026-10-28 16:00-17:00",
    ]);
  });

  it("handles a single-day range and a month boundary", () => {
    const one = expandRecurringAvailability({ startDate: "2026-10-19", endDate: "2026-10-19", schedules: [mon] });
    expect("rows" in one && one.rows).toHaveLength(1);
    const across = expandRecurringAvailability({ startDate: "2026-10-30", endDate: "2026-11-03", schedules: [mon] });
    if ("error" in across) throw new Error(across.error);
    expect(across.rows.map((r) => r.date)).toEqual(["2026-11-02"]);
  });

  it("is not thrown off by the daylight-saving change", () => {
    // DST ends 2026-11-01 (a Sunday). Mondays on either side must still be found.
    const result = expandRecurringAvailability({ startDate: "2026-10-26", endDate: "2026-11-09", schedules: [mon] });
    if ("error" in result) throw new Error(result.error);
    expect(result.rows.map((r) => r.date)).toEqual(["2026-10-26", "2026-11-02", "2026-11-09"]);
  });

  it("ignores weekdays without blocks, and errors when no selected weekday occurs in the range", () => {
    const result = expandRecurringAvailability({
      startDate: "2026-10-20",
      endDate: "2026-10-20", // a Tuesday; only Monday has blocks
      schedules: [mon, { weekday: 2, blocks: [] }],
    });
    expect(result).toEqual({ error: "None of the selected weekdays fall inside that date range." });
  });

  it("rejects bad ranges, empty schedules, bad blocks and overlong ranges", () => {
    const err = (input: Parameters<typeof expandRecurringAvailability>[0]) => {
      const r = expandRecurringAvailability(input);
      return "error" in r ? r.error : null;
    };
    expect(err({ startDate: "2026-10-20", endDate: "2026-10-19", schedules: [mon] })).toMatch(/end date/i);
    expect(err({ startDate: "", endDate: "2026-10-19", schedules: [mon] })).toMatch(/start and end/i);
    expect(err({ startDate: "2026-10-19", endDate: "2026-10-30", schedules: [] })).toMatch(/at least one weekday/i);
    expect(err({ startDate: "2026-10-19", endDate: "2026-10-30", schedules: [{ weekday: 1, blocks: [] }] })).toMatch(/at least one weekday/i);
    expect(
      err({ startDate: "2026-10-19", endDate: "2026-10-30", schedules: [{ weekday: 1, blocks: [{ startTime: "12:00", endTime: "09:00" }] }] }),
    ).toMatch(/end time after/i);
    expect(
      err({
        startDate: "2026-10-19",
        endDate: "2026-10-30",
        schedules: [{ weekday: 1, blocks: [{ startTime: "09:00", endTime: "11:00" }, { startTime: "10:00", endTime: "12:00" }] }],
      }),
    ).toMatch(/overlap/i);
    expect(err({ startDate: "2026-10-19", endDate: "2027-10-19", schedules: [mon] })).toMatch(String(MAX_RECURRING_DAYS));
    expect(err({ startDate: "2026-10-19", endDate: "2026-10-30", schedules: [{ weekday: 9, blocks: mon.blocks }] })).toMatch(/weekday/i);
    expect(err({ startDate: "2026-02-31", endDate: "2026-03-05", schedules: [mon] })).toMatch(/start and end/i);
  });

  it("lets the last entry for a repeated weekday win", () => {
    const result = expandRecurringAvailability({
      startDate: "2026-10-19",
      endDate: "2026-10-19",
      schedules: [mon, { weekday: 1, blocks: [{ startTime: "14:00", endTime: "15:00" }] }],
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.rows.map((r) => r.startTime)).toEqual(["14:00"]);
  });
});
