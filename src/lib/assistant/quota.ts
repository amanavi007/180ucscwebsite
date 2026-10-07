import type { AssistantConfig } from "./config";

export type QuotaFailure = "disabled" | "user_cap" | "global_cap" | "unauthenticated";
export type QuotaResult = { ok: true } | { ok: false; reason: QuotaFailure };

export interface QuotaClient {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export function quotaMessage(reason: QuotaFailure): string {
  switch (reason) {
    case "user_cap":
      return "You've used today's assistant messages. The limit resets at midnight Pacific.";
    case "global_cap":
      return "The assistant has hit the team's daily free-usage limit. It resets at midnight Pacific.";
    case "unauthenticated":
      return "Please sign in again to use the assistant.";
    case "disabled":
      return "The assistant is currently unavailable.";
  }
}

/** Checks the kill switch, then atomically spends one message. Fails closed. */
export async function checkAndConsume(client: QuotaClient, cfg: AssistantConfig): Promise<QuotaResult> {
  const enabled = await client.rpc("assistant_is_enabled");
  if (enabled.error || enabled.data !== true) return { ok: false, reason: "disabled" };

  const spent = await client.rpc("consume_chat_message", {
    p_user_cap: cfg.userDailyCap,
    p_global_cap: cfg.globalDailyCap,
  });
  if (spent.error) return { ok: false, reason: "disabled" };
  if (spent.data === "ok") return { ok: true };
  if (spent.data === "user_cap" || spent.data === "global_cap" || spent.data === "unauthenticated") {
    return { ok: false, reason: spent.data };
  }
  return { ok: false, reason: "disabled" };
}

/**
 * Failed or free (shortcut/cache) requests are not charged. Best-effort.
 * Must run on the system ledger client, never the user's: if a user could call this RPC they
 * could refund themselves after every message and defeat the daily cap.
 */
export async function refund(client: QuotaClient, userId: string): Promise<void> {
  try {
    await client.rpc("refund_chat_message", { p_user: userId });
  } catch (err) {
    console.error("assistant refund failed:", err);
  }
}

/** One write per request, after the response finishes. Best-effort. */
export async function recordTokens(client: QuotaClient, userId: string, input: number, output: number): Promise<void> {
  try {
    await client.rpc("record_chat_tokens", { p_user: userId, p_in: Math.round(input), p_out: Math.round(output) });
  } catch (err) {
    console.error("assistant token usage write failed:", err);
  }
}
