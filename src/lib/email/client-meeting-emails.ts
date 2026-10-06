import { formatTime12h } from "../coffee-chat";
import { formatDateLong } from "../date";
import { buildClientMeetingGoogleCalendarUrl } from "../client-meeting-invite";
import { escapeHtml, type EmailContent } from "./coffee-chat-confirmation";

export interface When {
  date: string;
  startTime: string;
  endTime: string;
}

const dateLabel = (w: When) => formatDateLong(w.date);
const timeLabel = (w: When) =>
  `${formatTime12h(w.startTime)} to ${formatTime12h(w.endTime)}`;

function detailsList(w: When, meetingUrl: string | null): string {
  const link = meetingUrl
    ? `<a href="${escapeHtml(meetingUrl)}">${escapeHtml(meetingUrl)}</a>`
    : "We'll email you the link before the meeting.";
  return `
    <ul>
      <li><strong>Date:</strong> ${escapeHtml(dateLabel(w))}</li>
      <li><strong>Time:</strong> ${escapeHtml(timeLabel(w))}</li>
      <li><strong>Video link:</strong> ${link}</li>
    </ul>`;
}

function detailsText(w: When, meetingUrl: string | null): string[] {
  return [
    `Date: ${dateLabel(w)}`,
    `Time: ${timeLabel(w)}`,
    `Video link: ${meetingUrl ?? "We'll send you the video link before the meeting."}`,
  ];
}

const manageUrl = (siteUrl: string, token: string) =>
  `${siteUrl}/services/book/manage/${token}`;
const icsUrl = (siteUrl: string, token: string) =>
  `${siteUrl}/api/client-meeting/${token}/calendar.ics`;

export interface ClientMeetingConfirmationEmailInput extends When {
  contactName: string;
  businessName: string;
  manageToken: string;
  meetingUrl: string | null;
  siteUrl: string;
}

export function buildClientMeetingConfirmationEmail(
  input: ClientMeetingConfirmationEmailInput,
): EmailContent {
  const googleUrl = buildClientMeetingGoogleCalendarUrl({
    ...input,
    audience: "client",
  });
  const manage = manageUrl(input.siteUrl, input.manageToken);
  const ics = icsUrl(input.siteUrl, input.manageToken);
  const logoUrl = `${input.siteUrl}/email-logo.png`;

  const html = `
    <p>Hi ${escapeHtml(input.contactName)},</p>
    <p>Thanks for booking an intro call with 180DC UCSC for ${escapeHtml(input.businessName)}. You're confirmed:</p>
    ${detailsList(input, input.meetingUrl)}
    <p>
      Add it to your calendar:
      <a href="${escapeHtml(googleUrl)}">Google Calendar</a> ·
      <a href="${escapeHtml(ics)}">Apple / Outlook (.ics)</a>
    </p>
    <p>Need to cancel or pick a different time? <a href="${escapeHtml(manage)}">Manage your booking</a>. Changes close 12 hours before the meeting.</p>
    <p>We look forward to speaking with you!</p>
    <img src="${escapeHtml(logoUrl)}" alt="180 Degrees Consulting UC Santa Cruz" width="240" style="display:block;width:240px;max-width:100%;height:auto;margin:24px 0 0;" />
  `.trim();

  const text = [
    `Hi ${input.contactName},`,
    `Thanks for booking an intro call with 180DC UCSC for ${input.businessName}. You're confirmed:`,
    ...detailsText(input, input.meetingUrl),
    `Add to Google Calendar: ${googleUrl}`,
    `Add to Apple/Outlook: ${ics}`,
    `Manage your booking (changes close 12 hours before the meeting): ${manage}`,
    "We look forward to speaking with you!",
  ].join("\n");

  return {
    subject: "You're booked for an intro call with 180DC UCSC",
    html,
    text,
  };
}

export interface ClientMeetingLinkEmailInput extends When {
  contactName: string;
  meetingUrl: string;
  manageToken: string;
  siteUrl: string;
}

