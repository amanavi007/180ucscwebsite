import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type Quarter = Database["public"]["Tables"]["quarters"]["Row"];

export async function getQuarters() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quarters")
    .select("*")
    .order("start_date", { ascending: false });

  if (error) throw error;
  return data;
}

// The active quarter changes at most a handful of times a term, and its RLS
// policy (`to authenticated using (true)`) makes it identical for every
// signed-in user -- there's no per-user variation to lose by sharing one
// cached value across requests. This turns a ~300ms round trip that ran on
// nearly every portal page load into a cache hit for most of them.
const ACTIVE_QUARTER_TTL_MS = 30_000;
let activeQuarterCache: { value: Quarter | null; expiresAt: number } | null = null;

export async function getActiveQuarter(): Promise<Quarter | null> {
  if (activeQuarterCache && Date.now() < activeQuarterCache.expiresAt) {
    return activeQuarterCache.value;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quarters")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;

  activeQuarterCache = { value: data, expiresAt: Date.now() + ACTIVE_QUARTER_TTL_MS };
  return data;
}

/** Call after any mutation that could change which quarter is active. */
export function invalidateActiveQuarterCache() {
  activeQuarterCache = null;
}
