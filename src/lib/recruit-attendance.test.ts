import { describe, expect, it } from "vitest";
import {
  bookingKey,
  bookingsInQuarter,
  isBookingPast,
  NO_SHOW_DEFAULT_REASON,
  splitQueue,
  systemKeyFor,
  type QueueBooking,
} from "./recruit-attendance";

const booking = (over: Partial<QueueBooking> = {}): QueueBooking => ({
  kind: "coffee_chat",
  bookingId: "b1",
  applicantName: "Jessica Kim",
  applicantEmail: "jkim@ucsc.edu",
  status: "confirmed",
  date: "2026-10-14",
  startTime: "14:00",
  endTime: "14:20",
  ...over,
});

describe("systemKeyFor", () => {
  it("maps coffee chat statuses to the system categories", () => {
    expect(systemKeyFor("coffee_chat", "attended")).toBe("coffee_chat_attended");
    expect(systemKeyFor("coffee_chat", "no_show")).toBe("coffee_chat_no_show");
    expect(systemKeyFor("coffee_chat", "excused")).toBe("coffee_chat_excused");
  });
  it("gives interviews no points at all", () => {
    expect(systemKeyFor("interview", "attended")).toBeNull();
    expect(systemKeyFor("interview", "no_show")).toBeNull();
    expect(systemKeyFor("interview", "excused")).toBeNull();
  });
  it("has a sensible default no-show reason", () => {
    expect(NO_SHOW_DEFAULT_REASON).toMatch(/no-show/i);
  });
});

describe("bookingKey", () => {
  it("separates the two booking tables", () => {
    expect(bookingKey("coffee_chat", "x")).not.toBe(bookingKey("interview", "x"));
  });
});

describe("isBookingPast", () => {
  it("is false before the slot ends and true after (org time zone)", () => {
    expect(isBookingPast("2026-10-14", "14:20", new Date("2026-10-14T20:00:00Z"))).toBe(false); // 1pm PDT
    expect(isBookingPast("2026-10-14", "14:20", new Date("2026-10-14T21:30:00Z"))).toBe(true); // 2:30pm PDT
  });
  it("accepts HH:MM:SS end times", () => {
    expect(isBookingPast("2026-10-14", "14:20:00", new Date("2026-10-15T12:00:00Z"))).toBe(true);
  });
});

describe("bookingsInQuarter", () => {
  const quarter = { start_date: "2026-09-24", end_date: "2026-12-12" };
  it("keeps bookings dated inside the quarter, inclusive", () => {
    const inside = [booking({ date: "2026-09-24" }), booking({ date: "2026-12-12", bookingId: "b2" })];
    const outside = [booking({ date: "2026-09-23", bookingId: "b3" }), booking({ date: "2027-01-05", bookingId: "b4" })];
    expect(bookingsInQuarter([...inside, ...outside], quarter).map((b) => b.bookingId)).toEqual(["b1", "b2"]);
  });
});

describe("splitQueue", () => {
  const now = new Date("2026-10-20T12:00:00Z");

  it("puts past, unmarked, non-cancelled bookings in toMark", () => {
    const { toMark } = splitQueue([booking()], new Set(), now);
    expect(toMark).toHaveLength(1);
  });
  it("excludes already-marked bookings", () => {
    const marked = new Set([bookingKey("coffee_chat", "b1")]);
    expect(splitQueue([booking()], marked, now).toMark).toHaveLength(0);
  });
  it("lists cancelled bookings separately and never as to-mark", () => {
    const result = splitQueue([booking({ status: "cancelled" })], new Set(), now);
    expect(result.toMark).toHaveLength(0);
    expect(result.cancelled).toHaveLength(1);
  });
  it("counts future bookings as upcoming, not to-mark", () => {
    const result = splitQueue([booking({ date: "2026-10-25" })], new Set(), now);
    expect(result.toMark).toHaveLength(0);
    expect(result.upcoming).toBe(1);
  });
  it("sorts to-mark by date then time", () => {
    const result = splitQueue(
      [
        booking({ bookingId: "late", date: "2026-10-15", startTime: "15:00" }),
        booking({ bookingId: "early", date: "2026-10-14", startTime: "14:00" }),
      ],
      new Set(),
      now,
    );
    expect(result.toMark.map((b) => b.bookingId)).toEqual(["early", "late"]);
  });
});
