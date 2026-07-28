import "server-only";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_ATTENDANCE_ALERT_THRESHOLD = 0.8;

/** Exec-only (RLS-restricted); falls back to the default if unset or unreadable. */
export async function getAttendanceAlertThreshold(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_settings")
    .select("value")
    .eq("key", "attendance_alert_threshold")
    .maybeSingle();

  const parsed = data ? Number(data.value) : NaN;
  return Number.isFinite(parsed) ? parsed : DEFAULT_ATTENDANCE_ALERT_THRESHOLD;
}
