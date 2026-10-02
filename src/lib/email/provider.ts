export type EmailProvider = "resend" | "gmail";

/**
 * Providers to try, in order. `EMAIL_PROVIDER` pins a single provider when it
 * is a known value; otherwise Gmail goes first when a Gmail account is fully
 * configured (better inbox placement while the Resend domain is new), with
 * Resend as the fallback.
 */
export function emailProviderOrder(env: Record<string, string | undefined>): EmailProvider[] {
  if (env.EMAIL_PROVIDER === "resend" || env.EMAIL_PROVIDER === "gmail") return [env.EMAIL_PROVIDER];
  return env.GMAIL_USER && env.GMAIL_APP_PASSWORD ? ["gmail", "resend"] : ["resend"];
}

/** The "From" address for Resend. `COFFEE_CHAT_FROM_EMAIL` is the legacy name. */
export function resendFromAddress(env: Record<string, string | undefined>): string | undefined {
  return env.EMAIL_FROM || env.COFFEE_CHAT_FROM_EMAIL || undefined;
}
