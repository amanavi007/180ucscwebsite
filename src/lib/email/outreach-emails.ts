import { escapeHtml, type EmailContent } from "./coffee-chat-confirmation";

const TEAM_SIGNATURE = "Best,\nThe 180 Degrees Consulting UCSC team";

export interface OutreachEmailInput {
  subject: string;
  bodyText: string;
  bookingUrl: string;
  unsubscribeUrl: string;
  senderName: string;
  postalAddress: string;
  /** The closing block, from "Best regards," down; lines may hold [label](https://link). Empty or missing signs as the team. */
  signature?: string;
  /** The services page; when set, a sentence about it goes into the body, just before the closing question. */
  servicesUrl?: string;
}

const LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

/** "[LinkedIn](https://x)" becomes "LinkedIn (https://x)" in plain text. */
const signatureText = (signature: string) => signature.replace(LINK, "$1 ($2)");

/** Escapes the signature and turns [label](https://link) into a link, so the email shows words and not long URLs. */
function signatureHtml(signature: string): string {
  return signature
    .split("\n")
    .map((line) => {
      // A blank line is a small gap, not a whole empty line.
      if (line.trim() === "") return '<div style="height:6px"></div>';
      let out = "";
      let last = 0;
      for (const m of line.matchAll(LINK)) {
        out += escapeHtml(line.slice(last, m.index)) + `<a href="${escapeHtml(m[2])}">${escapeHtml(m[1])}</a>`;
        last = m.index + m[0].length;
      }
      return `<div>${out + escapeHtml(line.slice(last))}</div>`;
    })
    .join("");
}

const SERVICES_MARKER = "[[services]]";
const SERVICES_MARKER_ESCAPED = escapeHtml(SERVICES_MARKER);
const servicesSentenceText = (url: string) => `You can see the areas we help with and how a quarter works on our services page: ${url}`;
const servicesSentenceHtml = (url: string) => `You can see the areas we help with and how a quarter works on <a href="${escapeHtml(url)}">our services page</a>.`;

/** Puts the services sentence in as its own paragraph just before the last one (the closing question); after the body if it is very short. */
function withServices(body: string, sentence: string | null): string {
  if (!sentence) return body;
  const parts = body.split(/\n{2,}/);
  if (parts.length < 3) return `${body}\n\n${sentence}`;
  return [...parts.slice(0, -1), sentence, parts[parts.length - 1]].join("\n\n");
}

const paragraphs = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("\n");

/** The booking link without its `?lead=` token, for the plain-text version, which cannot hide a long link behind words. */
const plainLink = (url: string) => url.split("?")[0];

const BAR = "\u23AF".repeat(17);
const SIGNATURE_FONT = "'Times New Roman', Times, serif";
/** Plain, personal-looking email: no images, no tracking, booking link, a signature set off by a bar, postal address and an unsubscribe link. */
export function buildOutreachEmail(input: OutreachEmailInput): EmailContent {
  const signature = input.signature?.trim() || TEAM_SIGNATURE;
  const text = [
    withServices(input.bodyText.trim(), input.servicesUrl ? servicesSentenceText(input.servicesUrl) : null),
    "",
    `Book a discovery call here: ${plainLink(input.bookingUrl)}`,
    "",
    BAR,
    signatureText(signature),
    "",
    `${input.senderName}, ${input.postalAddress}`,
    `Not interested? Unsubscribe here and we won't email you again: ${input.unsubscribeUrl}`,
  ].join("\n");

  const html = `<div>
    ${paragraphs(withServices(input.bodyText.trim(), input.servicesUrl ? SERVICES_MARKER : null)).replace(SERVICES_MARKER_ESCAPED, input.servicesUrl ? servicesSentenceHtml(input.servicesUrl) : "")}
    <p><a href="${escapeHtml(input.bookingUrl)}">Book a discovery call here</a></p>
    <div style="border-top:1px solid #999;width:260px;margin:22px 0 12px"></div>
    <div style="font-family:${SIGNATURE_FONT};font-size:14px;line-height:1.35">${signatureHtml(signature)}</div>
    <p style="color:#666;font-size:12px">${escapeHtml(input.senderName)}, ${escapeHtml(input.postalAddress)}<br>
    Not interested? <a href="${escapeHtml(input.unsubscribeUrl)}">Unsubscribe here</a> and we won't email you again.</p>
    </div>`.trim();

  return { subject: input.subject, text, html };
}

export interface ReplyForwardInput {
  company: string | null;
  contactName: string | null;
  fromEmail: string;
  classification: string;
  subject: string;
  /** Only what they wrote, without the quoted copy of our email. */
  text: string;
  portalUrl: string;
  /** True when the reply could not be matched to a prospect. */
  unmatched: boolean;
}

interface ReplyCopy {
  tag: string;
  headline: (who: string) => string;
  todo: (name: string) => string;
  did: string;
}

const ANSWER_IT = (name: string) =>
  `Hit Reply all to answer. Your answer goes to ${name} and the other execs see it. Say you've got it so two people don't answer.`;

