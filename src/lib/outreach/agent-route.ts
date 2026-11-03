import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAuthDeps } from "@/lib/data/outreach-agent";
import { authenticateAgent, type AgentScope } from "./agent-auth";

type Admin = ReturnType<typeof createAdminClient>;

const MAX_BODY_CHARS = 1_000_000;

/** Thrown for a body that is not JSON or is too large; answered as a 400. */
class BadBody extends Error {}

export async function readJson(request: Request): Promise<unknown> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) throw new BadBody("too large");
  try {
    return JSON.parse(raw);
  } catch {
    throw new BadBody("not json");
  }
}

/** Like readJson, but an empty body is an empty object (for calls whose body is all optional). */
export async function readOptionalJson(request: Request): Promise<unknown> {
  const raw = await request.text();
  if (raw.trim() === "") return {};
  if (raw.length > MAX_BODY_CHARS) throw new BadBody("too large");
  try {
    return JSON.parse(raw);
  } catch {
    throw new BadBody("not json");
  }
}

/**
 * Wraps an agent endpoint: checks the key and its scope, then runs the handler. Errors never leak details to the caller.
 * No CORS headers are sent: the agent is a server, not a browser page.
 */
export async function agentRoute(
  request: Request,
  scope: AgentScope,
  handler: (ctx: { admin: Admin; keyId: string }) => Promise<Response>,
): Promise<Response> {
  const admin = createAdminClient();
  try {
    const auth = await authenticateAgent(request.headers.get("authorization"), scope, buildAuthDeps(admin));
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    return await handler({ admin, keyId: auth.keyId });
  } catch (err) {
    if (err instanceof BadBody) return Response.json({ error: "invalid_body" }, { status: 400 });
    console.error("outreach agent api failed:", err);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
