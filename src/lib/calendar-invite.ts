import { zonedDateTimeToUtc } from "./date";

export interface CoffeeChatBookingForInvite {
  applicantName: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  location: string;
  manageToken: string;
  /** Exec copies name the applicant; the applicant's own copy stays generic. */
  audience?: "applicant" | "exec";
}

function eventText(booking: CoffeeChatBookingForInvite): {
  title: string;
  description: string;
} {
  if (booking.audience === "exec") {
    return {
      title: `Coffee chat with ${booking.applicantName}`,
      description: `180DC UCSC recruitment coffee chat with ${booking.applicantName}.`,
    };
  }
  return {
    title: "180DC UCSC Coffee Chat",
    description: "Coffee chat with 180DC UCSC exec as part of recruitment.",
  };
}

function toUtcStamp(date: string, time: string): string {
  const utc = zonedDateTimeToUtc(date, time);
  return utc.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

export function buildGoogleCalendarUrl(booking: CoffeeChatBookingForInvite): string {
  const { title, description } = eventText(booking);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${toUtcStamp(booking.date, booking.startTime)}/${toUtcStamp(booking.date, booking.endTime)}`,
    details: description,
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
  const { title, description } = eventText(booking);
  const uidSuffix = booking.audience === "exec" ? "-exec" : "";
  return icsLines([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//180DC UCSC//Coffee Chat//EN",
    "BEGIN:VEVENT",
    `UID:${booking.manageToken}${uidSuffix}@180dcucsc.org`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${toUtcStamp(booking.date, booking.startTime)}`,
    `DTEND:${toUtcStamp(booking.date, booking.endTime)}`,
    `SUMMARY:${title}`,
    ...(booking.location.trim() !== "" ? [`LOCATION:${booking.location}`] : []),
    `DESCRIPTION:${description}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]);
}

/** One calendar file holding many exec-facing events, so they can be imported in a single step. */
export function buildIcsCalendar(bookings: (CoffeeChatBookingForInvite & { id: string })[]): string {
  const events = bookings.flatMap((b) => {
    const { title, description } = eventText({ ...b, audience: "exec" });
    return [
      "BEGIN:VEVENT",
      `UID:${b.id}-exec@180dcucsc.org`,
      `DTSTAMP:${toUtcStamp(b.date, b.startTime)}`,
      `DTSTART:${toUtcStamp(b.date, b.startTime)}`,
      `DTEND:${toUtcStamp(b.date, b.endTime)}`,
      `SUMMARY:${title}`,
      ...(b.location.trim() !== "" ? [`LOCATION:${b.location}`] : []),
      `DESCRIPTION:${description}`,
      "END:VEVENT",
    ];
  });
  return icsLines([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//180DC UCSC//Coffee Chat//EN",
    "X-WR-CALNAME:180DC Coffee Chats",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...events,
    "END:VCALENDAR",
    "",
  ]);
}
