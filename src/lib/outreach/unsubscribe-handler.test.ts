import { describe, expect, it, vi } from "vitest";
import { handleUnsubscribeRequest } from "./unsubscribe-handler";
import { signUnsubscribeToken } from "./unsubscribe";

const SECRET = "s3cret";
const SITE = "https://ucsc180dc.org";
const token = signUnsubscribeToken("prospect-1", SECRET);
const url = (t = token) => `${SITE}/api/outreach/unsubscribe?token=${encodeURIComponent(t)}`;

const deps = () => ({ secret: SECRET, siteUrl: SITE, unsubscribe: vi.fn().mockResolvedValue(undefined) });

describe("handleUnsubscribeRequest", () => {
  it("never changes anything on GET (link scanners prefetch links) and redirects to the confirm page", async () => {
    const d = deps();
    const res = await handleUnsubscribeRequest(new Request(url()), d);
    expect(d.unsubscribe).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${SITE}/unsubscribe?token=${encodeURIComponent(token)}`);
  });

  it("unsubscribes on the RFC 8058 one-click POST", async () => {
    const d = deps();
    const res = await handleUnsubscribeRequest(
      new Request(url(), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" }),
      d,
    );
    expect(res.status).toBe(200);
    expect(d.unsubscribe).toHaveBeenCalledWith("prospect-1");
  });

  it("unsubscribes when the token comes in a form body", async () => {
    const d = deps();
    const res = await handleUnsubscribeRequest(
      new Request(`${SITE}/api/outreach/unsubscribe`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }).toString(),
      }),
      d,
    );
    expect(res.status).toBe(200);
    expect(d.unsubscribe).toHaveBeenCalledWith("prospect-1");
  });

  it("answers 200 and does nothing for a bad or missing token", async () => {
    const d = deps();
    expect((await handleUnsubscribeRequest(new Request(url("forged.token"), { method: "POST" }), d)).status).toBe(200);
    expect((await handleUnsubscribeRequest(new Request(`${SITE}/api/outreach/unsubscribe`, { method: "POST" }), d)).status).toBe(200);
    expect(d.unsubscribe).not.toHaveBeenCalled();
  });

  it("is idempotent: a second POST also succeeds", async () => {
    const d = deps();
    const post = () => handleUnsubscribeRequest(new Request(url(), { method: "POST" }), d);
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(200);
  });

  it("never unsubscribes when no secret is configured", async () => {
    const d = { ...deps(), secret: "" };
    await handleUnsubscribeRequest(new Request(url(), { method: "POST" }), d);
    expect(d.unsubscribe).not.toHaveBeenCalled();
  });

  it("rejects other methods", async () => {
    const res = await handleUnsubscribeRequest(new Request(url(), { method: "DELETE" }), deps());
    expect(res.status).toBe(405);
  });
});
