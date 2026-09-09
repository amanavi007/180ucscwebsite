"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { logAudit } from "@/lib/audit";
import { invalidateAttendanceThresholdCache } from "@/lib/data/org-settings";

export interface ActionResult {
  error?: string;
}

/** `percent` is 0-100 as entered in the UI; stored as a 0-1 decimal string. RLS restricts this to exec. */
export async function updateAttendanceAlertThreshold(percent: number): Promise<ActionResult> {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return { error: "Enter a percentage between 0 and 100." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("org_settings")
    .update({ value: String(percent / 100) })
    .eq("key", "attendance_alert_threshold");

  if (error) return { error: error.message };

  const actor = await getCurrentProfile();
  await logAudit(actor.id, "settings.attendance_threshold_changed", undefined, `Set to ${percent}%`);

  invalidateAttendanceThresholdCache();
  revalidatePath("/portal/admin");
  revalidatePath("/portal");
  revalidatePath("/portal/directory");
  revalidatePath("/portal/attendance");
  return {};
}

/** The shared temp password new/reset accounts get before being forced to set their own. RLS restricts this to exec. */
export async function updateDefaultBulkPassword(password: string): Promise<ActionResult> {
  if (password.length < 8) {
    return { error: "Use at least 8 characters." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("org_settings")
    .upsert({ key: "default_bulk_password", value: password }, { onConflict: "key" });

  if (error) return { error: error.message };

  // Deliberately don't log the new value -- just that it changed.
  const actor = await getCurrentProfile();
  await logAudit(actor.id, "settings.default_password_changed");

  revalidatePath("/portal/admin");
  return {};
}
