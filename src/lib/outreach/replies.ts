import { isFreeMailDomain } from "./verify";

export type ReplyClass = "auto_reply" | "unsubscribe" | "not_interested" | "interested" | "question" | "other";

/** "Jo Lee <Jo@Acme.com>" -> "jo@acme.com" */
export function extractEmail(from: string): string {
  const angle = /<([^>]+)>/.exec(from);
  return (angle ? angle[1] : from).trim().toLowerCase();
}

const AUTO_SUBJECT = /^(automatic reply|auto[- ]?reply|autoreply)\b|out of (the )?office/i;
const UNSUBSCRIBE = /\b(unsubscribe|remove me|take me off|stop (emailing|contacting|sending|messaging)|do not (contact|email)|don'?t (contact|email))\b/i;
const NOT_INTERESTED = /\b(not interested|no thanks|no thank you|not a (good )?fit|not looking|pass on this|we'?ll pass)\b/i;
const INTERESTED =
  /interest(ed|ing)|sounds (good|great)|let'?s (talk|chat|set up|schedule|connect)|happy to (chat|talk|meet|connect)|can we (talk|chat|meet|set up|schedule)|would love to/i;

function hasAutoHeaders(headers: Record<string, string> | null): boolean {
  if (!headers) return false;
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v.toLowerCase().trim()]));
  if (h["auto-submitted"] && h["auto-submitted"] !== "no") return true;
  if (h["x-autoreply"] !== undefined || h["x-autorespond"] !== undefined) return true;
  return ["auto_reply", "auto-reply", "bulk", "junk"].includes(h["precedence"] ?? "");
}

/** A first guess at what a reply is. Humans still read every one; this decides what happens to the sequence. */
export function classifyReply(args: { subject: string; text: string; headers: Record<string, string> | null }): ReplyClass {
  if (hasAutoHeaders(args.headers) || AUTO_SUBJECT.test(args.subject.trim())) return "auto_reply";
  if (UNSUBSCRIBE.test(args.text)) return "unsubscribe";
  if (NOT_INTERESTED.test(args.text)) return "not_interested";
  if (INTERESTED.test(args.text)) return "interested";
  if (args.text.includes("?")) return "question";
  return "other";
}

/** The prospect a reply belongs to: the exact address first, then a colleague at the same company domain. */
export function matchReplyToProspect(args: {
  fromEmail: string;
  prospectsByEmail: Map<string, string>;
  prospectsByDomain: Map<string, string>;
}): string | null {
  const email = extractEmail(args.fromEmail);
  const exact = args.prospectsByEmail.get(email);
  if (exact) return exact;
  const domain = email.split("@")[1] ?? "";
  if (!domain || isFreeMailDomain(domain)) return null;
  return args.prospectsByDomain.get(domain) ?? null;
}
