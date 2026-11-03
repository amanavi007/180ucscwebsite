import { describe, expect, it, vi } from "vitest";
import {
  authenticateAgent,
  bearerToken,
  createRateLimiter,
  generateAgentKey,
  hashAgentKey,
  type AgentAuthDeps,
  type AgentKeyRecord,
} from "./agent-auth";

const now = new Date("2026-11-04T12:00:00Z");

function setup(record: Partial<AgentKeyRecord> | null, enabled = true) {
  const { key, hash } = generateAgentKey();
  const stored: AgentKeyRecord | null = record && { id: "k1", scopes: ["outreach:read"], revokedAt: null, lastUsedAt: null, ...record };
  const touch = vi.fn(async () => {});
  const deps: AgentAuthDeps = {
    findKeyByHash: async (h) => (h === hash ? stored : null),
    agentEnabled: async () => enabled,
    touch,
    now: () => now,
  };
  return { key, deps, touch, header: `Bearer ${key}` };
}

describe("generateAgentKey", () => {
  it("makes a prefixed key and stores only its hash", () => {
    const { key, hash, prefix } = generateAgentKey();
    expect(key.startsWith("180agent_")).toBe(true);
    expect(key.length).toBeGreaterThan(40);
    expect(prefix).toBe(key.slice(0, 12));
    expect(hash).toBe(hashAgentKey(key));
    expect(hash).not.toContain(key);
    expect(generateAgentKey().key).not.toBe(key);
  });
});

describe("bearerToken", () => {
  it("accepts only a Bearer header carrying an agent key", () => {
    expect(bearerToken("Bearer 180agent_abc")).toBe("180agent_abc");
    expect(bearerToken("Bearer something_else")).toBeNull();
    expect(bearerToken("Basic 180agent_abc")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});

describe("authenticateAgent", () => {
  it("rejects an unknown key with a plain 401", async () => {
    const { deps } = setup({});
    const result = await authenticateAgent(`Bearer ${generateAgentKey().key}`, "outreach:read", deps, createRateLimiter());
    expect(result).toEqual({ ok: false, status: 401, error: "unauthorized" });
  });

  it("rejects a missing header with the same 401", async () => {
    const { deps } = setup({});
    expect(await authenticateAgent(null, "outreach:read", deps, createRateLimiter())).toEqual({ ok: false, status: 401, error: "unauthorized" });
  });

  it("rejects a revoked key with the same 401", async () => {
    const { deps, header } = setup({ revokedAt: "2026-11-01T00:00:00Z" });
    expect(await authenticateAgent(header, "outreach:read", deps, createRateLimiter())).toEqual({ ok: false, status: 401, error: "unauthorized" });
  });

  it("answers 403 missing_scope when the key lacks the scope", async () => {
    const { deps, header } = setup({ scopes: ["outreach:read"] });
    expect(await authenticateAgent(header, "outreach:submit", deps, createRateLimiter())).toEqual({ ok: false, status: 403, error: "missing_scope" });
  });

  it("answers 403 agent_disabled while the master switch is off", async () => {
    const { deps, header } = setup({}, false);
    expect(await authenticateAgent(header, "outreach:read", deps, createRateLimiter())).toEqual({ ok: false, status: 403, error: "agent_disabled" });
  });

  it("accepts a valid key and records when it was used", async () => {
    const { deps, header, touch } = setup({});
    expect(await authenticateAgent(header, "outreach:read", deps, createRateLimiter())).toEqual({ ok: true, keyId: "k1" });
    expect(touch).toHaveBeenCalledWith("k1", now);
  });

  it("does not rewrite last_used_at more than once a minute", async () => {
    const { deps, header, touch } = setup({ lastUsedAt: new Date(now.getTime() - 10_000).toISOString() });
    await authenticateAgent(header, "outreach:read", deps, createRateLimiter());
    expect(touch).not.toHaveBeenCalled();
  });

  it("still succeeds when the timestamp write fails", async () => {
    const { deps, header } = setup({});
    deps.touch = async () => {
      throw new Error("db down");
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await authenticateAgent(header, "outreach:read", deps, createRateLimiter())).ok).toBe(true);
  });

  it("limits a key to 60 calls a minute", async () => {
    const { deps, header } = setup({});
    const limiter = createRateLimiter(60, 60_000);
    for (let i = 0; i < 60; i++) expect((await authenticateAgent(header, "outreach:read", deps, limiter)).ok).toBe(true);
    expect(await authenticateAgent(header, "outreach:read", deps, limiter)).toEqual({ ok: false, status: 429, error: "rate_limited" });
  });
});
