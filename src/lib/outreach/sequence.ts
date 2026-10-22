import { ORG_TIME_ZONE } from "@/lib/date";

const DAY_MS = 86_400_000;

const isWeekend = (d: Date) => {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: ORG_TIME_ZONE, weekday: "short" }).format(d);
  return weekday === "Sat" || weekday === "Sun";
};

/**
 * When email number `step` is due, counted in Pacific business days after `from` (the first send).
 * `step` 1 is the first follow-up. Null once the sequence has no more emails.
 */
export function nextActionAt(from: Date, followupDays: number[], step: number): Date | null {
  const days = followupDays[step - 1];
  if (step < 1 || days === undefined) return null;
  let t = from.getTime();
  let remaining = days;
  while (remaining > 0) {
    t += DAY_MS;
    if (!isWeekend(new Date(t))) remaining--;
  }
  return new Date(t);
}

export type SentStatus = "sent" | "follow_up_1" | "follow_up_2" | "closing_note";

/** The pipeline stage a prospect is in once email number `step` (0 = first) has gone out. */
export function statusAfterSend(step: number): SentStatus {
  if (step <= 0) return "sent";
  if (step === 1) return "follow_up_1";
  if (step === 2) return "follow_up_2";
  return "closing_note";
}

export function stepKind(step: number): "first" | "follow_up" | "closing" {
  if (step <= 0) return "first";
  return step >= 3 ? "closing" : "follow_up";
}

const TERMINAL = new Set(["replied", "booked", "unsubscribed", "bounced", "invalid", "no_response"]);

export function isTerminal(status: string): boolean {
  return TERMINAL.has(status);
}
