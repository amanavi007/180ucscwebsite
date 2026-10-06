export interface ClientMeetingReminderBooking {
  id: string;
  status: string;
  contactName: string;
  email: string;
  manageToken: string;
  meetingUrl: string | null;
  date: string;
  startTime: string;
  endTime: string;
  reminderDayBeforeSentAt: string | null;
  reminderMorningSentAt: string | null;
}

export interface ClientMeetingReminder {
  bookingId: string;
  kind: "day_before" | "morning";
  to: string;
  contactName: string;
  manageToken: string;
  meetingUrl: string | null;
  date: string;
  startTime: string;
  endTime: string;
}

/** Confirmed meetings tomorrow without a day-before reminder, and today without a morning one. */
export function selectClientMeetingReminders(input: {
  today: string;
  tomorrow: string;
  bookings: ClientMeetingReminderBooking[];
}): ClientMeetingReminder[] {
  const reminders: ClientMeetingReminder[] = [];
  for (const b of input.bookings) {
    if (b.status !== "confirmed") continue;
    let kind: ClientMeetingReminder["kind"] | null = null;
    if (b.date === input.tomorrow && !b.reminderDayBeforeSentAt) kind = "day_before";
    else if (b.date === input.today && !b.reminderMorningSentAt) kind = "morning";
    if (!kind) continue;
    reminders.push({
      bookingId: b.id,
      kind,
      to: b.email,
      contactName: b.contactName,
      manageToken: b.manageToken,
      meetingUrl: b.meetingUrl,
      date: b.date,
      startTime: b.startTime,
      endTime: b.endTime,
    });
  }
  return reminders;
}
