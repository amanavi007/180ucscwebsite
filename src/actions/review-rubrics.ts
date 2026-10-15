"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/data/profile";
import { getCurrentRubric } from "@/lib/data/prelim-review";
import { isExec } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import { parseCriteriaText } from "@/lib/prelim-review/rubric-form";
import { KIND_LABELS, REVIEW_KINDS, type ReviewKind } from "@/lib/prelim-review/rubric";

export async function saveRubric(kind: ReviewKind, criteriaText: string, guideText: string): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) return { error: "Only exec can do that." };
  if (!REVIEW_KINDS.includes(kind)) return { error: "Unknown rubric." };
  const parsed = parseCriteriaText(criteriaText);
  if (!parsed.ok) return { error: parsed.error };
  if (guideText.length > 20000) return { error: "The formatting guide is too long. Keep it under 20,000 characters." };

  const current = await getCurrentRubric(kind);
  const supabase = await createClient();
  const { error } = await supabase.from("review_rubrics").insert({
    kind,
    version: current.version + 1,
    criteria: parsed.criteria,
    guide_text: guideText.trim(),
    created_by: profile.id,
  });
  if (error) return { error: "Could not save the rules. If someone else just saved, reload and try again." };
  await logAudit(profile.id, "review_rubric.save", KIND_LABELS[kind], `version ${current.version + 1}`);
  revalidatePath("/portal/admin/review-rules");
  return {};
}
