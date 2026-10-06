import { icsLines, toUtcStamp } from "./calendar-invite";
import { escapeIcsText } from "./interview-invite";

export interface ClientMeetingInviteInput {
  businessName: string;
  contactName: string;
  needs?: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM"
  endTime: string;
  manageToken: string;
  meetingUrl: string | null;
  /** Exec copies name the business, contact, needs and panel; the client's own copy stays generic. */
  audience?: "client" | "exec";
  /** The other panel members, shown on exec copies. */
  panelNames?: string[];
}

const LINK_PENDING = "Link to follow";

function eventText(input: ClientMeetingInviteInput): { title: string; description: string; location: string } {
  const location = input.meetingUrl ?? LINK_PENDING;
  if (input.audience === "exec") {
    const panel = input.panelNames && input.panelNames.length > 0 ? `\nPanel: ${input.panelNames.join(", ")}.` : "";
    return {
      title: `Client meeting: ${input.businessName}`,
      description:
        `180DC UCSC intro call with ${input.contactName} (${input.businessName}). Video link: ${location}.` +
        (input.needs ? `\nNeeds: ${input.needs}` : "") +
        panel,
      location,
    };
  }
  return {
    title: "180DC UCSC Intro Call",
    description: `Intro call with 180DC UCSC. Video link: ${location}.`,
    location,
  };
}

export function buildClientMeetingGoogleCalendarUrl(input: ClientMeetingInviteInput): string {
  const { title, description, location } = eventText(input);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${toUtcStamp(input.date, input.startTime)}/${toUtcStamp(input.date, input.endTime)}`,
    details: description,
    location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function eventLines(input: ClientMeetingInviteInput, uid: string): string[] {
  const { title, description, location } = eventText(input);
  return [
    "BEGIN:VEVENT",
    `UID:${uid}@180dcucsc.org`,
    `DTSTAMP:${toUtcStamp(input.date, input.startTime)}`,
    `DTSTART:${toUtcStamp(input.date, input.startTime)}`,
    `DTEND:${toUtcStamp(input.date, input.endTime)}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    "END:VEVENT",
  ];
}

/** One-booking calendar file, for the client's "Apple / Outlook" download. */
export function buildClientMeetingIcs(input: ClientMeetingInviteInput): string {
  const suffix = input.audience === "exec" ? "-exec" : "";
  return icsLines([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//180DC UCSC//Client Meeting//EN",
    ...eventLines(input, `${input.manageToken}-client-meeting${suffix}`),
    "END:VCALENDAR",
    "",
  ]);
}

/** VEVENT lines for the exec feed; the UID is stable per booking so apps update or drop the event. */
export function clientMeetingEventLines(input: ClientMeetingInviteInput & { id: string }): string[] {
  return eventLines({ ...input, audience: "exec" }, `${input.id}-client-meeting-exec`);
}