export function buildClientMeetingLinkEmail(
  input: ClientMeetingLinkEmailInput,
): EmailContent {
  const manage = manageUrl(input.siteUrl, input.manageToken);

  const html = `
    <p>Hi ${escapeHtml(input.contactName)},</p>
    <p>Here is the video link for your intro call with 180DC UCSC:</p>
    ${detailsList(input, input.meetingUrl)}
    <p>Need to make a change? <a href="${escapeHtml(manage)}">Manage your booking</a>. Changes close 12 hours before the meeting.</p>
  `.trim();

  const text = [
    `Hi ${input.contactName},`,
    "Here is the video link for your intro call with 180DC UCSC:",
    ...detailsText(input, input.meetingUrl),
    `Manage your booking (changes close 12 hours before the meeting): ${manage}`,
  ].join("\n");

  return { subject: "Your 180DC UCSC video link", html, text };
}

export interface ClientMeetingReminderEmailInput extends When {
  kind: "day_before" | "morning";
  contactName: string;
  manageToken: string;
  meetingUrl: string | null;
  siteUrl: string;
}

export function buildClientMeetingReminderEmail(
  input: ClientMeetingReminderEmailInput,
): EmailContent {
  const when = input.kind === "day_before" ? "tomorrow" : "today";
  const manage = manageUrl(input.siteUrl, input.manageToken);

  const html = `
    <p>Hi ${escapeHtml(input.contactName)},</p>
    <p>A reminder that your 180DC UCSC intro call is ${when}:</p>
    ${detailsList(input, input.meetingUrl)}
    <p>Need to make a change? <a href="${escapeHtml(manage)}">Manage your booking</a> (changes close 12 hours before the meeting, after that please contact us).</p>
    <p>See you soon!</p>
  `.trim();

  const text = [
    `Hi ${input.contactName},`,
    `A reminder that your 180DC UCSC intro call is ${when}:`,
    ...detailsText(input, input.meetingUrl),
    `Manage your booking (changes close 12 hours before the meeting; after that please contact us): ${manage}`,
  ].join("\n");

  return {
    subject: `Reminder: your 180DC UCSC intro call is ${when}`,
    html,
    text,
  };
}

export interface ClientMeetingCancelledEmailInput extends When {
  contactName: string;
  siteUrl: string;
  /** Who cancelled: an admin (default), or the client themselves, for whom this is a receipt. */
  cancelledBy?: "admin" | "client";
}

export function buildClientMeetingCancelledEmail(
  input: ClientMeetingCancelledEmailInput,
): EmailContent {
  const bookUrl = `${input.siteUrl}/services/book`;
  const byClient = input.cancelledBy === "client";
  const intro = byClient
    ? "You cancelled your 180DC UCSC intro call:"
    : "Your 180DC UCSC intro call has been cancelled:";
  const closing = byClient
    ? "If you change your mind, you can pick a new time, or contact us and we'll help."
    : "Please contact us if you'd like to rebook or have any questions.";

  const html = `
    <p>Hi ${escapeHtml(input.contactName)},</p>
    <p>${intro}</p>
    <ul>
      <li><strong>Date:</strong> ${escapeHtml(dateLabel(input))}</li>
      <li><strong>Time:</strong> ${escapeHtml(timeLabel(input))}</li>
    </ul>
    <p>${closing} You can also pick a new time at <a href="${escapeHtml(bookUrl)}">${escapeHtml(bookUrl)}</a>.</p>
  `.trim();

  const text = [
    `Hi ${input.contactName},`,
    intro,
    `Date: ${dateLabel(input)}`,
    `Time: ${timeLabel(input)}`,
    `${closing} You can also pick a new time at ${bookUrl}`,
  ].join("\n");

  return {
    subject: byClient
      ? "You cancelled your 180DC UCSC intro call"
      : "Your 180DC UCSC intro call was cancelled",
    html,
    text,
  };
}

export interface ClientMeetingExecEmailInput extends When {
  execName: string;
  contactName: string;
  businessName: string;
  email: string;
  phone: string | null;
  needs: string;
  meetingUrl: string | null;
  otherPanelNames: string[];
  siteUrl: string;
}

const panelLine = (names: string[]) =>
  names.length > 0 ? names.join(", ") : "none yet";

const portalLink = (siteUrl: string) =>
  `${siteUrl}/portal/admin/client-meetings?tab=bookings`;

