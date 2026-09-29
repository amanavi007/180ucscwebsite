import { zonedDateTimeToUtc } from "./date";

export interface CoffeeChatBookingForInvite {
  applicantName: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  location: string;
  manageToken: string;
}

function toUtcStamp(date: string, time: string): string {
  const utc = zonedDateTimeToUtc(date, time);
  return utc.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

export function buildGoogleCalendarUrl(booking: CoffeeChatBookingForInvite): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: "180DC UCSC Coffee Chat",
    dates: `${toUtcStamp(booking.date, booking.startTime)}/${toUtcStamp(booking.date, booking.endTime)}`,
    details: `Coffee chat with 180DC UCSC exec as part of recruitment.`,
  });
  if (booking.location.trim() !== "") params.set("location", booking.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** RFC 5545 requires CRLF line endings. */
function icsLines(lines: string[]): string {
  return lines.join("\r\n");
}

export function buildIcsContent(booking: CoffeeChatBookingForInvite): string {
  const dtstamp = toUtcStamp(booking.date, booking.startTime);
  return icsLines([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//180DC UCSC//Coffee Chat//EN",
    "BEGIN:VEVENT",
    `UID:${booking.manageToken}@180dcucsc.org`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${toUtcStamp(booking.date, booking.startTime)}`,
    `DTEND:${toUtcStamp(booking.date, booking.endTime)}`,
    "SUMMARY:180DC UCSC Coffee Chat",
    ...(booking.location.trim() !== "" ? [`LOCATION:${booking.location}`] : []),
    "DESCRIPTION:Coffee chat with 180DC UCSC exec as part of recruitment.",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]);
}
