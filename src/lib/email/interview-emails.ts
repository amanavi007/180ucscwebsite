import { formatTime12h } from "../coffee-chat";
import { formatDateLong } from "../date";
import { INTERVIEW_LOCATION } from "../interview";
import { buildInterviewGoogleCalendarUrl } from "../interview-invite";
import { escapeHtml, type EmailContent } from "./coffee-chat-confirmation";

interface When {
  date: string;
  startTime: string;
  endTime: string;
}

const dateLabel = (w: When) => formatDateLong(w.date);
const timeLabel = (w: When) =>
  `${formatTime12h(w.startTime)} to ${formatTime12h(w.endTime)}`;

function detailsList(w: When): string {
  return `
    <ul>
      <li><strong>Date:</strong> ${escapeHtml(dateLabel(w))}</li>
      <li><strong>Time:</strong> ${escapeHtml(timeLabel(w))}</li>
      <li><strong>Location:</strong> ${escapeHtml(INTERVIEW_LOCATION)}</li>
    </ul>`;
}

function detailsText(w: When): string[] {
  return [
    `Date: ${dateLabel(w)}`,
    `Time: ${timeLabel(w)}`,
    `Location: ${INTERVIEW_LOCATION}`,
  ];
}

const manageUrl = (siteUrl: string, token: string) =>
  `${siteUrl}/apply/interview/manage/${token}`;
const icsUrl = (siteUrl: string, token: string) =>
  `${siteUrl}/api/interview/${token}/calendar.ics`;

export interface InterviewConfirmationEmailInput extends When {
  applicantName: string;
  manageToken: string;
  siteUrl: string;
}

export function buildInterviewConfirmationEmail(
  input: InterviewConfirmationEmailInput,
): EmailContent {
  const googleUrl = buildInterviewGoogleCalendarUrl(input);
  const manage = manageUrl(input.siteUrl, input.manageToken);
  const ics = icsUrl(input.siteUrl, input.manageToken);
  const logoUrl = `${input.siteUrl}/email-logo.png`;

  const html = `
    <p>Hi ${escapeHtml(input.applicantName)},</p>
    <p>Your interview with 180DC UCSC is confirmed:</p>
    ${detailsList(input)}
    <p>
      Add it to your calendar:
      <a href="${escapeHtml(googleUrl)}">Google Calendar</a> ·
      <a href="${escapeHtml(ics)}">Apple / Outlook (.ics)</a>
    </p>
    <p>Need to cancel or pick a different time? <a href="${escapeHtml(manage)}">Manage your booking</a>. You can change it up to 24 hours before.</p>
    <p>Good luck!</p>
    <img src="${escapeHtml(logoUrl)}" alt="180 Degrees Consulting UC Santa Cruz" width="240" style="display:block;width:240px;max-width:100%;height:auto;margin:24px 0 0;" />
  `.trim();

  const text = [
    `Hi ${input.applicantName},`,
    "Your interview with 180DC UCSC is confirmed:",
    ...detailsText(input),
    `Add to Google Calendar: ${googleUrl}`,
    `Add to Apple/Outlook: ${ics}`,
    `Manage your booking (cancel or reschedule up to 24 hours before): ${manage}`,
    "Good luck!",
  ].join("\n");

  return { subject: "You're booked for your 180DC UCSC interview", html, text };
}

export interface InterviewReminderEmailInput extends When {
  kind: "day_before" | "morning";
  applicantName: string;
  manageToken: string;
  siteUrl: string;
}

export function buildInterviewReminderEmail(
  input: InterviewReminderEmailInput,
): EmailContent {
  const when = input.kind === "day_before" ? "tomorrow" : "today";
  const manage = manageUrl(input.siteUrl, input.manageToken);

  const html = `
    <p>Hi ${escapeHtml(input.applicantName)},</p>
    <p>A reminder that your 180DC UCSC interview is ${when}:</p>
    ${detailsList(input)}
    <p>Need to make a change? <a href="${escapeHtml(manage)}">Manage your booking</a> (changes close 24 hours before the interview, after that please contact us).</p>
    <p>See you soon!</p>
  `.trim();

  const text = [
    `Hi ${input.applicantName},`,
    `A reminder that your 180DC UCSC interview is ${when}:`,
    ...detailsText(input),
    `Manage your booking (changes close 24 hours before; after that please contact us): ${manage}`,
  ].join("\n");

  return {
    subject: `Reminder: your 180DC UCSC interview is ${when}`,
    html,
    text,
  };
}

