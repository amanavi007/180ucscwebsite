import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { chooseEmailProvider } from "./provider";
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
    from: `"180DC UCSC" <${process.env.GMAIL_USER!}>`,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });
}

export async function sendEmail(params: EmailParams): Promise<void> {
  if (chooseEmailProvider(process.env) === "gmail") return sendViaGmail(params);
  return sendViaResend(params);
}
