"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import { MEETING_TIME_KEYS, validateMeetingTime } from "@/lib/meeting-time";

export interface ActionResult {
  error?: string;
}

function revalidateAll() {
  revalidatePath("/portal");
  revalidatePath("/portal/calendar");
  revalidatePath("/portal/admin");
  revalidatePath("/portal/admin/meeting-days");
}

/** Sets the time every meeting day runs. Exec only. */
export async function saveMeetingTimeAction(input: { start: string; end: string }): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) return { error: "Only exec can do that." };
  const problem = validateMeetingTime(String(input?.start ?? ""), String(input?.end ?? ""));
  if (problem) return { error: problem };

  const admin = createAdminClient();
  const { error } = await admin.from("org_settings").upsert(
    [
      { key: MEETING_TIME_KEYS.start, value: input.start },
      { key: MEETING_TIME_KEYS.end, value: input.end },
    ],
    { onConflict: "key" },
  );
  if (error) return { error: error.message };

  await logAudit(profile.id, "settings.meeting_time_changed", undefined, `Set to ${input.start} to ${input.end}`);
  revalidateAll();
  return {};
}

/** Back to all-day meeting days. Exec only. */
export async function clearMeetingTimeAction(): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) return { error: "Only exec can do that." };
  const admin = createAdminClient();
  const { error } = await admin.from("org_settings").delete().in("key", [MEETING_TIME_KEYS.start, MEETING_TIME_KEYS.end]);
  if (error) return { error: error.message };
  await logAudit(profile.id, "settings.meeting_time_changed", undefined, "Cleared");
  revalidateAll();
  return {};
}
