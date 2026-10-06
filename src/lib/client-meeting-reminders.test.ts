import { describe, expect, it } from "vitest";
import { selectClientMeetingReminders, type ClientMeetingReminderBooking } from "./client-meeting-reminders";

const b = (over: Partial<ClientMeetingReminderBooking>): ClientMeetingReminderBooking => ({
  id: "b1", status: "confirmed", contactName: "Jo", email: "jo@x.com", manageToken: "t", meetingUrl: null,
  date: "2026-10-21", startTime: "10:00", endTime: "10:30", reminderDayBeforeSentAt: null, reminderMorningSentAt: null, ...over,
});
const input = (bookings: ClientMeetingReminderBooking[]) => ({ today: "2026-10-20", tomorrow: "2026-10-21", bookings });

describe("selectClientMeetingReminders", () => {
  it("day-before for tomorrow, morning for today", () => {
    expect(selectClientMeetingReminders(input([b({})]))[0].kind).toBe("day_before");
    expect(selectClientMeetingReminders(input([b({ date: "2026-10-20" })]))[0].kind).toBe("morning");
  });
  it("skips already-sent, cancelled/completed, and other dates", () => {
    expect(selectClientMeetingReminders(input([b({ reminderDayBeforeSentAt: "x" })]))).toEqual([]);
    expect(selectClientMeetingReminders(input([b({ date: "2026-10-20", reminderMorningSentAt: "x" })]))).toEqual([]);
    expect(selectClientMeetingReminders(input([b({ status: "cancelled" }), b({ id: "c", status: "completed" })]))).toEqual([]);
    expect(selectClientMeetingReminders(input([b({ date: "2026-10-25" })]))).toEqual([]);
  });
  it("carries the meeting link", () => {
    expect(selectClientMeetingReminders(input([b({ meetingUrl: "https://zoom.us/j/1" })]))[0].meetingUrl).toBe("https://zoom.us/j/1");
  });
});
