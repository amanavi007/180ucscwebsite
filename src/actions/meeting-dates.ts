"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";

export interface ActionResult {
  error?: string;
}

async function requireExec() {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) {
    return { error: "Only exec can do that.", profile } as const;
  }
  return { error: undefined, profile } as const;
}

/** Full replace: this quarter's meeting days become exactly this list. */
export async function setMeetingDatesForQuarter(
  quarterId: string,
  dates: string[],
): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };

  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("meeting_dates")
    .delete()
    .eq("quarter_id", quarterId);
  if (deleteError) return { error: deleteError.message };

  if (dates.length > 0) {
    const { error: insertError } = await supabase
      .from("meeting_dates")
      .insert(dates.map((date) => ({ quarter_id: quarterId, date })));
    if (insertError) return { error: insertError.message };
  }

  await logAudit(
    denied.profile.id,
    "meeting_dates.updated",
    undefined,
    `${dates.length} meeting day(s) set`,
  );

  revalidatePath("/admin/meeting-days");
  revalidatePath("/attendance");
  revalidatePath("/");
  return {};
}
