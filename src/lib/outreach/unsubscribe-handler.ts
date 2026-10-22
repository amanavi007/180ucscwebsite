import { verifyUnsubscribeToken } from "./unsubscribe";

export interface UnsubscribeHandlerDeps {
  secret: string;
  siteUrl: string;
  /** Must be idempotent. */
  unsubscribe(prospectId: string): Promise<void>;
}

async function tokenFromPost(request: Request): Promise<string | null> {
  const fromQuery = new URL(request.url).searchParams.get("token");
  if (fromQuery) return fromQuery;
  try {
    const body = await request.formData();
    const t = body.get("token");
    return typeof t === "string" ? t : null;
  } catch {
    return null;
  }
}

/**
 * GET only redirects to the confirm page, because mail scanners prefetch links and must never unsubscribe anyone.
 * POST (RFC 8058 one-click, or the confirm form) does the work. A POST always answers 200 so a probe cannot learn
 * which tokens are real.
 */
export async function handleUnsubscribeRequest(request: Request, deps: UnsubscribeHandlerDeps): Promise<Response> {
  if (request.method === "GET") {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    return Response.redirect(`${deps.siteUrl}/unsubscribe?token=${encodeURIComponent(token)}`, 303);
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const token = await tokenFromPost(request);
  const prospectId = token ? verifyUnsubscribeToken(token, deps.secret) : null;
  if (prospectId) await deps.unsubscribe(prospectId);
  return Response.json({ ok: true });
}
