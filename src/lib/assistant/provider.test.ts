import { APICallError } from "ai";
import { describe, expect, it, vi } from "vitest";
import { isFallbackError, resolveModelSpecs } from "./provider";

vi.mock("server-only", () => ({}));

const apiError = (statusCode: number) =>
  new APICallError({ message: "x", url: "https://example.test", requestBodyValues: {}, statusCode });

describe("resolveModelSpecs", () => {
  it("is empty with no keys", () => {
    expect(resolveModelSpecs({})).toEqual([]);
  });
  it("google primary + groq fallback when both keys are set", () => {
    expect(resolveModelSpecs({ GOOGLE_GENERATIVE_AI_API_KEY: "g", GROQ_API_KEY: "q" })).toEqual([
      { provider: "google", modelId: "gemini-flash-latest" },
      { provider: "groq", modelId: "llama-3.3-70b-versatile" },
    ]);
  });
  it("groq becomes primary when it is the only key", () => {
    expect(resolveModelSpecs({ GROQ_API_KEY: "q", ASSISTANT_FALLBACK_MODEL: "m" })).toEqual([
      { provider: "groq", modelId: "m" },
    ]);
  });
  it("honours ASSISTANT_MODEL", () => {
    expect(resolveModelSpecs({ GOOGLE_GENERATIVE_AI_API_KEY: "g", ASSISTANT_MODEL: "gemini-x" })[0].modelId).toBe("gemini-x");
  });
});

describe("isFallbackError", () => {
  it("falls back on 429 and 5xx only", () => {
    expect(isFallbackError(apiError(429))).toBe(true);
    expect(isFallbackError(apiError(503))).toBe(true);
    expect(isFallbackError(apiError(400))).toBe(false);
    expect(isFallbackError(new Error("boom"))).toBe(false);
  });
});
