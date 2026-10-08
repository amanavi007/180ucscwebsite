import { describe, expect, it } from "vitest";
import { isSameOrigin } from "./same-origin";

const req = (headers: Record<string, string>) => new Request("https://app.test/api/chat/approve", { method: "POST", headers });

describe("isSameOrigin", () => {
  it("accepts the site's own origin and callers with no origin header", () => {
    expect(isSameOrigin(req({ origin: "https://app.test", host: "app.test" }))).toBe(true);
    expect(isSameOrigin(req({ host: "app.test" }))).toBe(true);
  });
  it("uses the forwarded host behind a proxy", () => {
    expect(isSameOrigin(req({ origin: "https://app.test", host: "internal:3000", "x-forwarded-host": "app.test" }))).toBe(true);
  });
  it("rejects other sites, look-alikes and garbage", () => {
    expect(isSameOrigin(req({ origin: "https://evil.test", host: "app.test" }))).toBe(false);
    expect(isSameOrigin(req({ origin: "https://app.test.evil.test", host: "app.test" }))).toBe(false);
    expect(isSameOrigin(req({ origin: "null", host: "app.test" }))).toBe(false);
  });
});