function execDetailsList(i: ClientMeetingExecEmailInput): string {
  const link = i.meetingUrl
    ? `<a href="${escapeHtml(i.meetingUrl)}">${escapeHtml(i.meetingUrl)}</a>`
    : "not added yet";
  const phone = i.phone ? `, ${escapeHtml(i.phone)}` : "";
  return `
    <ul>
      <li><strong>Date:</strong> ${escapeHtml(dateLabel(i))}</li>
      <li><strong>Time:</strong> ${escapeHtml(timeLabel(i))}</li>
      <li><strong>Business:</strong> ${escapeHtml(i.businessName)}</li>
      <li><strong>Contact:</strong> ${escapeHtml(i.contactName)} (${escapeHtml(i.email)}${phone})</li>
      <li><strong>Needs:</strong> ${escapeHtml(i.needs)}</li>
      <li><strong>Video link:</strong> ${link}</li>
    </ul>`;
}

function execDetailsText(i: ClientMeetingExecEmailInput): string[] {
  const phone = i.phone ? `, ${i.phone}` : "";
  return [
    `Date: ${dateLabel(i)}`,
    `Time: ${timeLabel(i)}`,
    `Business: ${i.businessName}`,
    `Contact: ${i.contactName} (${i.email}${phone})`,
    `Needs: ${i.needs}`,
    `Video link: ${i.meetingUrl ?? "not added yet"}`,
  ];
}

export function buildClientMeetingExecBookedEmail(
  input: ClientMeetingExecEmailInput & { manageToken: string },
): EmailContent {
  const portalUrl = portalLink(input.siteUrl);
  const googleUrl = buildClientMeetingGoogleCalendarUrl({
    ...input,
    audience: "exec",
    panelNames: input.otherPanelNames,
  });
  const addLinkHtml = input.meetingUrl
    ? ""
    : "\n    <p>Please add the video link in the portal.</p>";

  const html = `
    <p>Hi ${escapeHtml(input.execName)},</p>
    <p>${escapeHtml(input.businessName)} booked an intro call with you:</p>
    ${execDetailsList(input)}
    <p><strong>Rest of the panel:</strong> ${escapeHtml(panelLine(input.otherPanelNames))}</p>${addLinkHtml}
    <p>
      Add it to your calendar: <a href="${escapeHtml(googleUrl)}">Google Calendar</a>. If you've subscribed to your portal calendar link, it appears there automatically.
    </p>
    <p><a href="${escapeHtml(portalUrl)}">View client meetings in the portal</a></p>
  `.trim();

  const text = [
    `Hi ${input.execName},`,
    `${input.businessName} booked an intro call with you:`,
    ...execDetailsText(input),
    `Rest of the panel: ${panelLine(input.otherPanelNames)}`,
    ...(input.meetingUrl ? [] : ["Please add the video link in the portal."]),
    `Add to Google Calendar: ${googleUrl}`,
    `View client meetings: ${portalUrl}`,
  ].join("\n");

  return {
    subject: `${input.businessName} booked an intro call`,
    html,
    text,
  };
}

export function buildClientMeetingExecCancelledEmail(
  input: ClientMeetingExecEmailInput,
): EmailContent {
  const portalUrl = portalLink(input.siteUrl);

  const html = `
    <p>Hi ${escapeHtml(input.execName)},</p>
    <p>${escapeHtml(input.businessName)} is no longer booked for this intro call:</p>
    ${execDetailsList(input)}
    <p><strong>Rest of the panel:</strong> ${escapeHtml(panelLine(input.otherPanelNames))}</p>
    <p>You can remove it from your calendar. <a href="${escapeHtml(portalUrl)}">View client meetings in the portal</a></p>
  `.trim();

  const text = [
    `Hi ${input.execName},`,
    `${input.businessName} is no longer booked for this intro call:`,
    ...execDetailsText(input),
    `Rest of the panel: ${panelLine(input.otherPanelNames)}`,
    "You can remove it from your calendar.",
    `View client meetings: ${portalUrl}`,
  ].join("\n");

  return {
    subject: `${input.businessName}'s intro call was cancelled`,
    html,
    text,
  };
}
