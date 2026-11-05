import { evaluateBrakes } from "./pacing";
import type { OutreachSettings } from "./settings";
import type { Schedule } from "./schedule";
import { OUTCOME_FILTERS } from "./discovery/view";

export type ChipVariant = "ok" | "warn" | "bad" | "info" | "muted";

const STAGES: Record<string, { label: string; variant: ChipVariant }> = {
  new: { label: "New", variant: "muted" },
  verified: { label: "Verified", variant: "muted" },
  drafted: { label: "Drafted", variant: "info" },
  queued: { label: "Scheduled", variant: "info" },
  sent: { label: "Sent", variant: "ok" },
  follow_up_1: { label: "Follow-up 1", variant: "ok" },
  follow_up_2: { label: "Follow-up 2", variant: "ok" },
  closing_note: { label: "Closing note", variant: "ok" },
  no_response: { label: "No response", variant: "muted" },
  replied: { label: "Replied", variant: "warn" },
  booked: { label: "Booked", variant: "ok" },
  unsubscribed: { label: "Unsubscribed", variant: "muted" },
  bounced: { label: "Bounced", variant: "bad" },
  invalid: { label: "Invalid email", variant: "bad" },
  needs_attention: { label: "Needs attention", variant: "warn" },
};

/** The word and color of a prospect's stage chip. Always a word, never color alone. */
export function stageChip(status: string): { label: string; variant: ChipVariant } {
  return STAGES[status] ?? { label: status, variant: "muted" };
}

export const STAGE_FILTERS: { key: string; label: string; statuses: string[] }[] = [
  { key: "all", label: "All", statuses: [] },
  // Needs you and Replied overlap on purpose: a reply is both a thing to answer and a stage.
  { key: "needs-you", label: "Needs you", statuses: ["replied", "needs_attention", "bounced"] },
  { key: "drafted", label: "Drafted", statuses: ["new", "verified", "drafted"] },
  { key: "scheduled", label: "Scheduled", statuses: ["queued"] },
  { key: "sent", label: "Sent", statuses: ["sent", "follow_up_1", "follow_up_2", "closing_note"] },
  { key: "replied", label: "Replied", statuses: ["replied"] },
  { key: "booked", label: "Booked", statuses: ["booked"] },
  { key: "finished", label: "Finished", statuses: ["no_response", "unsubscribed", "invalid"] },
];

/** Stages that show Discovery's candidates instead of prospects. */
export const DISCOVERY_STAGES = [
  { key: "found", label: "Found" },
  { key: "skipped", label: "Skipped" },
] as const;

export function isDiscoveryStage(key: string | null | undefined): key is "found" | "skipped" {
  return key === "found" || key === "skipped";
}

const OLD_STAGE_KEYS: Record<string, string> = { "not-sent": "drafted", "in-progress": "sent", stopped: "finished" };

/** A stage from the address bar: old keys are mapped, nothing means Needs you, anything unknown means All. */
export function normalizeStage(key: string | null | undefined): string {
  if (!key) return "needs-you";
  const mapped = OLD_STAGE_KEYS[key] ?? key;
  if (isDiscoveryStage(mapped) || STAGE_FILTERS.some((f) => f.key === mapped)) return mapped;
  return "all";
}

export function filterByStage<T extends { status: string }>(prospects: T[], key: string): T[] {
  const filter = STAGE_FILTERS.find((f) => f.key === key);
  if (!filter || filter.key === "all") return prospects;
  return prospects.filter((p) => filter.statuses.includes(p.status));
}

export function nicheOptions(prospects: { niche: string | null }[]): string[] {
  return [...new Set(prospects.map((p) => p.niche?.trim()).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b));
}

export interface SenderState {
  label: "Off" | "Test mode" | "Paused" | "Braked" | "On hold" | "Running";
  variant: ChipVariant;
  detail: string;
}

/** What the health strip says about the sender, in one word plus a sentence. */
export function senderState(args: {
  settings: OutreachSettings;
  health: { sent: number; bounced: number; complained: number };
  bookingOpen: boolean;
}): SenderState {
  const { settings } = args;
  if (settings.mode === "off") return { label: "Off", variant: "muted", detail: "Nothing is being drafted or sent. Turn it on in Settings." };
  if (settings.mode === "dry_run") return { label: "Test mode", variant: "info", detail: "Drafts are written but nothing is sent." };
  if (settings.mode === "self_only") return { label: "Test mode", variant: "info", detail: "Emails go only to the person who turned this on, not to prospects or the other execs." };
  if (settings.mode === "exec_only") return { label: "Test mode", variant: "info", detail: "Emails go to the execs only, not to prospects." };
  if (settings.paused) return { label: "Paused", variant: "warn", detail: "Sending is paused. Turn Pause off in Settings to resume." };
  const verdict = evaluateBrakes({ ...args.health, settings, bookingOpen: args.bookingOpen, resendAccountError: false });
  if (verdict.reason === "booking_closed") return { label: "On hold", variant: "warn", detail: "The intro-call booking page is closed, so nothing is sent." };
  if (verdict.reason === "bounce_rate") return { label: "Braked", variant: "bad", detail: "Too many emails bounced. Check the list quality before resuming." };
  if (verdict.reason === "complaint_rate") return { label: "Braked", variant: "bad", detail: "Someone marked an email as spam. Review before resuming." };
  return { label: "Running", variant: "ok", detail: "Sending within the daily limit." };
}

