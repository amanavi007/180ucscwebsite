"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";

/** Exec-only. Removes the review record from the portal; the Drive file is never touched. */
export async function deletePrelimReview(id: string): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) return { error: "Only exec can do that." };
  if (!z.uuid().safeParse(id).success) return { error: "Unknown review." };

  const supabase = await createClient();
  // RLS silently filters rows the caller cannot delete, so ask for the deleted rows back.
  const { data, error } = await supabase.from("prelim_reviews").delete().eq("id", id).select("file_name");
  if (error || !data || data.length === 0) return { error: "Could not delete that review. It may already be gone." };

  await logAudit(profile.id, "prelim_review.delete", data[0].file_name);
  revalidatePath("/portal/prelim-review");
  return {};
}
