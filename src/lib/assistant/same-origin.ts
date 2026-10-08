/** Same-origin only. Cookies are SameSite=Lax already; this is the second lock against cross-site forged approvals. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // non-browser callers carry no origin; they still need the session cookie
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
}
