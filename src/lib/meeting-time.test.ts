import { describe, expect, it } from "vitest";
import { formatMeetingTime, parseMeetingTime, validateMeetingTime } from "./meeting-time";
import { parseEventTime } from "./calendar-layout";

const rows = (start?: string, end?: string) => [
  ...(start ? [{ key: "meeting_start_time", value: start }] : []),
  ...(end ? [{ key: "meeting_end_time", value: end }] : []),
];

describe("parseMeetingTime", () => {
  it("reads a valid pair, ignoring seconds", () => {
    expect(parseMeetingTime(rows("19:00:00", "20:30:00"))).toEqual({ start: "19:00", end: "20:30" });
  });
  it("is null when either half is missing, malformed or backwards", () => {
    expect(parseMeetingTime(rows("19:00"))).toBeNull();
    expect(parseMeetingTime(rows("7pm", "8pm"))).toBeNull();
    expect(parseMeetingTime(rows("20:00", "19:00"))).toBeNull();
    expect(parseMeetingTime([])).toBeNull();
  });
});

describe("validateMeetingTime", () => {
  it("accepts a normal range and rejects bad ones", () => {
    expect(validateMeetingTime("19:00", "20:30")).toBeNull();
    expect(validateMeetingTime("", "20:30")).toMatch(/start and an end/);
    expect(validateMeetingTime("20:30", "19:00")).toMatch(/after the start/);
  });
});

describe("formatMeetingTime", () => {
  it("formats for display and stays readable by the calendar grid", () => {
    const label = formatMeetingTime({ start: "19:00", end: "20:30" });
    expect(label).toBe("7:00 – 8:30 PM");
    // The week view places an event by reading this same text.
    expect(parseEventTime(label)).toEqual({ start: 19 * 60, end: 20 * 60 + 30 });
  });
  it("is null with no time set", () => expect(formatMeetingTime(null)).toBeNull());
});
