"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";

export async function markNotificationsRead(): Promise<void> {
  const profile = await getCurrentProfile();
  const supabase = await createClient();
  await supabase
    .from("notification_reads")
    .upsert({ user_id: profile.id, last_read_at: new Date().toISOString() }, { onConflict: "user_id" });
}
