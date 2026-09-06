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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPortalPath = path === PORTAL_PREFIX || path.startsWith(`${PORTAL_PREFIX}/`);
  const isLoginPath = path === "/login";

  // Only /portal (the member operations tool) requires auth -- everything
  // else (marketing site, login) is public by default.
  if (!user && isPortalPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isLoginPath) {
    const url = request.nextUrl.clone();
    url.pathname = PORTAL_PREFIX;
    return NextResponse.redirect(url);
  }

  if (user && isPortalPath && path !== `${PORTAL_PREFIX}/force-password-reset`) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("must_reset_password")
      .eq("id", user.id)
      .single();

    if (profile?.must_reset_password) {
      const url = request.nextUrl.clone();
      url.pathname = `${PORTAL_PREFIX}/force-password-reset`;
      return NextResponse.redirect(url);
    }
  }

  return response;
}
