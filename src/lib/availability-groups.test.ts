import { describe, expect, it } from "vitest";
import { expandRecurringAvailability } from "./recurring-availability";
import { availabilityKey, groupByBlocks } from "./availability-groups";

describe("groupByBlocks", () => {
  it("puts dates with identical blocks into one request", () => {
    const rows = ["2026-10-19", "2026-10-20"].flatMap((date) => [
      { date, startTime: "09:00", endTime: "10:00" },
      { date, startTime: "13:00", endTime: "14:00" },
    ]);
    const groups = groupByBlocks(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].dates).toEqual(["2026-10-19", "2026-10-20"]);
    expect(groups[0].blocks).toHaveLength(2);
  });
  it("splits dates whose blocks differ", () => {
    const groups = groupByBlocks([
      { date: "2026-10-19", startTime: "09:00", endTime: "10:00" },
      { date: "2026-10-20", startTime: "11:00", endTime: "12:00" },
    ]);
    expect(groups.map((g) => g.dates)).toEqual([["2026-10-19"], ["2026-10-20"]]);
  });
  it("turns a Monday to Friday schedule over two weeks into a single request of ten dates", () => {
    const expanded = expandRecurringAvailability({
      startDate: "2026-10-19",
      endDate: "2026-10-30",
      schedules: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, blocks: [{ startTime: "15:00", endTime: "17:00" }] })),
    });
    if ("error" in expanded) throw new Error(expanded.error);
    const groups = groupByBlocks(expanded.rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].dates).toHaveLength(10);
  });
});

describe("availabilityKey", () => {
  it("ignores seconds", () => {
    expect(availabilityKey({ date: "2026-10-19", startTime: "09:00:00", endTime: "10:00:00" })).toBe("2026-10-19|09:00|10:00");
  });
});
