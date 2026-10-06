import { buildGoogleCalendarUrl } from "../calendar-invite";
import { formatTime12h } from "../coffee-chat";
import { formatDateLong } from "../date";

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

export function escapeHtml(value: string): string {
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

  const subject = "You're booked for your 180DC UCSC Coffee Chat";

  const dateLabel = formatDateLong(input.date);
  const timeLabel = `${formatTime12h(input.startTime)} to ${formatTime12h(input.endTime)}`;
  const hasLocation = input.location.trim() !== "";

  // Applicant name and location are free text, so escape anything interpolated into HTML.
  const logoUrl = `${input.siteUrl}/email-logo.png`;
  const html = `
    <p>Hi ${escapeHtml(input.applicantName)},</p>
    <p>Your coffee chat with 180DC UCSC is confirmed:</p>
    <ul>
      <li><strong>Date:</strong> ${escapeHtml(dateLabel)}</li>
      <li><strong>Time:</strong> ${escapeHtml(timeLabel)}</li>
      ${hasLocation ? `<li><strong>Location:</strong> ${escapeHtml(input.location)}</li>` : ""}
    </ul>
    <p>
      Add it to your calendar:
      <a href="${escapeHtml(googleUrl)}">Google Calendar</a> ·
      <a href="${escapeHtml(icsUrl)}">Apple / Outlook (.ics)</a>
    </p>
    <p>Need to cancel or pick a different time? <a href="${escapeHtml(manageUrl)}">Manage your booking</a>.</p>
    <p>See you soon!</p>
    <img src="${escapeHtml(logoUrl)}" alt="180 Degrees Consulting UC Santa Cruz" width="240" style="display:block;width:240px;max-width:100%;height:auto;margin:24px 0 0;" />
  `.trim();

  const text = [
    `Hi ${input.applicantName},`,
    `Your coffee chat with 180DC UCSC is confirmed:`,
    `Date: ${dateLabel}`,
    `Time: ${timeLabel}`,
    ...(hasLocation ? [`Location: ${input.location}`] : []),
    `Add to Google Calendar: ${googleUrl}`,
    `Add to Apple/Outlook: ${icsUrl}`,
    `Manage your booking (cancel or reschedule): ${manageUrl}`,
  ].join("\n");

  return { subject, html, text };
}

export interface ExecBookingNotificationInput {
  execName: string;
  applicantName: string;
  applicantEmail: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  manageToken: string;
  siteUrl: string;
}

export function buildExecBookingNotificationEmail(input: ExecBookingNotificationInput): EmailContent {
  const subject = `${input.applicantName} booked a coffee chat with you`;
  const dateLabel = formatDateLong(input.date);
  const timeLabel = `${formatTime12h(input.startTime)} to ${formatTime12h(input.endTime)}`;
  const hasLocation = input.location.trim() !== "";
  const portalUrl = `${input.siteUrl}/portal/admin/coffee-chats`;
  const icsUrl = `${input.siteUrl}/api/coffee-chat/${input.manageToken}/calendar.ics?for=exec`;
  const googleUrl = buildGoogleCalendarUrl({
    applicantName: input.applicantName,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    location: input.location,
    manageToken: input.manageToken,
    audience: "exec",
  });

  const html = `
    <p>Hi ${escapeHtml(input.execName)},</p>
    <p>${escapeHtml(input.applicantName)} (${escapeHtml(input.applicantEmail)}) booked a coffee chat with you:</p>
    <ul>
      <li><strong>Date:</strong> ${escapeHtml(dateLabel)}</li>
      <li><strong>Time:</strong> ${escapeHtml(timeLabel)}</li>
      ${hasLocation ? `<li><strong>Location:</strong> ${escapeHtml(input.location)}</li>` : ""}
    </ul>
    <p>
      Add it to your calendar:
      <a href="${escapeHtml(googleUrl)}">Google Calendar</a> ·
      <a href="${escapeHtml(icsUrl)}">Apple / Outlook (.ics)</a>
    </p>
    <p><a href="${escapeHtml(portalUrl)}">View coffee chats in the portal</a></p>
  `.trim();

  const text = [
    `Hi ${input.execName},`,
    `${input.applicantName} (${input.applicantEmail}) booked a coffee chat with you:`,
    `Date: ${dateLabel}`,
    `Time: ${timeLabel}`,
    ...(hasLocation ? [`Location: ${input.location}`] : []),
    `Add to Google Calendar: ${googleUrl}`,
    `Add to Apple/Outlook: ${icsUrl}`,
    `View coffee chats: ${portalUrl}`,
  ].join("\n");

  return { subject, html, text };
}

export type ExecBookingCancelledEmailInput = Omit<ExecBookingNotificationInput, "manageToken">;

export function buildExecBookingCancelledEmail(input: ExecBookingCancelledEmailInput): EmailContent {
  const subject = `${input.applicantName} cancelled their coffee chat`;
  const dateLabel = formatDateLong(input.date);
  const timeLabel = `${formatTime12h(input.startTime)} to ${formatTime12h(input.endTime)}`;
  const portalUrl = `${input.siteUrl}/portal/admin/coffee-chats`;

  const html = `
    <p>Hi ${escapeHtml(input.execName)},</p>
    <p>${escapeHtml(input.applicantName)} (${escapeHtml(input.applicantEmail)}) cancelled their coffee chat with you:</p>
    <ul>
      <li><strong>Date:</strong> ${escapeHtml(dateLabel)}</li>
      <li><strong>Time:</strong> ${escapeHtml(timeLabel)}</li>
    </ul>
    <p>You can remove it from your calendar. The slot is open for booking again. <a href="${escapeHtml(portalUrl)}">View coffee chats in the portal</a></p>
  `.trim();

  const text = [
    `Hi ${input.execName},`,
    `${input.applicantName} (${input.applicantEmail}) cancelled their coffee chat with you:`,
    `Date: ${dateLabel}`,
    `Time: ${timeLabel}`,
    `You can remove it from your calendar. The slot is open for booking again.`,
    `View coffee chats: ${portalUrl}`,
  ].join("\n");

  return { subject, html, text };
}
