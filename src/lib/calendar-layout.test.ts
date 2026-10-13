import { describe, expect, it } from "vitest";
import { layoutDay, parseEventTime } from "./calendar-layout";

describe("parseEventTime", () => {
  it("reads common spellings", () => {
    expect(parseEventTime("7pm")).toEqual({ start: 19 * 60, end: null });
    expect(parseEventTime("7:30 PM")).toEqual({ start: 19 * 60 + 30, end: null });
    expect(parseEventTime("19:00")).toEqual({ start: 19 * 60, end: null });
    expect(parseEventTime("12 am")).toEqual({ start: 0, end: null });
    expect(parseEventTime("12:15 pm")).toEqual({ start: 12 * 60 + 15, end: null });
  });
  it("reads a range and lets the first time borrow am/pm", () => {
    expect(parseEventTime("6:30-8 pm")).toEqual({ start: 18 * 60 + 30, end: 20 * 60 });
    expect(parseEventTime("10 am to 2 pm")).toEqual({ start: 10 * 60, end: 14 * 60 });
  });
  it("returns null for all-day or empty text", () => {
    expect(parseEventTime(null)).toBeNull();
    expect(parseEventTime("")).toBeNull();
    expect(parseEventTime("all day")).toBeNull();
    expect(parseEventTime("Room 5")).toBeNull();
  });
  it("ignores an end that is not after the start", () => {
    expect(parseEventTime("9 pm - 8 pm")?.end).toBeNull();
  });
});

describe("layoutDay", () => {
  it("puts non-overlapping events in a single column", () => {
    const out = layoutDay([
      { item: "a", time: { start: 540, end: 600 } },
      { item: "b", time: { start: 600, end: 660 } },
    ]);
    expect(out.map((o) => [o.item, o.column, o.columns])).toEqual([["a", 0, 1], ["b", 0, 1]]);
  });
  it("places overlapping events side by side", () => {
    const out = layoutDay([
      { item: "a", time: { start: 540, end: 660 } },
      { item: "b", time: { start: 600, end: 700 } },
    ]);
    expect(out.map((o) => [o.item, o.column, o.columns])).toEqual([["a", 0, 2], ["b", 1, 2]]);
  });
  it("gives events without an end an hour", () => {
    expect(layoutDay([{ item: "a", time: { start: 600, end: null } }])[0].end).toBe(660);
  });
});
