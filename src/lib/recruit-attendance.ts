import { zonedDateTimeToUtc } from "./date";

export type BookingKind = "coffee_chat" | "interview";
export type AttendanceStatus = "attended" | "no_show" | "excused";

export const NO_SHOW_DEFAULT_REASON = "No-show, no notice";

/** Which system category a mark uses. Interviews never create points. */
export function systemKeyFor(kind: BookingKind, status: AttendanceStatus): string | null {
  if (kind !== "coffee_chat") return null;
  if (status === "attended") return "coffee_chat_attended";
  if (status === "no_show") return "coffee_chat_no_show";
  return "coffee_chat_excused";
}

export function bookingKey(kind: BookingKind, bookingId: string): string {
  return `${kind}:${bookingId}`;
}

export interface QueueBooking {
  kind: BookingKind;
  bookingId: string;
  applicantName: string;
  applicantEmail: string;
  status: "confirmed" | "cancelled" | "completed";
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
}

export function isBookingPast(date: string, endTime: string, now: Date): boolean {
  return zonedDateTimeToUtc(date, endTime.slice(0, 5)).getTime() <= now.getTime();
}

export function bookingsInQuarter(
  bookings: QueueBooking[],
  quarter: { start_date: string; end_date: string },
): QueueBooking[] {
  return bookings.filter((b) => b.date >= quarter.start_date && b.date <= quarter.end_date);
}

export function splitQueue(
  bookings: QueueBooking[],
  markedKeys: Set<string>,
  now: Date,
): { toMark: QueueBooking[]; cancelled: QueueBooking[]; upcoming: number } {
  const toMark: QueueBooking[] = [];
  const cancelled: QueueBooking[] = [];
  let upcoming = 0;
  for (const b of bookings) {
    if (b.status === "cancelled") {
      cancelled.push(b);
    } else if (markedKeys.has(bookingKey(b.kind, b.bookingId))) {
      continue;
    } else if (isBookingPast(b.date, b.endTime, now)) {
      toMark.push(b);
    } else {
      upcoming++;
    }
  }
  const byTime = (a: QueueBooking, b: QueueBooking) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`);
  return { toMark: toMark.sort(byTime), cancelled: cancelled.sort(byTime), upcoming };
}
