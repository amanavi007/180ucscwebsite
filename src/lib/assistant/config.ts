export interface AssistantConfig {
  userDailyCap: number;
  globalDailyCap: number;
  historyTurns: number;
  maxSteps: number;
  maxOutputTokens: number;
  maxInputChars: number;
  maxHistoryChars: number;
  maxRetries: number;
  rowCap: number;
  answerCacheTtlMs: number;
}

type Env = Record<string, string | undefined>;

function readInt(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

function readNonNegative(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function loadAssistantConfig(env: Env = process.env): AssistantConfig {
  return {
    userDailyCap: readInt(env.ASSISTANT_USER_DAILY_CAP, 30),
    globalDailyCap: readInt(env.ASSISTANT_GLOBAL_DAILY_CAP, 200),
    historyTurns: readInt(env.ASSISTANT_HISTORY_TURNS, 4),
    maxSteps: readInt(env.ASSISTANT_MAX_STEPS, 3),
    maxOutputTokens: readInt(env.ASSISTANT_MAX_OUTPUT_TOKENS, 700),
    maxInputChars: readInt(env.ASSISTANT_MAX_INPUT_CHARS, 2000),
    maxHistoryChars: readInt(env.ASSISTANT_MAX_HISTORY_CHARS, 60_000),
    maxRetries: readNonNegative(env.ASSISTANT_MAX_RETRIES, 1),
    rowCap: readInt(env.ASSISTANT_ROW_CAP, 20),
    answerCacheTtlMs: readInt(env.ASSISTANT_ANSWER_CACHE_TTL_MS, 60_000),
  };
}
