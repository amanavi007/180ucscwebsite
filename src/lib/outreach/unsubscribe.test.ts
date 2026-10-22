import { describe, expect, it } from "vitest";
import { listUnsubscribeHeaders, oneClickUrl, signUnsubscribeToken, unsubscribeUrl, verifyUnsubscribeToken } from "./unsubscribe";

describe("unsubscribe tokens", () => {
  it("round-trips a prospect id", () => {
    const token = signUnsubscribeToken("prospect-1", "s3cret");
    expect(verifyUnsubscribeToken(token, "s3cret")).toBe("prospect-1");
  });
  it("rejects a wrong secret, a tampered id, and garbage", () => {
    const token = signUnsubscribeToken("prospect-1", "s3cret");
    expect(verifyUnsubscribeToken(token, "other")).toBeNull();
    const [, sig] = token.split(".");
    expect(verifyUnsubscribeToken(`prospect-2.${sig}`, "s3cret")).toBeNull();
    expect(verifyUnsubscribeToken("nonsense", "s3cret")).toBeNull();
    expect(verifyUnsubscribeToken("", "s3cret")).toBeNull();
  });
  it("never verifies when the secret is empty", () => {
    expect(verifyUnsubscribeToken(signUnsubscribeToken("p", ""), "")).toBeNull();
  });
});

describe("unsubscribe urls and headers", () => {
  it("builds the confirm page url and the one-click api url", () => {
    expect(unsubscribeUrl("tok", "https://ucsc180dc.org")).toBe("https://ucsc180dc.org/unsubscribe?token=tok");
    expect(oneClickUrl("tok", "https://ucsc180dc.org")).toBe("https://ucsc180dc.org/api/outreach/unsubscribe?token=tok");
  });
  it("sets the one-click headers", () => {
    expect(listUnsubscribeHeaders("https://x/api/outreach/unsubscribe?token=t", "unsubscribe@partners.ucsc180dc.org")).toEqual({
      "List-Unsubscribe": "<https://x/api/outreach/unsubscribe?token=t>, <mailto:unsubscribe@partners.ucsc180dc.org>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });
});
