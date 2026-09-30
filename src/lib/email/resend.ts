import "server-only";
import { Resend } from "resend";
import { resendFromAddress } from "./provider";

let client: Resend | null = null;

function getClient(): Resend {
  if (!client) client = new Resend(process.env.RESEND_API_KEY!);
  return client;
}

export async function sendEmail(params: { to: string; subject: string; html: string; text: string }): Promise<void> {
  const from = resendFromAddress(process.env);
  if (!from) throw new Error("EMAIL_FROM is not set");
  const { error } = await getClient().emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });
  if (error) throw new Error(`Failed to send email: ${error.message}`);
}
