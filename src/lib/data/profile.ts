import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

/**
 * Current user's profile. Assumes middleware already enforced auth + forced-reset gating.
 * Wrapped in React's `cache()` so the auth check + profile query run once per request no
 * matter how many layouts/pages call this -- every page under portal/(app) calls it
 * independently, on top of the shared layout already calling it.
 *
 * Uses `getClaims()` instead of `getUser()`: this project signs JWTs with an asymmetric
 * key, so `getClaims()` verifies the token locally (WebCrypto) against a cached JWKS
 * instead of making a network round trip to the Auth server on every single call --
 * measured at ~300ms/call for `getUser()` vs ~2ms for `getClaims()` once the JWKS is
 * cached (a one-time ~700ms fetch per server process lifetime).
 */
export const getCurrentProfile = cache(async function getCurrentProfile(): Promise<Profile> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !profile) {
    redirect("/login");
  }

  return profile;
});

/**
 * Same lookup as `getCurrentProfile`, but returns null instead of redirecting
 * when signed out -- for pages that render for both logged-in and logged-out
 * visitors (the marketing site), where a hard redirect would be wrong.
 */
export const getOptionalProfile = cache(async function getOptionalProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single();
  return profile ?? null;
});
