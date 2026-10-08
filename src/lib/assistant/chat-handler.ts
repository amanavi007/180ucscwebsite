import {
  APICallError,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  isStepCount,
  streamText,
  toUIMessageStream,
  type LanguageModel,
  type ToolSet,
  type UIMessage,
} from "ai";
import type { UserRole } from "@/lib/supabase/database.types";
import { getOrgTodayDateString } from "@/lib/date";
import { cacheKey, type AnswerCache } from "./answer-cache";
import type { AssistantConfig } from "./config";
import { capHistory, prepareHistory, validateIncoming } from "./context";
import { checkAndConsume, quotaMessage, recordTokens, refund, type QuotaClient } from "./quota";
import { matchShortcut, selectAreas, type Area, type Shortcut } from "./routing";
import { buildInstructions } from "./system-prompt";

export interface ChatDeps {
  cfg: AssistantConfig;
  model: LanguageModel | null;
  quota: QuotaClient;
  /** System-level client for refunds and token accounting (users must not be able to call these). */
  ledger: QuotaClient;
  profile: { id: string; name: string; role: UserRole };
  quarter: { id: string; name: string } | null;
  buildTools(areas: Area[], threadId: string | null): ToolSet;
  /** Runs the tool a shortcut stands for and returns its structured result (drawn as a card). */
  runShortcut(s: Shortcut): Promise<{ tool: string; output: unknown }>;
  threads: {
    ensure(threadId: string | null, firstText: string): Promise<string>;
    save(threadId: string, messages: UIMessage[]): Promise<void>;
  };
  cache: AnswerCache;
  now(): Date;
  log(line: Record<string, unknown>): void;
}

/** What the user sees when the stream fails: say "busy" for provider overload, not a vague error. */
export function friendlyStreamError(err: unknown): string {
  if (APICallError.isInstance(err) && (err.statusCode === 429 || (err.statusCode ?? 0) >= 500)) {
    return "The AI provider is busy right now. Please try again in a minute.";
  }
  return "Something went wrong. Please try again.";
}

export interface ChatRequest {
  messages: unknown;
  threadId?: string | null;
}

const json = (status: number, error: string) => Response.json({ error }, { status });

function textStreamResponse(
  original: UIMessage[],
  text: string,
  threadId: string,
  onEnd: (messages: UIMessage[]) => Promise<void>,
) {
  const stream = createUIMessageStream({
    originalMessages: original,
    execute: ({ writer }) => {
      const id = generateId();
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: text });
      writer.write({ type: "text-end", id });
    },
    onEnd: async ({ messages }) => onEnd(messages),
  });
  return createUIMessageStreamResponse({ stream, headers: { "x-thread-id": threadId } });
}

function toolCardResponse(
  original: UIMessage[],
  result: { tool: string; output: unknown },
  threadId: string,
  onEnd: (messages: UIMessage[]) => Promise<void>,
) {
  const stream = createUIMessageStream({
    originalMessages: original,
    execute: ({ writer }) => {
      const toolCallId = generateId();
      writer.write({ type: "tool-input-available", toolCallId, toolName: result.tool, input: {} });
      writer.write({ type: "tool-output-available", toolCallId, output: result.output });
    },
    onEnd: async ({ messages }) => onEnd(messages),
  });
  return createUIMessageStreamResponse({ stream, headers: { "x-thread-id": threadId } });
}

