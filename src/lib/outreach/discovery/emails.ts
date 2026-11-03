const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const ASSET_EXTENSION = /\.(png|jpe?g|gif|svg|webp|avif|ico|css|js|woff2?|ttf|pdf)$/;

/** Emails on the company's own domain (or a subdomain of it) found in a page. */
export function extractCompanyEmails(html: string, host: string): string[] {
  const readable = html.replace(/&#0*64;|&#x0*40;|&commat;|\s?\[at\]\s?|\s?\(at\)\s?/gi, "@");
  const own = host.toLowerCase().replace(/^www\./, "");
  const found = new Set<string>();
  for (const match of readable.match(EMAIL) ?? []) {
    const email = match.toLowerCase().replace(/\.+$/, "");
    if (ASSET_EXTENSION.test(email)) continue;
    const domain = email.split("@")[1];
    if (domain === own || domain.endsWith(`.${own}`)) found.add(email);
  }
  return [...found];
}

const ONE_ADDRESS = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

/** Cleans up an address typed or pasted by a person ("Jo <jo@x.com>", "mailto:jo@x.com") or says what is wrong with it. */
export function normalizeManualEmail(input: string): { email: string } | { error: string } {
  const bracketed = /<([^>]+)>/.exec(input)?.[1];
  const email = (bracketed ?? input).trim().replace(/^mailto:/i, "").toLowerCase();
  return ONE_ADDRESS.test(email) ? { email } : { error: "That doesn't look like one email address." };
}

/** Inboxes that are not for a business conversation, so we never write to them. */
export const NOT_FOR_BUSINESS = new Set([
  "careers", "career", "jobs", "job", "hiring", "recruiting", "recruiter", "hr", "people", "talent",
  "security", "abuse", "privacy", "legal", "compliance", "dmca", "billing", "accounts", "invoices", "payments",
  "support", "help", "helpdesk", "customerservice", "service", "sales", "press", "media", "pr", "partners",
  "quotes", "quote", "orders", "order", "bookings", "reservations", "feedback", "marketing", "newsletter", "subscribe",
  "cancel", "questions", "question", "cancellation", "cancellations", "refund", "refunds", "returns", "complaints", "investors", "investor", "ir", "dpo", "gdpr", "trust", "notifications", "alerts",
  "noreply", "no-reply", "donotreply", "do-not-reply", "mailer-daemon", "postmaster", "webmaster", "unsubscribe", "bounce", "bounces",
]);

/** Whether an address is one we may write to: not a role inbox like sales@ or careers@. A named person, founders@, hello@, contact@ and info@ all pass. */
export function isBusinessInbox(email: string): boolean {
  const local = email.trim().toLowerCase().split("@")[0] ?? "";
  return local.length > 0 && local.length <= 30 && !NOT_FOR_BUSINESS.has(local) && !NOT_FOR_BUSINESS.has(local.split(/[._+-]/)[0]);
}

/** Generic inboxes, best first. Anything not listed here is treated as a named person's inbox. */
const GENERIC_ORDER = ["founders", "founder", "hello", "hey", "hi", "contact", "team", "info", "general", "office", "mail", "admin", "inquiries", "enquiries"];

/** The one address worth writing to: a named inbox, else the friendliest generic one; null when only role inboxes exist. */
export function pickBestEmail(emails: string[]): string | null {
  const usable = emails.filter(isBusinessInbox);
  const rank = (email: string) => {
    const index = GENERIC_ORDER.indexOf(email.split("@")[0]);
    return index === -1 ? -1 : index;
  };
  const sorted = [...usable].sort((a, b) => rank(a) - rank(b));
  return sorted[0] ?? null;
}
