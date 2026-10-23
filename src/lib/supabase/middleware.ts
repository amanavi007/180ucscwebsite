import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

const PORTAL_PREFIX = "/portal";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getClaims() verifies the JWT locally against a cached JWKS (this project uses
  // asymmetric signing keys) instead of round-tripping to the Auth server on every
  // request like getUser() does -- ~300ms vs ~2ms once the JWKS is cached.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  const path = request.nextUrl.pathname;
  const isPortalPath = path === PORTAL_PREFIX || path.startsWith(`${PORTAL_PREFIX}/`);
  const isLoginPath = path === "/login";

  // Only /portal (the member operations tool) requires auth -- everything
  // else (marketing site, login) is public by default.
  if (!userId && isPortalPath) {
    // Leftover Supabase auth cookies mean they were signed in and the session ran out,
    // as opposed to someone who never signed in.
    const hadSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
    const url = request.nextUrl.clone();
    url.pathname = hadSession ? "/session-expired" : "/login";
    return NextResponse.redirect(url);
  }

  if (userId && isLoginPath) {
    const url = request.nextUrl.clone();
    url.pathname = PORTAL_PREFIX;
    return NextResponse.redirect(url);
  }

  // The must_reset_password gate lives in `(app)/layout.tsx` instead of here:
  // proxy is meant for fast, JWT-only checks (Next.js docs: "not intended for
  // slow data fetching"), and the layout already loads the full profile row
  // via `getCurrentProfile()`, so checking it there is free -- doing it here
  // too would add a second DB round trip to every single portal navigation.

  return response;
}
