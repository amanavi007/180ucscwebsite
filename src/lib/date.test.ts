import { describe, expect, it } from "vitest";
import { formatDateLong, toDateString, zonedDateTimeToUtc } from "./date";

describe("formatDateLong", () => {
  it("formats a YYYY-MM-DD date as a friendly weekday date, without shifting a day", () => {
    expect(formatDateLong("2026-10-01")).toBe("Thursday, October 1, 2026");
  });
});

describe("toDateString", () => {
  it("formats a local Date as YYYY-MM-DD", () => {
    expect(toDateString(new Date(2026, 9, 1))).toBe("2026-10-01");
  });
});

describe("zonedDateTimeToUtc", () => {
  it("converts a Pacific Standard Time wall-clock moment to UTC (winter, UTC-8)", () => {
    const result = zonedDateTimeToUtc("2026-01-15", "14:30");
    expect(result.toISOString()).toBe("2026-01-15T22:30:00.000Z");
  });

  it("converts a Pacific Daylight Time wall-clock moment to UTC (summer, UTC-7)", () => {
    const result = zonedDateTimeToUtc("2026-07-15", "14:30");
    expect(result.toISOString()).toBe("2026-07-15T21:30:00.000Z");
  });
});