export async function handleChat(req: ChatRequest, deps: ChatDeps): Promise<Response> {
  const { cfg } = deps;

  // 1. Cheapest checks first: nothing below this line costs quota or tokens.
  const input = validateIncoming(req.messages, cfg.maxInputChars);
  if (!input.ok) return json(400, input.error);
  if (!deps.model) return json(503, "The assistant isn't set up yet.");

  // 2. Quota (kill switch + atomic per-user/global caps).
  const quota = await checkAndConsume(deps.quota, cfg);
  if (!quota.ok) return json(quota.reason === "disabled" ? 503 : 429, quotaMessage(quota.reason));

  const started = deps.now().getTime();
  const logBase = { user: deps.profile.id, textLen: input.text.length };

  try {
    const threadId = await deps.threads.ensure(req.threadId ?? null, input.text);
    const save = (messages: UIMessage[]) => deps.threads.save(threadId, messages);

    // 3. Zero-token deterministic shortcut. It costs no model quota, so the message is handed back.
    const shortcut = matchShortcut(input.text);
    if (shortcut) {
      const result = await deps.runShortcut(shortcut);
      await refund(deps.ledger, deps.profile.id);
      deps.log({ ...logBase, path: "shortcut", shortcut, tokensIn: 0, tokensOut: 0 });
      return toolCardResponse(input.messages, result, threadId, save);
    }

    // 4. Short-TTL answer cache, only for standalone first messages: a follow-up like "and the
    // deadline?" means something different in every conversation, so it is never cached or served.
    const standalone = input.messages.length === 1;
    const key = cacheKey(deps.profile.id, input.text);
    const cached = standalone ? deps.cache.get(key, started) : undefined;
    if (cached !== undefined) {
      await refund(deps.ledger, deps.profile.id);
      deps.log({ ...logBase, path: "cache", tokensIn: 0, tokensOut: 0 });
      return textStreamResponse(input.messages, cached, threadId, save);
    }

    // 5. Model call with trimmed history and only the relevant tools.
    const recentWrite = input.messages.slice(-6).some((m) => m.role === "assistant" && m.parts.some((p) => p.type.startsWith("tool-propose_")));
    const areas = selectAreas(input.text, { recentWrite });
    const tools = deps.buildTools(areas, threadId);
    const history = capHistory(prepareHistory(input.messages, cfg.historyTurns), cfg.maxHistoryChars);
    const todayIso = getOrgTodayDateString();

    const result = streamText({
      model: deps.model,
      instructions: buildInstructions(deps.profile, deps.quarter?.name ?? null, todayIso),
      messages: await convertToModelMessages(history),
      tools,
      stopWhen: isStepCount(cfg.maxSteps),
      maxOutputTokens: cfg.maxOutputTokens,
      maxRetries: cfg.maxRetries,
      timeout: { totalMs: 45_000 },
      onEnd: async ({ totalUsage, steps }) => {
        const tokensIn = totalUsage.inputTokens ?? 0;
        const tokensOut = totalUsage.outputTokens ?? 0;
        await recordTokens(deps.ledger, deps.profile.id, tokensIn, tokensOut);
        deps.log({ ...logBase, path: "model", tokensIn, tokensOut, steps: steps.length, ms: deps.now().getTime() - started });
      },
      onError: async ({ error }) => {
        // Provider failed after we charged a message: give it back.
        deps.log({ ...logBase, path: "error", error: error instanceof Error ? error.message : String(error) });
        await refund(deps.ledger, deps.profile.id);
      },
    });

    const stream = toUIMessageStream({
      stream: result.stream,
      tools,
      originalMessages: input.messages,
      onEnd: async ({ messages }) => {
        await save(messages);
        // Cache only plain text answers (no tool calls, so no proposals), never errors.
        const last = messages[messages.length - 1];
        const hasTool = last?.parts.some((p) => p.type.startsWith("tool-"));
        const text = last?.parts
          .filter((p) => p.type === "text")
          .map((p) => (p as { text: string }).text)
          .join("");
        if (standalone && last?.role === "assistant" && !hasTool && text) deps.cache.set(key, text, deps.now().getTime());
      },
      onError: friendlyStreamError,
    });
    return createUIMessageStreamResponse({ stream, headers: { "x-thread-id": threadId } });
  } catch (err) {
    await refund(deps.ledger, deps.profile.id);
    deps.log({ ...logBase, path: "error", error: err instanceof Error ? err.message : String(err) });
    return json(503, "The assistant had a problem. Please try again.");
  }
}