export function stepLabel(step: number): string {
  return ["First email", "Follow-up 1", "Follow-up 2"][step] ?? "Closing note";
}

const REPLY_LABELS: Record<string, string> = {
  interested: "Interested",
  question: "Question",
  not_interested: "Not interested",
  later: "Not right now",
  unsubscribe: "Asked to unsubscribe",
  auto_reply: "Automatic reply",
  other: "Other",
};

export function replyLabel(classification: string): string {
  return REPLY_LABELS[classification] ?? "Other";
}

const EVENT_LABELS: Record<string, string> = {
  delivered: "Delivered",
  bounced: "Bounced",
  complained: "Marked as spam",
  replied: "Replied",
  unsubscribed: "Unsubscribed",
  booked: "Booked a call",
  failed: "Could not be sent",
  brake: "Sending paused",
};

export function eventLabel(kind: string): string {
  return EVENT_LABELS[kind] ?? kind;
}

/** "Oct 23" in the org's time zone, or a dash when there is no date. */
export function formatWhen(iso: string | null): string {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric" }).format(new Date(iso));
}

export interface NeedsYouItem {
  prospectId: string;
  company: string;
  kind: "reply" | "stuck" | "bounced";
  reason: string;
  actionLabel: "Open reply" | "Fix draft" | "Add another email";
}

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

/** The things a person has to decide: replies first, then stuck drafts, then bounces. */
export function needsYouItems(
  prospects: { id: string; company: string; status: string; statusReason: string | null; contactEmail: string }[],
  replies: { prospectId: string | null; snippet: string; createdAt: string }[],
): NeedsYouItem[] {
  const newestReply = new Map<string, { snippet: string; createdAt: string }>();
  for (const r of replies) {
    if (!r.prospectId) continue;
    const seen = newestReply.get(r.prospectId);
    if (!seen || r.createdAt > seen.createdAt) newestReply.set(r.prospectId, r);
  }
  const out: NeedsYouItem[] = [];
  for (const p of prospects.filter((x) => x.status === "replied")) {
    out.push({ prospectId: p.id, company: p.company, kind: "reply", reason: clip(newestReply.get(p.id)?.snippet.trim() || "Replied", 90), actionLabel: "Open reply" });
  }
  for (const p of prospects.filter((x) => x.status === "needs_attention" && x.statusReason !== "Stopped by an exec.")) {
    out.push({ prospectId: p.id, company: p.company, kind: "stuck", reason: clip(p.statusReason || "Needs a look", 90), actionLabel: "Fix draft" });
  }
  for (const p of prospects.filter((x) => x.status === "bounced")) {
    out.push({ prospectId: p.id, company: p.company, kind: "bounced", reason: `${p.contactEmail} did not accept the email`, actionLabel: "Add another email" });
  }
  return out;
}

export interface TodaySends {
  items: { prospectId: string; company: string; step: number; at: string | null; state: "sent" | "scheduled" | "planned"; senderName: string | null }[];
  left: number;
  tomorrow: number;
  windowLabel: string;
}

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;

/** Today's sends from the schedule, how many are still to go, and how many are planned for the next working day. */
export function todaySends(
  schedule: Schedule,
  senderNameFor: (prospectId: string) => string | null,
  settings: Pick<OutreachSettings, "windowStartHour" | "windowEndHour">,
): TodaySends {
  const [first, ...rest] = schedule.days;
  const items = (first?.items ?? []).map((i) => ({ prospectId: i.prospectId, company: i.company, step: i.step, at: i.at, state: i.state, senderName: senderNameFor(i.prospectId) }));
  const next = rest.find((d) => !d.weekend);
  return {
    items,
    left: items.filter((i) => i.state !== "sent").length,
    tomorrow: next?.items.length ?? 0,
    windowLabel: `${hourLabel(settings.windowStartHour)} to ${hourLabel(settings.windowEndHour)}`,
  };
}

/** The pipeline strip on Today: one count per step, each linking to that stage in Companies. */
export function funnelCounts(prospects: { status: string }[], foundCount: number): { key: string; label: string; count: number; href: string }[] {
  const href = (key: string) => `/portal/admin/outreach/companies?stage=${key}`;
  const steps = [{ key: "found", label: "Found", count: foundCount }].concat(
    ["drafted", "scheduled", "sent", "replied", "booked"].map((key) => ({ key, label: STAGE_FILTERS.find((f) => f.key === key)!.label, count: filterByStage(prospects, key).length })),
  );
  return steps.map((s) => ({ ...s, href: href(s.key) }));
}

/** The number on every Companies chip: prospects by stage, plus Discovery's ready and set-aside counts. */
export function companyStageCounts(prospects: { status: string }[], discoveryCounts: Record<string, number>): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(STAGE_FILTERS.map((f) => [f.key, filterByStage(prospects, f.key).length]));
  counts.found = discoveryCounts.ready ?? 0;
  counts.skipped = (OUTCOME_FILTERS.find((f) => f.key === "skipped")?.outcomes ?? []).reduce((sum, o) => sum + (discoveryCounts[o] ?? 0), 0);
  return counts;
}
