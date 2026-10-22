import { escapeHtml, type EmailContent } from "./coffee-chat-confirmation";

const SIGNATURE = "The 180 Degrees Consulting UCSC team";

export interface OutreachEmailInput {
  subject: string;
  bodyText: string;
  bookingUrl: string;
  unsubscribeUrl: string;
  senderName: string;
  postalAddress: string;
}

const paragraphs = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("\n");

/** Plain, personal-looking email: no images, no tracking, booking link, opt-out line and postal address. */
export function buildOutreachEmail(input: OutreachEmailInput): EmailContent {
  const text = [
    input.bodyText.trim(),
    "",
    `Pick a time that works for a 30-minute intro call: ${input.bookingUrl}`,
    "",
    "Best,",
    SIGNATURE,
    "",
    "--",
    `${input.senderName}, ${input.postalAddress}`,
    `Not interested? Unsubscribe here and we won't email you again: ${input.unsubscribeUrl}`,
  ].join("\n");

  const html = `
    ${paragraphs(input.bodyText)}
    <p>Pick a time that works for a 30-minute intro call: <a href="${escapeHtml(input.bookingUrl)}">${escapeHtml(input.bookingUrl)}</a></p>
    <p>Best,<br>${escapeHtml(SIGNATURE)}</p>
    <p style="color:#666;font-size:12px">${escapeHtml(input.senderName)}, ${escapeHtml(input.postalAddress)}<br>
    Not interested? <a href="${escapeHtml(input.unsubscribeUrl)}">Unsubscribe here</a> and we won't email you again: ${escapeHtml(input.unsubscribeUrl)}</p>
  `.trim();

  return { subject: input.subject, text, html };
}

export interface ReplyForwardInput {
  company: string | null;
  contactName: string | null;
  fromEmail: string;
  classification: string;
  subject: string;
  text: string;
  portalUrl: string;
  /** True when the reply could not be matched to a prospect. */
  unmatched: boolean;
}

export function buildReplyForwardEmail(input: ReplyForwardInput): EmailContent {
  const who = input.company ?? input.fromEmail;
  const header = input.unmatched
    ? `This reply from ${input.fromEmail} could not be matched to a prospect. Please check it by hand.`
    : `${input.contactName ?? input.fromEmail} (${input.company}) replied. It looks like: ${input.classification}.`;
  const text = [
    header,
    "",
    `Reply directly to this email to answer them (it goes to ${input.fromEmail}).`,
    `Open the prospect in the portal: ${input.portalUrl}`,
    "",
    "--- Their message ---",
    input.text,
  ].join("\n");
  const html = `
    <p>${escapeHtml(header)}</p>
    <p>Reply directly to this email to answer them (it goes to ${escapeHtml(input.fromEmail)}).<br>
    <a href="${escapeHtml(input.portalUrl)}">Open the prospect in the portal</a></p>
    <hr>
    <p>${escapeHtml(input.text).replace(/\n/g, "<br>")}</p>
  `.trim();
  return { subject: `Reply from ${who}: ${input.subject}`, text, html };
}

const BRAKE_COPY: Record<string, string> = {
  bounce_rate: "Too many emails bounced, so sending was paused to protect the sending domain.",
  complaint_rate: "Someone marked an email as spam, so sending was paused to protect the sending domain.",
  account_error: "Resend rejected the outreach account, so sending was paused.",
  booking_closed: "The intro-call booking page is closed, so sending is on hold.",
  paused: "Outreach is paused in Settings.",
};

export function buildBrakeAlertEmail(reason: string, portalUrl: string): EmailContent {
  const explanation = BRAKE_COPY[reason] ?? "Outreach stopped for a safety reason.";
  const text = `${explanation}\n\nReview it in the portal before turning sending back on: ${portalUrl}`;
  const html = `<p>${escapeHtml(explanation)}</p><p><a href="${escapeHtml(portalUrl)}">Review it in the portal</a> before turning sending back on.</p>`;
  return { subject: "Outreach sending paused", text, html };
}
