import { evaluateBrakes } from "./pacing";
import type { OutreachSettings } from "./settings";

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
  { key: "needs-you", label: "Needs you", statuses: ["replied", "needs_attention"] },
  { key: "not-sent", label: "Not sent yet", statuses: ["new", "verified", "drafted"] },
  { key: "in-progress", label: "In progress", statuses: ["queued", "sent", "follow_up_1", "follow_up_2", "closing_note"] },
  { key: "finished", label: "Finished", statuses: ["booked", "no_response"] },
  { key: "stopped", label: "Stopped", statuses: ["unsubscribed", "bounced", "invalid"] },
];

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
