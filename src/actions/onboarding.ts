"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  error?: string;
}

/** Marks the sidebar tour as seen -- called on finish, skip, or close, whether this is the first run or a manual replay. */
export async function completeOnboarding(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/portal", "layout");
  return {};
}
