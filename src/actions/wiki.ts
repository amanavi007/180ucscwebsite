"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import type { WikiSection } from "@/lib/supabase/database.types";

export interface ActionResult {
  error?: string;
  id?: string;
}

async function requireExec() {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) {
    return { error: "Only exec can edit Resources.", profile } as const;
  }
  return { error: undefined, profile } as const;
}

export async function createWikiPage(input: {
  section: WikiSection;
  parentId: string | null;
  title: string;
  slug: string;
  body: string;
}): Promise<ActionResult> {
  const access = await requireExec();
  if (access.error) return { error: access.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wiki_pages")
    .insert({
      section: input.section,
      parent_id: input.parentId,
      title: input.title,
      slug: input.slug,
      body: input.body,
      created_by: access.profile.id,
      updated_by: access.profile.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/resources");
  return { id: data.id };
}

export async function updateWikiPage(
  pageId: string,
  input: { title: string; slug: string; parentId: string | null; body: string },
): Promise<ActionResult> {
  const access = await requireExec();
  if (access.error) return { error: access.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("wiki_pages")
    .update({
      title: input.title,
      slug: input.slug,
      parent_id: input.parentId,
      body: input.body,
      updated_by: access.profile.id,
    })
    .eq("id", pageId);

  if (error) return { error: error.message };

  revalidatePath("/resources");
  return {};
}

export async function deleteWikiPage(pageId: string): Promise<ActionResult> {
  const access = await requireExec();
  if (access.error) return { error: access.error };

  const supabase = await createClient();
  const { error } = await supabase.from("wiki_pages").delete().eq("id", pageId);
  if (error) return { error: error.message };

  revalidatePath("/resources");
  return {};
}
