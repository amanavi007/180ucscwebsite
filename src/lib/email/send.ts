import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { emailProviderOrder, type EmailProvider } from "./provider";
import { sendEmail as sendViaResend } from "./resend";

interface EmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let gmailTransport: Transporter | null = null;

// Gmail SMTP with an app password: no domain needed, sends from the Google
// account itself (Gmail always sets the From address to that account).
async function sendViaGmail(params: EmailParams): Promise<void> {
  if (!gmailTransport) {
    gmailTransport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: process.env.GMAIL_USER!, pass: process.env.GMAIL_APP_PASSWORD! },
    });
  }
  await gmailTransport.sendMail({
    from: `"180 Degrees Consulting UCSC Bookings" <${process.env.GMAIL_USER!}>`,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });
}

const senders: Record<EmailProvider, (params: EmailParams) => Promise<void>> = {
  resend: sendViaResend,
  gmail: sendViaGmail,
};

// Tries each configured provider in order (Gmail first if set up, then Resend)
// and only throws once all of them have failed.
export async function sendEmail(params: EmailParams): Promise<void> {
  const errors: unknown[] = [];
  for (const provider of emailProviderOrder(process.env)) {
    try {
      return await senders[provider](params);
    } catch (err) {
      console.error(`email via ${provider} failed:`, err);
      errors.push(err);
    }
  }
  throw errors[0] instanceof Error ? errors[0] : new Error("Failed to send email");
}
