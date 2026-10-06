import { icsLines, toUtcStamp } from "./calendar-invite";
import { INTERVIEW_LOCATION } from "./interview";

export interface InterviewInviteInput {
  applicantName: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM"
  endTime: string;
  manageToken: string;
  /** Exec copies name the applicant and panel; the applicant's own copy stays generic. */
  audience?: "applicant" | "exec";
  /** The other panel members, shown on exec copies. */
  panelNames?: string[];
}

function eventText(input: InterviewInviteInput): { title: string; description: string } {
  if (input.audience === "exec") {
    const panel = input.panelNames && input.panelNames.length > 0 ? ` Panel: ${input.panelNames.join(", ")}.` : "";
    return {
      title: `Interview with ${input.applicantName}`,
      description: `180DC UCSC recruitment interview with ${input.applicantName} at ${INTERVIEW_LOCATION}.${panel}`,
    };
  }
  return {
    title: "180DC UCSC Interview",
    description: `Interview with 180DC UCSC exec as part of recruitment. Location: ${INTERVIEW_LOCATION}.`,
  };
}

/** RFC 5545 TEXT escaping so names with commas or semicolons can't break a line. */
function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export function buildInterviewGoogleCalendarUrl(input: InterviewInviteInput): string {
  const { title, description } = eventText(input);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${toUtcStamp(input.date, input.startTime)}/${toUtcStamp(input.date, input.endTime)}`,
    details: description,
    location: INTERVIEW_LOCATION,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function eventLines(input: InterviewInviteInput, uid: string): string[] {
  const { title, description } = eventText(input);
  return [
    "BEGIN:VEVENT",
    `UID:${uid}@180dcucsc.org`,
    `DTSTAMP:${toUtcStamp(input.date, input.startTime)}`,
    `DTSTART:${toUtcStamp(input.date, input.startTime)}`,
    `DTEND:${toUtcStamp(input.date, input.endTime)}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `LOCATION:${escapeIcsText(INTERVIEW_LOCATION)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    "END:VEVENT",
  ];
}

/** One-booking calendar file, for the applicant's "Apple / Outlook" download. */
export function buildInterviewIcs(input: InterviewInviteInput): string {
  const suffix = input.audience === "exec" ? "-exec" : "";
  return icsLines([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//180DC UCSC//Interview//EN",
    ...eventLines(input, `${input.manageToken}-interview${suffix}`),
    "END:VCALENDAR",
    "",
  ]);
}

/**
 * VEVENT lines for the exec calendar feed. The UID is stable per booking, so
 * calendar apps update the event in place and drop it once the booking is
 * cancelled and no longer in the feed.
 */
export function interviewEventLines(input: InterviewInviteInput & { id: string }): string[] {
  return eventLines({ ...input, audience: "exec" }, `${input.id}-interview-exec`);
}
