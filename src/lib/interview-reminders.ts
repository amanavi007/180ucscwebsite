import { ORG_TIME_ZONE } from "./date";

export const INTERVIEW_REMINDER_HOUR = 8;

/** True when `now` falls in the 8am hour in the org's time zone (DST-aware). */
export function isInterviewReminderHour(now: Date): boolean {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: ORG_TIME_ZONE,
    hourCycle: "h23",
    hour: "2-digit",
  }).format(now);
  return Number(hour) === INTERVIEW_REMINDER_HOUR;
}

export interface ReminderBooking {
  id: string;
  status: string;
  applicantName: string;
  applicantEmail: string;
  manageToken: string;
  date: string;
  startTime: string;
  endTime: string;
  reminderDayBeforeSentAt: string | null;
  reminderMorningSentAt: string | null;
}

export interface InterviewReminder {
  bookingId: string;
  kind: "day_before" | "morning";
  to: string;
  applicantName: string;
  manageToken: string;
  date: string;
  startTime: string;
  endTime: string;
}

/**
 * Who to remind: confirmed bookings for tomorrow that haven't had the
 * day-before reminder, and confirmed bookings for today that haven't had
 * the morning reminder. Cancelled bookings never get one.
 */
export function selectInterviewReminders(input: {
  today: string;
  tomorrow: string;
  bookings: ReminderBooking[];
}): InterviewReminder[] {
  const reminders: InterviewReminder[] = [];
  for (const b of input.bookings) {
    if (b.status !== "confirmed") continue;
    let kind: InterviewReminder["kind"] | null = null;
    if (b.date === input.tomorrow && !b.reminderDayBeforeSentAt) kind = "day_before";
    else if (b.date === input.today && !b.reminderMorningSentAt) kind = "morning";
    if (!kind) continue;
    reminders.push({
      bookingId: b.id,
      kind,
      to: b.applicantEmail,
      applicantName: b.applicantName,
      manageToken: b.manageToken,
      date: b.date,
      startTime: b.startTime,
      endTime: b.endTime,
    });
  }
  return reminders;
}
