"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";

export interface ActionResult {
  error?: string;
}

async function requireExec() {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) {
    return { error: "Only exec can manage quarters." } as ActionResult;
  }
  return null;
}

export async function createQuarter(input: {
  name: string;
  startDate: string;
  endDate: string;
  makeActive: boolean;
}): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied) return denied;

  const supabase = await createClient();

  if (input.makeActive) {
    await supabase.from("quarters").update({ is_active: false }).eq("is_active", true);
  }

  const { error } = await supabase.from("quarters").insert({
    name: input.name,
    start_date: input.startDate,
    end_date: input.endDate,
    is_active: input.makeActive,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return {};
}

export async function setActiveQuarter(quarterId: string): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied) return denied;

  const supabase = await createClient();

  await supabase.from("quarters").update({ is_active: false }).eq("is_active", true);
  const { error } = await supabase
    .from("quarters")
    .update({ is_active: true })
    .eq("id", quarterId);

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return {};
}

export async function deactivateQuarter(quarterId: string): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied) return denied;

  const supabase = await createClient();
  const { error } = await supabase
    .from("quarters")
    .update({ is_active: false })
    .eq("id", quarterId);

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return {};
}

export async function updateQuarter(
  quarterId: string,
  input: { name: string; startDate: string; endDate: string },
): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied) return denied;

  const supabase = await createClient();
  const { error } = await supabase
    .from("quarters")
    .update({ name: input.name, start_date: input.startDate, end_date: input.endDate })
    .eq("id", quarterId);

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return {};
}

export async function deleteQuarter(quarterId: string): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied) return denied;

  const supabase = await createClient();
  const { error } = await supabase.from("quarters").delete().eq("id", quarterId);

  if (error) {
    if (error.code === "23503") {
      return {
        error: "Can't delete this quarter — it still has projects linked to it.",
      };
    }
    return { error: error.message };
  }

  revalidatePath("/admin");
  return {};
}
