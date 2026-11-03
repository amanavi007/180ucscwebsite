import { classifyReply, extractEmail, stripQuotedReply, type ReplyClass } from "./replies";

export interface WebhookEvent {
  type: string;
  data: Record<string, unknown>;
}

export interface MatchedProspect {
  id: string;
  company: string;
  contactName: string | null;
}

export interface ForwardArgs {
  company: string | null;
  contactName: string | null;
  fromEmail: string;
  classification: ReplyClass;
  subject: string;
  text: string;
  prospectId: string | null;
  unmatched: boolean;
}

export interface WebhookDeps {
  repliesAddress: string;
  unsubscribeAddress: string;
  /** Throws when the signature is invalid. */
  verify(rawBody: string, headers: Headers): WebhookEvent;
  findMessageByResendId(resendId: string): Promise<{ messageId: string; prospectId: string } | null>;
  fetchReceived(emailId: string): Promise<{ from: string; subject: string; text: string; headers: Record<string, string> | null }>;
  /** True once this inbound email has been saved AND forwarded to the execs. */
  hasForwardedReply(emailId: string): Promise<boolean>;
  matchProspect(fromEmail: string): Promise<MatchedProspect | null>;
  saveReply(reply: { resendEmailId: string; prospectId: string | null; fromEmail: string; subject: string; snippet: string; classification: ReplyClass }): Promise<void>;
  markReplied(prospectId: string): Promise<void>;
  unsubscribe(prospectId: string, reason: string): Promise<void>;
  pauseSequence(prospectId: string): Promise<void>;
  forward(args: ForwardArgs): Promise<void>;
  markForwarded(emailId: string): Promise<void>;
  markBounced(args: { prospectId: string; messageId: string; email: string; reason: string }): Promise<void>;
  markComplained(args: { prospectId: string; messageId: string; email: string }): Promise<void>;
  recordDelivered(args: { prospectId: string; messageId: string }): Promise<void>;
  /** Re-checks bounce and complaint rates and pauses sending if they are too high. */
  checkBrakes(): Promise<void>;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

async function handleReceived(data: Record<string, unknown>, deps: WebhookDeps) {
  const to = strList(data.to).map((a) => extractEmail(a));
  const isReplies = to.includes(deps.repliesAddress.toLowerCase());
  const isUnsubscribe = to.includes(deps.unsubscribeAddress.toLowerCase());
  if (!isReplies && !isUnsubscribe) return;

  const emailId = str(data.email_id);
  if (!emailId || (await deps.hasForwardedReply(emailId))) return;

  const mail = await deps.fetchReceived(emailId);
  const fromEmail = extractEmail(mail.from);
  const classification: ReplyClass = isUnsubscribe ? "unsubscribe" : classifyReply({ subject: mail.subject, text: mail.text, headers: mail.headers });
  const prospect = await deps.matchProspect(fromEmail);
  // What they wrote, without our own email quoted underneath it.
  const message = stripQuotedReply(mail.text) || mail.text;

  await deps.saveReply({
    resendEmailId: emailId,
    prospectId: prospect?.id ?? null,
    fromEmail,
    subject: mail.subject,
    snippet: message.slice(0, 500),
    classification,
  });

  if (prospect) {
    if (classification === "unsubscribe" || classification === "not_interested") {
      await deps.unsubscribe(prospect.id, classification === "unsubscribe" ? "Asked to be removed." : "Replied that they are not interested.");
    } else if (classification === "auto_reply") {
      await deps.pauseSequence(prospect.id);
    } else {
      await deps.markReplied(prospect.id);
    }
  }

  await deps.forward({
    company: prospect?.company ?? null,
    contactName: prospect?.contactName ?? null,
    fromEmail,
    classification,
    subject: mail.subject,
    text: message,
    prospectId: prospect?.id ?? null,
    unmatched: !prospect,
  });
  await deps.markForwarded(emailId);
}

async function handleDelivery(event: WebhookEvent, deps: WebhookDeps) {
  const resendId = str(event.data.email_id);
  const found = resendId ? await deps.findMessageByResendId(resendId) : null;
  // Not an outreach email (booking confirmations and reminders share the Resend account): nothing to do.
  if (!found) return;
  const email = strList(event.data.to)[0] ?? "";

  if (event.type === "email.delivered") {
    await deps.recordDelivered(found);
  } else if (event.type === "email.bounced") {
    const bounce = (event.data.bounce ?? {}) as { type?: string; message?: string };
    if (bounce.type === "Transient") return;
    await deps.markBounced({ ...found, email, reason: bounce.message ?? "Bounced." });
    await deps.checkBrakes();
  } else if (event.type === "email.complained") {
    await deps.markComplained({ ...found, email });
    await deps.checkBrakes();
  }
}

/** Receives Resend's webhooks: inbound replies, bounces, complaints and deliveries. */
export async function handleResendWebhook(request: Request, deps: WebhookDeps): Promise<Response> {
  const raw = await request.text();
  let event: WebhookEvent;
  try {
    event = deps.verify(raw, request.headers);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  try {
    if (event.type === "email.received") await handleReceived(event.data, deps);
    else if (["email.delivered", "email.bounced", "email.complained"].includes(event.type)) await handleDelivery(event, deps);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("resend webhook failed:", err);
    // A 5xx makes Resend retry; every step above is safe to repeat.
    return new Response("Failed", { status: 500 });
  }
}
