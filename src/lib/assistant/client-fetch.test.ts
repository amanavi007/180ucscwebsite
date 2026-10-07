import { describe, expect, it } from "vitest";
import { friendlyErrorResponse } from "./client-fetch";

describe("friendlyErrorResponse", () => {
  it("replaces a JSON error body with its plain message, keeping the status", async () => {
    const res = await friendlyErrorResponse(Response.json({ error: "Message is empty." }, { status: 400 }));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Message is empty.");
  });
  it("falls back to a generic message for unparseable error bodies", async () => {
    const res = await friendlyErrorResponse(new Response("<html>boom</html>", { status: 502 }));
    expect(res.status).toBe(502);
    expect(await res.text()).toMatch(/something went wrong/i);
  });
  it("passes successful responses through untouched", async () => {
    const ok = new Response("stream", { status: 200 });
    expect(await friendlyErrorResponse(ok)).toBe(ok);
  });
});
