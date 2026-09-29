import { describe, expect, it, vi } from "vitest";

// `server-only` throws when imported outside a Next.js server bundle; this
// test only exercises the pure response check, so stub the guard out.
vi.mock("server-only", () => ({}));

import { isTurnstileResponseValid } from "./turnstile";

describe("isTurnstileResponseValid", () => {
  it("is true when Cloudflare reports success", () => {
    expect(isTurnstileResponseValid({ success: true })).toBe(true);
  });

  it("is false when Cloudflare reports failure", () => {
    expect(isTurnstileResponseValid({ success: false, "error-codes": ["invalid-input-response"] })).toBe(false);
  });

  it("is false for malformed input", () => {
    expect(isTurnstileResponseValid(null)).toBe(false);
    expect(isTurnstileResponseValid({})).toBe(false);
    expect(isTurnstileResponseValid("success")).toBe(false);
  });
});
