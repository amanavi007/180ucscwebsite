import { buildGoogleCalendarUrl } from "../calendar-invite";

export interface BookingConfirmationEmailInput {
  applicantName: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  manageToken: string;
  siteUrl: string;
}

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildBookingConfirmationEmail(input: BookingConfirmationEmailInput): EmailContent {
  const manageUrl = `${input.siteUrl}/apply/coffee-chat/manage/${input.manageToken}`;
  const icsUrl = `${input.siteUrl}/api/coffee-chat/${input.manageToken}/calendar.ics`;
  const googleUrl = buildGoogleCalendarUrl({
    applicantName: input.applicantName,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    location: input.location,
    manageToken: input.manageToken,
  });

  const subject = "You're booked -- 180DC UCSC Coffee Chat";

  // Applicant name and location are free text, so escape anything interpolated into HTML.
  const html = `
    <p>Hi ${escapeHtml(input.applicantName)},</p>
    <p>Your coffee chat with 180DC UCSC is confirmed:</p>
    <ul>
      <li><strong>Date:</strong> ${escapeHtml(input.date)}</li>
      <li><strong>Time:</strong> ${escapeHtml(input.startTime)}–${escapeHtml(input.endTime)}</li>
      <li><strong>Location:</strong> ${escapeHtml(input.location)}</li>
    </ul>
    <p>
      Add it to your calendar:
      <a href="${escapeHtml(googleUrl)}">Google Calendar</a> ·
      <a href="${escapeHtml(icsUrl)}">Apple / Outlook (.ics)</a>
    </p>
    <p>Need to cancel or pick a different time? <a href="${escapeHtml(manageUrl)}">Manage your booking</a>.</p>
    <p>See you soon!</p>
  `.trim();

  const text = [
    `Hi ${input.applicantName},`,
    `Your coffee chat with 180DC UCSC is confirmed:`,
    `Date: ${input.date}`,
    `Time: ${input.startTime}-${input.endTime}`,
    `Location: ${input.location}`,
    `Add to Google Calendar: ${googleUrl}`,
    `Add to Apple/Outlook: ${icsUrl}`,
    `Manage your booking (cancel or reschedule): ${manageUrl}`,
  ].join("\n");

  return { subject, html, text };
}
