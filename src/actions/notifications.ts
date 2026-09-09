"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { getMyNotifications, type NotificationFeed } from "@/lib/data/notifications";
import { isExec } from "@/lib/auth/roles";

export async function markNotificationsRead(): Promise<void> {
  const profile = await getCurrentProfile();
  const supabase = await createClient();
  await supabase
    .from("notification_reads")
    .upsert({ user_id: profile.id, last_read_at: new Date().toISOString() }, { onConflict: "user_id" });
}

/**
 * Fetched client-side on mount instead of blocking the shared layout render --
 * notifications are the same on every route, so there's no reason for their
 * ~5 queries to sit in the critical path of every single tab navigation.
 */
export async function getMyNotificationsAction(): Promise<NotificationFeed> {
  const profile = await getCurrentProfile();
  return getMyNotifications(profile.id, isExec(profile.role));
}
