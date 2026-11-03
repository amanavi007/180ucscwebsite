export interface PendingMessage {
  status: string;
  scheduledFor: Date | null;
}

/**
 * What to do with a message when a prospect replies, books or opts out. A drafted or future-scheduled message is
 * cancelled. One whose send time has already passed has gone out (Resend holds nothing for it), so it is recorded as sent.
 */
export function stopAction(message: PendingMessage, now: Date): "cancel" | "mark_sent" | "leave" {
  if (message.status === "draft") return "cancel";
  if (message.status !== "scheduled") return "leave";
  return message.scheduledFor && message.scheduledFor.getTime() <= now.getTime() ? "mark_sent" : "cancel";
}
