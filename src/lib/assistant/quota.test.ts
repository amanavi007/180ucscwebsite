import { describe, expect, it, vi } from "vitest";
import { loadAssistantConfig } from "./config";
import { checkAndConsume, quotaMessage, recordTokens, refund, type QuotaClient } from "./quota";

const cfg = loadAssistantConfig({});

function fake(map: Record<string, unknown>): QuotaClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    rpc: async (name) => {
      calls.push(name);
      return { data: map[name], error: null };
    },
  };
}

describe("checkAndConsume", () => {
  it("refuses without spending when the kill switch is off", async () => {
    const c = fake({ assistant_is_enabled: false });
    expect(await checkAndConsume(c, cfg)).toEqual({ ok: false, reason: "disabled" });
    expect(c.calls).toEqual(["assistant_is_enabled"]);
  });
  it("passes through ok", async () => {
    const c = fake({ assistant_is_enabled: true, consume_chat_message: "ok" });
    expect(await checkAndConsume(c, cfg)).toEqual({ ok: true });
  });
  it.each(["user_cap", "global_cap", "unauthenticated"] as const)("maps %s", async (reason) => {
    const c = fake({ assistant_is_enabled: true, consume_chat_message: reason });
    expect(await checkAndConsume(c, cfg)).toEqual({ ok: false, reason });
  });
  it("fails closed if the RPC errors", async () => {
    const c: QuotaClient = { rpc: async () => ({ data: null, error: { message: "db down" } }) };
    expect(await checkAndConsume(c, cfg)).toEqual({ ok: false, reason: "disabled" });
  });
});

describe("best-effort helpers", () => {
  it("never throw", async () => {
    const bad: QuotaClient = { rpc: vi.fn(async () => { throw new Error("x"); }) };
    await expect(refund(bad, "u1")).resolves.toBeUndefined();
    await expect(recordTokens(bad, "u1", 1, 2)).resolves.toBeUndefined();
  });
  it("pass the user id explicitly because they run as the system, not the user", async () => {
    const seen: { name: string; args?: Record<string, unknown> }[] = [];
    const c: QuotaClient = { rpc: async (name, args) => { seen.push({ name, args }); return { data: null, error: null }; } };
    await refund(c, "u1");
    await recordTokens(c, "u1", 10.4, 5);
    expect(seen).toEqual([
      { name: "refund_chat_message", args: { p_user: "u1" } },
      { name: "record_chat_tokens", args: { p_user: "u1", p_in: 10, p_out: 5 } },
    ]);
  });
  it("has a message for every reason", () => {
    for (const r of ["disabled", "user_cap", "global_cap", "unauthenticated"] as const) {
      expect(quotaMessage(r).length).toBeGreaterThan(10);
    }
  });
});
