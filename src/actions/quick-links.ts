"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";

export interface ActionResult {
  error?: string;
  id?: string;
}

async function requireExec() {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) {
    return { error: "Only exec can edit Quick Links.", profile } as const;
  }
  return { error: undefined, profile } as const;
}

export interface QuickLinkInput {
  title: string;
  url: string;
  description: string;
  category: string;
}

export async function createQuickLink(input: QuickLinkInput): Promise<ActionResult> {
  const access = await requireExec();
  if (access.error) return { error: access.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quick_links")
    .insert({
      title: input.title,
      url: input.url,
      description: input.description || null,
      category: input.category || null,
      created_by: access.profile.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/quick-links");
  return { id: data.id };
}

export async function updateQuickLink(linkId: string, input: QuickLinkInput): Promise<ActionResult> {
  const access = await requireExec();
  if (access.error) return { error: access.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("quick_links")
    .update({
      title: input.title,
      url: input.url,
      description: input.description || null,
      category: input.category || null,
    })
    .eq("id", linkId);

  if (error) return { error: error.message };

  revalidatePath("/quick-links");
  return {};
}

export async function deleteQuickLink(linkId: string): Promise<ActionResult> {
  const access = await requireExec();
  if (access.error) return { error: access.error };

  const supabase = await createClient();
  const { error } = await supabase.from("quick_links").delete().eq("id", linkId);
  if (error) return { error: error.message };

  revalidatePath("/quick-links");
  return {};
}
