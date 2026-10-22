import "server-only";
import { Resend } from "resend";
import { OutreachAccountError } from "@/lib/outreach/errors";

let client: Resend | null = null;

// Outreach has its own API key so a problem with it cannot take down booking confirmations.
function getClient(): Resend {
  const key = process.env.OUTREACH_RESEND_API_KEY;
  if (!key) throw new OutreachAccountError("OUTREACH_RESEND_API_KEY is not set");
  if (!client) client = new Resend(key);
  return client;
}

const ACCOUNT_LEVEL_ERRORS = new Set([
  "missing_api_key",
  "invalid_api_key",
  "restricted_api_key",
  "daily_quota_exceeded",
  "monthly_quota_exceeded",
  "security_error",
]);

export interface OutreachSendInput {
  to: string[];
  from: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
  /** Resend holds the email and sends it then; omit to send now. */
  scheduledAt?: Date;
}

export async function sendOutreachEmail(input: OutreachSendInput): Promise<{ resendId: string }> {
  const { data, error } = await getClient().emails.send({
    from: input.from,
    to: input.to,
    replyTo: input.replyTo,
    subject: input.subject,
    text: input.text,
    html: input.html,
    headers: input.headers,
    scheduledAt: input.scheduledAt?.toISOString(),
  });
  if (error) {
    const accountLevel = ACCOUNT_LEVEL_ERRORS.has(error.name) || /domain is not verified|suspended/i.test(error.message);
    if (accountLevel) throw new OutreachAccountError(error.message);
    throw new Error(error.message);
  }
  return { resendId: data!.id };
}

/** Stops a scheduled email before it goes out. Best effort: it may already have been sent. */
export async function cancelScheduledOutreachEmail(resendId: string): Promise<void> {
  const { error } = await getClient().emails.cancel(resendId);
  if (error) console.error("cancel scheduled outreach email failed:", error.message);
}
