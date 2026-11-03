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

/** Inboxes that are not for a business conversation, so we never write to them. */
const NOT_FOR_BUSINESS = new Set([
  "careers", "career", "jobs", "job", "hiring", "recruiting", "recruiter", "hr", "people", "talent",
  "security", "abuse", "privacy", "legal", "compliance", "dmca", "billing", "accounts", "invoices", "payments",
  "support", "help", "helpdesk", "customerservice", "service", "sales", "press", "media", "pr", "partners",
  "quotes", "quote", "orders", "order", "bookings", "reservations", "feedback", "marketing", "newsletter", "subscribe",
  "noreply", "no-reply", "donotreply", "do-not-reply", "mailer-daemon", "postmaster", "webmaster", "unsubscribe", "bounce", "bounces",
]);

/** Generic inboxes, best first. Anything not listed here is treated as a named person's inbox. */
const GENERIC_ORDER = ["founders", "founder", "hello", "hey", "hi", "contact", "team", "info", "general", "office", "mail", "admin", "inquiries", "enquiries"];

const firstToken = (local: string) => local.split(/[._+-]/)[0];

/** The one address worth writing to: a named inbox, else the friendliest generic one; null when only role inboxes exist. */
export function pickBestEmail(emails: string[]): string | null {
  const usable = emails.filter((email) => {
    const local = email.split("@")[0];
    return local.length <= 30 && !NOT_FOR_BUSINESS.has(local) && !NOT_FOR_BUSINESS.has(firstToken(local));
  });
  const rank = (email: string) => {
    const index = GENERIC_ORDER.indexOf(email.split("@")[0]);
    return index === -1 ? -1 : index;
  };
  const sorted = [...usable].sort((a, b) => rank(a) - rank(b));
  return sorted[0] ?? null;
}
