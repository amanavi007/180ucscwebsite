import "server-only";
import { createClient } from "@/lib/supabase/server";

export const DEFAULT_ATTENDANCE_ALERT_THRESHOLD = 0.8;
const FALLBACK_BULK_PASSWORD = "ucsc180dc$";

// RLS on org_settings is exec-only, so a non-exec caller's query is always
// silently filtered to nothing and falls back to the default below anyway --
// skip the round trip for them entirely instead of paying for a query whose
// result RLS was always going to discard. The short cache below only ever
// gets read on the exec path, so it can't leak the real value to non-exec
// callers.
const THRESHOLD_TTL_MS = 30_000;
let thresholdCache: { value: number; expiresAt: number } | null = null;

/** Exec-only (RLS-restricted); falls back to the default if unset, unreadable, or the caller isn't exec. */
export async function getAttendanceAlertThreshold(isExecUser: boolean): Promise<number> {
  if (!isExecUser) return DEFAULT_ATTENDANCE_ALERT_THRESHOLD;

  if (thresholdCache && Date.now() < thresholdCache.expiresAt) {
    return thresholdCache.value;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("org_settings")
    .select("value")
    .eq("key", "attendance_alert_threshold")
    .maybeSingle();

  const parsed = data ? Number(data.value) : NaN;
  const value = Number.isFinite(parsed) ? parsed : DEFAULT_ATTENDANCE_ALERT_THRESHOLD;

  thresholdCache = { value, expiresAt: Date.now() + THRESHOLD_TTL_MS };
  return value;
}

/** Call after any mutation that could change the attendance alert threshold. */
export function invalidateAttendanceThresholdCache() {
  thresholdCache = null;
}

/** The shared temp password new/reset accounts get before being forced to set their own. */
export async function getDefaultBulkPassword(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_settings")
    .select("value")
    .eq("key", "default_bulk_password")
    .maybeSingle();

  return data?.value || FALLBACK_BULK_PASSWORD;
}
