import { z } from "zod";

/** An officer emails can come from and be signed by. */
export const senderSchema = z.object({
  /** Stable key kept on each prospect so a thread stays with one officer. The profile id when filled from the roster. */
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(80),
  /** e.g. "Director of Projects". */
  title: z.string().trim().min(1).max(80),
  /** Empty when they have no LinkedIn; the signature then shows only the website link. */
  linkedin: z.string().trim().max(300),
  enabled: z.boolean(),
});
export type OutreachSender = z.infer<typeof senderSchema>;

export const sendersSchema = z.array(senderSchema).max(20);

/** The saved senders, or none when nothing valid is saved (the old single-sender settings then apply). */
export function parseSenders(raw: string | undefined): OutreachSender[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = sendersSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** First name as it appears in the mailbox: "Devarsh Jayakrishnan" sends from devarsh@. */
export const mailboxName = (name: string) => name.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, "");

/** A problem with the list as a whole, or null. Two officers with the same first name would share one address. */
export function sendersProblem(senders: OutreachSender[]): string | null {
  const ids = new Set<string>();
  const boxes = new Map<string, string>();
  for (const s of senders) {
    if (ids.has(s.id)) return "Two officers have the same key. Remove one and add them again.";
    ids.add(s.id);
    if (!mailboxName(s.name)) return `"${s.name}" needs a first name made of letters or numbers.`;
    if (s.linkedin && !/^https:\/\/([a-z0-9-]+\.)?linkedin\.com\/\S+$/i.test(s.linkedin)) return `${s.name}'s LinkedIn must be a https://linkedin.com link, or empty.`;
    if (!s.enabled) continue;
    const box = mailboxName(s.name);
    const other = boxes.get(box);
    if (other) return `${other} and ${s.name} share the first name "${box}", so their emails would come from the same address. Turn one off or use a nickname.`;
    boxes.set(box, s.name);
  }
  return null;
}

/** A LinkedIn link without the tracking bits people copy along ("?isSelfProfile=true"). */
export function cleanLinkedin(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url.trim());
    return `https://${u.hostname.replace(/^linkedin\.com$/i, "www.linkedin.com")}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "";
  }
}

/** The closing block for one officer, in the format the signature setting uses. */
export function buildSignature(sender: OutreachSender, siteUrl: string): string {
  const links = [sender.linkedin ? `[LinkedIn](${sender.linkedin})` : "", `[Learn More About Us](${siteUrl})`].filter(Boolean).join(" \uFE31 ");
  return ["Best regards,", "", sender.name, `${sender.title} | 180 Degrees Consulting`, "University of California, Santa Cruz", links].join("\n");
}

function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * Who sends to this company. The officer already assigned keeps it, so a thread never changes name. Otherwise one of the
 * turned-on officers is picked from the prospect's id, which spreads companies evenly and gives the same answer every time.
 * Null when no officer is turned on: the old single-sender settings apply.
 */
export function pickSender(senders: OutreachSender[], prospectId: string, assignedId: string | null): OutreachSender | null {
  const active = senders.filter((s) => s.enabled);
  if (active.length === 0) return null;
  const kept = active.find((s) => s.id === assignedId);
  return kept ?? active[hash(prospectId) % active.length];
}

const EXEC_ORDER = ["president", "director_of_projects", "director_of_internal_affairs", "director_of_external_affairs", "director_of_marketing", "director_of_training"];

/** The execs on the roster as senders, in a fixed order. `titleOf` turns a role into its label. */
export function sendersFromRoster(
  people: { id: string; name: string; role: string; linkedin: string | null }[],
  titleOf: (role: string) => string,
): OutreachSender[] {
  return people
    .filter((p) => EXEC_ORDER.includes(p.role))
    .sort((a, b) => EXEC_ORDER.indexOf(a.role) - EXEC_ORDER.indexOf(b.role))
    .map((p) => ({ id: p.id, name: p.name, title: titleOf(p.role), linkedin: cleanLinkedin(p.linkedin), enabled: true }));
}
