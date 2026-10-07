import { describe, expect, it } from "vitest";
import { loadAssistantConfig } from "./config";

describe("loadAssistantConfig", () => {
  it("uses cost-conscious defaults when env is empty", () => {
    expect(loadAssistantConfig({})).toEqual({
      userDailyCap: 30,
      globalDailyCap: 200,
      historyTurns: 8,
      maxSteps: 4,
      maxOutputTokens: 700,
      maxInputChars: 2000,
      maxHistoryChars: 60_000,
      rowCap: 20,
      answerCacheTtlMs: 60_000,
    });
  });

  it("reads overrides and ignores junk or non-positive values", () => {
    const c = loadAssistantConfig({
      ASSISTANT_USER_DAILY_CAP: "50",
      ASSISTANT_GLOBAL_DAILY_CAP: "abc",
      ASSISTANT_HISTORY_TURNS: "0",
      ASSISTANT_MAX_STEPS: "-3",
      ASSISTANT_ROW_CAP: "10",
    });
    expect(c.userDailyCap).toBe(50);
    expect(c.globalDailyCap).toBe(200);
    expect(c.historyTurns).toBe(8);
    expect(c.maxSteps).toBe(4);
    expect(c.rowCap).toBe(10);
  });
});
