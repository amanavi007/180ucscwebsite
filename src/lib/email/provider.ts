export type EmailProvider = "resend" | "gmail";

/**
 * Which service sends the emails. `EMAIL_PROVIDER` wins when it is a known
 * value; otherwise Gmail is used if a Gmail address is configured, else Resend.
 */
export function chooseEmailProvider(env: Record<string, string | undefined>): EmailProvider {
  if (env.EMAIL_PROVIDER === "resend" || env.EMAIL_PROVIDER === "gmail") return env.EMAIL_PROVIDER;
  return env.GMAIL_USER ? "gmail" : "resend";
}
