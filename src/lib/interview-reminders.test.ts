import { describe, expect, it } from "vitest";
import { isInterviewReminderHour, selectInterviewReminders, type ReminderBooking } from "./interview-reminders";

const booking = (over: Partial<ReminderBooking>): ReminderBooking => ({
  id: "b1",
  status: "confirmed",
  applicantName: "Jane",
  applicantEmail: "jane@ucsc.edu",
  manageToken: "tok",
  date: "2026-10-07",
  startTime: "09:00",
  endTime: "10:00",
  reminderDayBeforeSentAt: null,
  reminderMorningSentAt: null,
  ...over,
});

const input = (bookings: ReminderBooking[]) => ({ today: "2026-10-06", tomorrow: "2026-10-07", bookings });

describe("isInterviewReminderHour", () => {
  it("is true at 8am Pacific in summer (PDT) and winter (PST)", () => {
    expect(isInterviewReminderHour(new Date("2026-07-15T15:00:00Z"))).toBe(true);
    expect(isInterviewReminderHour(new Date("2026-12-15T16:00:00Z"))).toBe(true);
  });

  it("is false an hour off in either season", () => {
    expect(isInterviewReminderHour(new Date("2026-07-15T16:00:00Z"))).toBe(false);
    expect(isInterviewReminderHour(new Date("2026-12-15T15:00:00Z"))).toBe(false);
  });
});

describe("selectInterviewReminders", () => {
  it("sends a day-before reminder for tomorrow's interview", () => {
    const [r, ...rest] = selectInterviewReminders(input([booking({})]));
    expect(rest).toEqual([]);
    expect(r).toMatchObject({ bookingId: "b1", kind: "day_before", to: "jane@ucsc.edu", manageToken: "tok" });
  });

  it("sends a morning reminder for today's interview", () => {
    const [r] = selectInterviewReminders(input([booking({ date: "2026-10-06" })]));
    expect(r.kind).toBe("morning");
  });

  it("skips cancelled bookings", () => {
    expect(selectInterviewReminders(input([booking({ status: "cancelled" })]))).toEqual([]);
  });

  it("skips reminders already sent", () => {
    expect(selectInterviewReminders(input([booking({ reminderDayBeforeSentAt: "2026-10-06T15:00:00Z" })]))).toEqual([]);
    expect(
      selectInterviewReminders(input([booking({ date: "2026-10-06", reminderMorningSentAt: "2026-10-06T15:00:00Z" })])),
    ).toEqual([]);
  });

  it("ignores interviews on other days", () => {
    expect(selectInterviewReminders(input([booking({ date: "2026-10-09" }), booking({ id: "b2", date: "2026-10-01" })]))).toEqual([]);
  });

  it("handles several bookings, one reminder each", () => {
    const result = selectInterviewReminders(
      input([booking({ id: "a" }), booking({ id: "b", date: "2026-10-06", applicantEmail: "sam@ucsc.edu" })]),
    );
    expect(result.map((r) => [r.bookingId, r.kind])).toEqual([
      ["a", "day_before"],
      ["b", "morning"],
    ]);
  });
});
