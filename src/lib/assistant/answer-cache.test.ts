import { describe, expect, it } from "vitest";
import { AnswerCache, cacheKey } from "./answer-cache";

describe("AnswerCache", () => {
  it("returns a value within TTL and drops it after", () => {
    const c = new AnswerCache(1000, 10);
    c.set("k", "v", 0);
    expect(c.get("k", 999)).toBe("v");
    expect(c.get("k", 1001)).toBeUndefined();
  });
  it("evicts the oldest entry when full", () => {
    const c = new AnswerCache(1000, 2);
    c.set("a", "1", 0); c.set("b", "2", 1); c.set("c", "3", 2);
    expect(c.get("a", 3)).toBeUndefined();
    expect(c.get("c", 3)).toBe("3");
  });
  it("keys are per-user and normalise case and whitespace", () => {
    expect(cacheKey("u1", "  What's  DUE? ")).toBe(cacheKey("u1", "what's due?"));
    expect(cacheKey("u1", "x")).not.toBe(cacheKey("u2", "x"));
  });
});
