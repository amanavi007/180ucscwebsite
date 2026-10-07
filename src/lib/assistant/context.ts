import type { UIMessage } from "ai";

type Validated = { ok: true; messages: UIMessage[]; text: string } | { ok: false; error: string };

function textOf(message: UIMessage): string {
  return message.parts
    .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("")
    .trim();
}

/** Untrusted client input: shape-check before any quota or model spend. */
export function validateIncoming(messages: unknown, maxChars: number): Validated {
  if (!Array.isArray(messages) || messages.length === 0) return { ok: false, error: "No message to send." };
  const last = messages[messages.length - 1] as UIMessage | undefined;
  if (!last || last.role !== "user" || !Array.isArray(last.parts)) {
    return { ok: false, error: "The last message must be from you." };
  }
  // Text only: a forged file/image part would otherwise ride along to the model uncounted.
  if (last.parts.some((part) => part.type !== "text")) {
    return { ok: false, error: "Only text messages are supported." };
  }
  const text = textOf(last);
  if (!text) return { ok: false, error: "Message is empty." };
  if (text.length > maxChars) return { ok: false, error: `Message is too long (max ${maxChars} characters).` };
  return { ok: true, messages: messages as UIMessage[], text };
}

/** Earlier turns keep only their text: tool calls/results, reasoning and step markers are dropped. */
function textOnly(message: UIMessage): UIMessage | null {
  if (message.role === "user") return message;
  const parts = message.parts.filter((part) => part.type === "text");
  return parts.length > 0 ? ({ ...message, parts } as UIMessage) : null;
}

/** Sliding window of the last `turns` user turns; everything before the latest turn is text-only. */
export function prepareHistory(messages: UIMessage[], turns: number): UIMessage[] {
  const userIdx = messages.map((m, i) => (m.role === "user" ? i : -1)).filter((i) => i >= 0);
  const start = userIdx.length > turns ? userIdx[userIdx.length - turns] : 0;
  const window = messages.slice(start);
  const lastUser = window.map((m) => m.role).lastIndexOf("user");
  return window.flatMap((m, i) => {
    if (i >= lastUser) return [m];
    const slim = textOnly(m);
    return slim ? [slim] : [];
  });
}

/**
 * The client supplies the history, so bound its size: drop the oldest whole turns until the
 * serialized window fits, always keeping the latest turn.
 */
export function capHistory(messages: UIMessage[], maxChars: number): UIMessage[] {
  let window = messages;
  while (JSON.stringify(window).length > maxChars) {
    const nextTurn = window.findIndex((m, i) => i > 0 && m.role === "user");
    if (nextTurn === -1) break;
    window = window.slice(nextTurn);
  }
  return window;
}

/** Thread titles cost no tokens: derived from the first message. */
export function titleFromText(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 60 ? `${flat.slice(0, 57)}...` : flat || "New chat";
}