const REPLY_COPY: Record<string, ReplyCopy> = {
  interested: { tag: "Interested", headline: (w) => `${w} replied and sounds interested.`, todo: ANSWER_IT, did: "Stopped all follow-up emails to them." },
  question: { tag: "Question", headline: (w) => `${w} replied with a question.`, todo: ANSWER_IT, did: "Stopped all follow-up emails to them." },
  other: { tag: "Replied", headline: (w) => `${w} replied.`, todo: ANSWER_IT, did: "Stopped all follow-up emails to them." },
  not_interested: {
    tag: "Not interested",
    headline: (w) => `${w} said they are not interested.`,
    todo: () => "Nothing to do. You can still reply to say thanks.",
    did: "Stopped follow-ups and added them to the do-not-contact list.",
  },
  later: {
    tag: "Not right now",
    headline: (w) => `${w} replied that the timing is not right.`,
    todo: (name) => `Reply all to thank ${name} and ask when to check back. Put a reminder in your calendar; the system will not email them again by itself.`,
    did: "Stopped all follow-up emails to them. They were not added to the do-not-contact list.",
  },
  unsubscribe: {
    tag: "Unsubscribed",
    headline: (w) => `${w} asked us to stop emailing them.`,
    todo: () => "Nothing to do. Please don't contact them again.",
    did: "Stopped follow-ups and added them to the do-not-contact list.",
  },
  auto_reply: {
    tag: "Auto-reply",
    headline: (w) => `${w} sent an automatic reply (out of office or similar).`,
    todo: () => "Nothing to do.",
    did: "Paused follow-ups for a day or more. They carry on after that.",
  },
};

/** One email per reply, written so an exec can triage it from the inbox list and act in one step. */
export function buildReplyForwardEmail(input: ReplyForwardInput): EmailContent {
  const copy = REPLY_COPY[input.classification] ?? REPLY_COPY.other;
  const name = input.contactName ?? input.fromEmail;
  const who = input.company ? `${name} at ${input.company}` : name;
  const subject = input.unmatched
    ? `[Unmatched] Reply from ${input.fromEmail}: ${input.subject}`
    : `[${copy.tag}] ${input.company ?? input.fromEmail}: ${name} replied`;
  const headline = input.unmatched ? `A reply from ${input.fromEmail} could not be matched to a prospect.` : copy.headline(who);
  const todo = input.unmatched
    ? "Reply all if it needs an answer, then check the portal in case they wrote from a different address than the one we emailed."
    : copy.todo(name);
  const did = input.unmatched ? "Nothing, because there was no matching prospect." : copy.did;

  const text = [
    headline,
    "",
    "THEIR MESSAGE",
    input.text,
    "",
    "WHAT TO DO",
    todo,
    "",
    "WHAT THE SYSTEM ALREADY DID",
    did,
    "",
    `Open the prospect in the portal: ${input.portalUrl}`,
  ].join("\n");

  const label = "font-size:12px;letter-spacing:.06em;color:#666;margin:20px 0 4px";
  const html = `
    <p style="font-size:16px;margin:0 0 8px"><strong>${escapeHtml(headline)}</strong></p>
    <p style="${label}">THEIR MESSAGE</p>
    <blockquote style="margin:0;padding:8px 14px;border-left:3px solid #ccc">${escapeHtml(input.text).replace(/\n/g, "<br>")}</blockquote>
    <p style="${label}">WHAT TO DO</p>
    <p style="margin:0">${escapeHtml(todo)}</p>
    <p style="${label}">WHAT THE SYSTEM ALREADY DID</p>
    <p style="margin:0">${escapeHtml(did)}</p>
    <p style="margin:20px 0 0"><a href="${escapeHtml(input.portalUrl)}">Open the prospect in the portal</a></p>
  `.trim();
  return { subject, text, html };
}

const BRAKE_COPY: Record<string, string> = {
  bounce_rate: "Too many emails bounced, so sending was paused to protect the sending domain.",
  complaint_rate: "Someone marked an email as spam, so sending was paused to protect the sending domain.",
  account_error: "Resend rejected the outreach account, so sending was paused.",
  booking_closed: "The intro-call booking page is closed, so sending is on hold.",
  paused: "Outreach is paused in Settings.",
  job_stale_discover: "The daily job that finds new companies has not run in over a day. Check the Vercel cron logs, and that CRON_SECRET is set.",
  job_stale_repair: "The daily job that retries companies discovery could not read has not run in over a day. Check the Vercel cron logs, and that CRON_SECRET is set.",
  job_stale_prepare: "The daily job that verifies prospects and writes drafts has not run in over a day. Check the Vercel cron logs, and that CRON_SECRET is set.",
  job_stale_send: "The daily job that schedules emails has not run in over a day. Check the Vercel cron logs, and that CRON_SECRET is set.",
  job_failed_discover: "The daily job that finds new companies crashed. Check the Vercel cron logs for outreach-discover, and that CRON_SECRET and the API keys are set.",
  job_failed_repair: "The daily job that retries companies discovery could not read crashed. Check the Vercel cron logs for outreach-repair.",
  job_failed_prepare: "The daily job that verifies prospects and writes drafts crashed. Check the Vercel cron logs for outreach-prepare, and the AI key.",
  job_failed_send: "The daily job that schedules emails crashed. Check the Vercel cron logs for outreach-send.",
  webhook_disabled: "Resend had switched off the webhook that brings replies and bounces into the portal. It has been turned back on automatically. Replies sent while it was off may not have been forwarded, so check the Resend dashboard (Webhooks) for failed events.",
  webhook_missing: "There is no Resend webhook for the portal, so replies, bounces and spam complaints are not reaching it. Add one in the Resend dashboard under Webhooks, pointing at the portal's /api/webhooks/resend address.",
};

export function buildBrakeAlertEmail(reason: string, portalUrl: string): EmailContent {
  const explanation = BRAKE_COPY[reason] ?? "Outreach stopped for a safety reason.";
  const text = `${explanation}\n\nOpen the portal: ${portalUrl}`;
  const html = `<p>${escapeHtml(explanation)}</p><p><a href="${escapeHtml(portalUrl)}">Open the portal</a></p>`;
  return { subject: reason.startsWith("webhook") ? "Outreach needs a look: reply webhook" : reason.startsWith("job_stale") || reason.startsWith("job_failed") ? "Outreach needs a look: a daily job stopped" : "Outreach sending paused", text, html };
}
