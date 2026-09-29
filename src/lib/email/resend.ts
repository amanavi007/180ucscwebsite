import "server-only";
import { Resend } from "resend";

let client: Resend | null = null;

function getClient(): Resend {
  if (!client) client = new Resend(process.env.RESEND_API_KEY!);
  return client;
}

export async function sendEmail(params: { to: string; subject: string; html: string; text: string }): Promise<void> {
  const { error } = await getClient().emails.send({
    from: process.env.COFFEE_CHAT_FROM_EMAIL!,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });
  if (error) throw new Error(`Failed to send email: ${error.message}`);
}
