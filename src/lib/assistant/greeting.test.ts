import { describe, expect, it } from "vitest";
import { currentOrgHour, greetingForHour } from "./greeting";

describe("greetingForHour", () => {
  it.each([
    [4, "Late night"],
    [5, "Morning"],
    [11, "Morning"],
    [12, "Afternoon"],
    [16, "Afternoon"],
    [17, "Evening"],
    [21, "Evening"],
    [22, "Late night"],
    [0, "Late night"],
  ])("hour %i is %s", (hour, word) => {
    expect(greetingForHour(hour)).toBe(word);
  });
});

describe("currentOrgHour", () => {
  it("reads the hour in Pacific time, DST-aware", () => {
    expect(currentOrgHour(new Date("2026-10-07T20:30:00Z"))).toBe(13); // PDT (UTC-7)
    expect(currentOrgHour(new Date("2026-12-07T08:00:00Z"))).toBe(0); // PST (UTC-8), midnight not 24
  });
});
