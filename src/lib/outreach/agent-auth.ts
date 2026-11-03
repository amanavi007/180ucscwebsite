import { createHash, randomBytes } from "node:crypto";

/** What a key may do. A key holds a subset of these. */
export const AGENT_SCOPES = ["outreach:read", "outreach:submit", "outreach:enrich", "outreach:audit"] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];

export const AGENT_KEY_PREFIX = "180agent_";

/** A new key. The `key` is shown once and never stored; only the hash and a short display prefix persist. */
export function generateAgentKey(): { key: string; hash: string; prefix: string } {
  const key = `${AGENT_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { key, hash: hashAgentKey(key), prefix: key.slice(0, 12) };
}

export function hashAgentKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** The key from an `Authorization: Bearer <key>` header, or null when the header is missing or shaped wrong. */
export function bearerToken(header: string | null): string | null {
  const match = /^Bearer ([^\s]+)$/.exec(header?.trim() ?? "");
  return match && match[1].startsWith(AGENT_KEY_PREFIX) ? match[1] : null;
}

export interface AgentKeyRecord {
  id: string;
  scopes: string[];
  revokedAt: string | null;
  lastUsedAt: string | null;
}

export interface AgentAuthDeps {
  findKeyByHash(hash: string): Promise<AgentKeyRecord | null>;
  /** Whether the master switch (outreach_agent_enabled) is on. */
  agentEnabled(): Promise<boolean>;
  touch(keyId: string, at: Date): Promise<void>;
  now(): Date;
}

export type AgentAuthResult =
  | { ok: true; keyId: string }
  | { ok: false; status: 401 | 403 | 429; error: "unauthorized" | "agent_disabled" | "missing_scope" | "rate_limited" };

/** The last-used time is only rewritten when it is older than this, so a busy agent doesn't write on every call. */
const TOUCH_EVERY_MS = 60_000;

export interface RateLimiter {
  /** True when this call is allowed. */
  allow(id: string, now: Date): boolean;
}

/**
 * A fixed-window counter held in memory. That is enough at this volume: it only needs to stop a runaway loop, and the
 * batch caps on each endpoint do the real limiting. Each server instance counts separately.
 */
export function createRateLimiter(limit = 60, windowMs = 60_000): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    allow(id, now) {
      const t = now.getTime();
      const w = windows.get(id);
      if (!w || t - w.start >= windowMs) {
        windows.set(id, { start: t, count: 1 });
        return true;
      }
      w.count += 1;
      return w.count <= limit;
    },
  };
}

export const agentRateLimiter = createRateLimiter();

/**
 * Checks the presented key. A bad, missing or revoked key is always the same 401, so a caller learns nothing about which
 * keys exist. Only a valid key can learn that the agent is switched off or that it lacks a scope.
 */
export async function authenticateAgent(
  authorization: string | null,
  scope: AgentScope,
  deps: AgentAuthDeps,
  limiter: RateLimiter = agentRateLimiter,
): Promise<AgentAuthResult> {
  const unauthorized = { ok: false, status: 401, error: "unauthorized" } as const;
  const token = bearerToken(authorization);
  if (!token) return unauthorized;
  const record = await deps.findKeyByHash(hashAgentKey(token));
  if (!record || record.revokedAt) return unauthorized;

  const now = deps.now();
  if (!limiter.allow(record.id, now)) return { ok: false, status: 429, error: "rate_limited" };
  if (!(await deps.agentEnabled())) return { ok: false, status: 403, error: "agent_disabled" };
  if (!record.scopes.includes(scope)) return { ok: false, status: 403, error: "missing_scope" };

  if (!record.lastUsedAt || now.getTime() - new Date(record.lastUsedAt).getTime() > TOUCH_EVERY_MS) {
    // A failed timestamp write must never fail the request.
    await deps.touch(record.id, now).catch((err) => console.error("agent key touch failed:", err));
  }
  return { ok: true, keyId: record.id };
}
