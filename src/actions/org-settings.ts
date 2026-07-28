"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/directory");
  revalidatePath("/attendance");
  return {};
}
