import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { MEETING_TIME_KEYS, parseMeetingTime, type MeetingTime } from "@/lib/meeting-time";

/**
 * The time every meeting day runs. Read with the service-role client because the org_settings table is exec-only
 * under RLS, but everyone sees meeting days on the calendar and Home. Never throws: no time just means all-day.
 */
export async function getMeetingTime(): Promise<MeetingTime | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("org_settings")
      .select("key, value")
      .in("key", [MEETING_TIME_KEYS.start, MEETING_TIME_KEYS.end]);
    if (error) throw error;
    return parseMeetingTime(data ?? []);
  } catch (err) {
    console.error("getMeetingTime failed:", err);
    return null;
  }
}