export interface InterviewAdminCancelledEmailInput extends When {
  applicantName: string;
  siteUrl: string;
  /** Who cancelled: an admin (default), or the applicant themselves, for whom this is a receipt. */
  cancelledBy?: "admin" | "applicant";
}

export function buildInterviewAdminCancelledEmail(
  input: InterviewAdminCancelledEmailInput,
): EmailContent {
  const bookUrl = `${input.siteUrl}/apply/interview`;
  const byApplicant = input.cancelledBy === "applicant";
  const intro = byApplicant
    ? "You cancelled your 180DC UCSC interview:"
    : "Your 180DC UCSC interview has been cancelled:";
  const closing = byApplicant
    ? "If you change your mind, you can pick a new time when booking is open, or contact us and we'll help."
    : "Please contact us if you'd like to rebook or have any questions.";

  const html = `
    <p>Hi ${escapeHtml(input.applicantName)},</p>
    <p>${intro}</p>
    ${detailsList(input)}
    <p>${closing} If booking is open you can also pick a new time at <a href="${escapeHtml(bookUrl)}">${escapeHtml(bookUrl)}</a>.</p>
  `.trim();

  const text = [
    `Hi ${input.applicantName},`,
    intro,
    ...detailsText(input),
    `${closing} If booking is open you can also pick a new time at ${bookUrl}`,
  ].join("\n");

  return {
    subject: byApplicant
      ? "You cancelled your 180DC UCSC interview"
      : "Your 180DC UCSC interview was cancelled",
    html,
    text,
  };
}

export interface InterviewExecEmailInput extends When {
  execName: string;
  applicantName: string;
  applicantEmail: string;
  otherPanelNames: string[];
  siteUrl: string;
}

const panelLine = (names: string[]) =>
  names.length > 0 ? names.join(", ") : "none yet";

export function buildInterviewExecBookedEmail(
  input: InterviewExecEmailInput & { manageToken: string },
): EmailContent {
  const portalUrl = `${input.siteUrl}/portal/admin/interviews?tab=schedule`;
  const googleUrl = buildInterviewGoogleCalendarUrl({
    ...input,
    audience: "exec",
    panelNames: input.otherPanelNames,
  });

  const html = `
    <p>Hi ${escapeHtml(input.execName)},</p>
    <p>${escapeHtml(input.applicantName)} (${escapeHtml(input.applicantEmail)}) booked an interview with you:</p>
    ${detailsList(input)}
    <p><strong>Rest of the panel:</strong> ${escapeHtml(panelLine(input.otherPanelNames))}</p>
    <p>
      Add it to your calendar: <a href="${escapeHtml(googleUrl)}">Google Calendar</a>. If you've subscribed to your portal calendar link, it appears there automatically.
    </p>
    <p><a href="${escapeHtml(portalUrl)}">View interviews in the portal</a></p>
  `.trim();

  const text = [
    `Hi ${input.execName},`,
    `${input.applicantName} (${input.applicantEmail}) booked an interview with you:`,
    ...detailsText(input),
    `Rest of the panel: ${panelLine(input.otherPanelNames)}`,
    `Add to Google Calendar: ${googleUrl}`,
    `View interviews: ${portalUrl}`,
  ].join("\n");

  return {
    subject: `${input.applicantName} booked an interview with you`,
    html,
    text,
  };
}

export function buildInterviewExecCancelledEmail(
  input: InterviewExecEmailInput,
): EmailContent {
  const portalUrl = `${input.siteUrl}/portal/admin/interviews?tab=schedule`;

  const html = `
    <p>Hi ${escapeHtml(input.execName)},</p>
    <p>${escapeHtml(input.applicantName)} (${escapeHtml(input.applicantEmail)}) is no longer booked for this interview:</p>
    ${detailsList(input)}
    <p><strong>Rest of the panel:</strong> ${escapeHtml(panelLine(input.otherPanelNames))}</p>
    <p>You can remove it from your calendar. <a href="${escapeHtml(portalUrl)}">View interviews in the portal</a></p>
  `.trim();

  const text = [
    `Hi ${input.execName},`,
    `${input.applicantName} (${input.applicantEmail}) is no longer booked for this interview:`,
    ...detailsText(input),
    `Rest of the panel: ${panelLine(input.otherPanelNames)}`,
    "You can remove it from your calendar.",
    `View interviews: ${portalUrl}`,
  ].join("\n");

  return {
    subject: `${input.applicantName}'s interview was cancelled`,
    html,
    text,
  };
}
