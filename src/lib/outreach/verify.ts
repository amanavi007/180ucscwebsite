import { resolveMx } from "node:dns/promises";
import type { ProspectDraftRow } from "./types";

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "yopmail.com",
  "trashmail.com",
  "sharklasers.com",
  "getnada.com",
  "throwawaymail.com",
]);

const FREE_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
]);

const ROLE_LOCAL_PARTS = new Set([
  "info",
  "contact",
  "hello",
  "support",
  "admin",
  "sales",
  "team",
  "office",
  "help",
  "enquiries",
  "inquiries",
  "mail",
  "press",
  "jobs",
  "careers",
  "billing",
  "noreply",
  "no-reply",
]);

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailDomain(email: string): string {
  return normalizeEmail(email).split("@")[1] ?? "";
}

export function isFreeMailDomain(domain: string): boolean {
  return FREE_MAIL_DOMAINS.has(domain);
}

export function checkEmailSyntax(email: string): { ok: boolean; reason?: string } {
  const e = email.trim();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    return { ok: false, reason: "Not a valid email address." };
  }
  return { ok: true };
}

export function classifyEmail(email: string): { disposable: boolean; roleInbox: boolean; freeMail: boolean } {
  const e = normalizeEmail(email);
  const [local = "", domain = ""] = e.split("@");
  return {
    disposable: DISPOSABLE_DOMAINS.has(domain),
    roleInbox: ROLE_LOCAL_PARTS.has(local),
    freeMail: FREE_MAIL_DOMAINS.has(domain),
  };
}

/** True when the domain can receive mail. Any lookup failure counts as "cannot". */
export async function checkMx(
  domain: string,
  resolver: (d: string) => Promise<{ exchange: string }[]> = resolveMx,
): Promise<boolean> {
  try {
    const records = await resolver(domain);
    return records.length > 0;
  } catch {
    return false;
  }
}

/** Placeholder mailboxes (admin@, test@, root@ ...) that no person reads; the CSV import refuses them like the agent does. */
const JUNK_LOCAL = new Set(["admin", "superadmin", "root", "postmaster", "webmaster", "example", "demo", "test", "noreply", "no-reply", "donotreply", "mailer-daemon", "abuse"]);
function isJunkInbox(email: string): boolean {
  return JUNK_LOCAL.has(email.split("@")[0] ?? "");
}

export type SkipReason = "duplicate_email" | "duplicate_company" | "past_client" | "suppressed" | "invalid_email";

export interface ExistingProspectData {
  emails: Set<string>;
  companyDomains: Set<string>;
  /** Lower-cased names of past clients. */
  clientNames: Set<string>;
  suppressedEmails: Set<string>;
  suppressedDomains: Set<string>;
}

/** Splits parsed rows into those safe to import and those skipped, with why. Pure: writes nothing. */
export function partitionImport(
  rows: ProspectDraftRow[],
  existing: ExistingProspectData,
): { accept: ProspectDraftRow[]; skipped: { row: ProspectDraftRow; reason: SkipReason }[] } {
  const accept: ProspectDraftRow[] = [];
  const skipped: { row: ProspectDraftRow; reason: SkipReason }[] = [];
  for (const row of rows) {
    const email = normalizeEmail(row.contactEmail);
    const domain = emailDomain(email);
    let reason: SkipReason | null = null;
    if (!checkEmailSyntax(email).ok || isJunkInbox(email)) reason = "invalid_email";
    else if (existing.suppressedEmails.has(email) || existing.suppressedDomains.has(domain)) reason = "suppressed";
    else if (existing.emails.has(email)) reason = "duplicate_email";
    else if (existing.clientNames.has(row.company.trim().toLowerCase())) reason = "past_client";
    else if (!isFreeMailDomain(domain) && existing.companyDomains.has(domain)) reason = "duplicate_company";
    if (reason) skipped.push({ row, reason });
    else accept.push({ ...row, contactEmail: email });
  }
  return { accept, skipped };
}
