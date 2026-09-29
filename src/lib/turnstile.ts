import "server-only";

export function isTurnstileResponseValid(json: unknown): boolean {
  if (typeof json !== "object" || json === null) return false;
  return (json as { success?: unknown }).success === true;
}

/** Verifies a Turnstile client token server-side. Never trust the client-side widget alone. */
export async function verifyTurnstileToken(token: string, remoteIp?: string): Promise<boolean> {
  if (!token) return false;

  const body = new URLSearchParams({
    secret: process.env.TURNSTILE_SECRET_KEY!,
    response: token,
  });
  if (remoteIp) body.set("remoteip", remoteIp);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });
  const json = await response.json();
  return isTurnstileResponseValid(json);
}
