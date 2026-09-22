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

async function nextOrderIndex(
  supabase: Awaited<ReturnType<typeof createClient>>,
  section: WikiSection,
  parentId: string | null,
): Promise<number> {
  let query = supabase
    .from("wiki_pages")
    .select("order_index")
    .eq("section", section)
    .order("order_index", { ascending: false })
    .limit(1);
  query = parentId === null ? query.is("parent_id", null) : query.eq("parent_id", parentId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return (data?.order_index ?? -1) + 1;
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
  const orderIndex = await nextOrderIndex(supabase, input.section, input.parentId);
  const { data, error } = await supabase
    .from("wiki_pages")
    .insert({
      section: input.section,
      parent_id: input.parentId,
      title: input.title,
      slug: input.slug,
      body: input.body,
      order_index: orderIndex,
      created_by: access.profile.id,
      updated_by: access.profile.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/portal/resources");
  return { id: data.id };
}

export async function moveWikiPage(
  pageId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  const access = await requireExec();
  if (access.error) return { error: access.error };

  const supabase = await createClient();
  const { data: page, error: pageError } = await supabase
    .from("wiki_pages")
    .select("id, section, parent_id, order_index")
    .eq("id", pageId)
    .single();
  if (pageError) return { error: pageError.message };

  let siblingQuery = supabase
    .from("wiki_pages")
    .select("id, order_index")
    .eq("section", page.section)
    .order("order_index", { ascending: true });
  siblingQuery =
    page.parent_id === null
      ? siblingQuery.is("parent_id", null)
      : siblingQuery.eq("parent_id", page.parent_id);

  const { data: siblings, error: siblingsError } = await siblingQuery;
  if (siblingsError) return { error: siblingsError.message };

  const index = siblings.findIndex((s) => s.id === pageId);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || targetIndex < 0 || targetIndex >= siblings.length) {
    return {};
  }

  const target = siblings[targetIndex];
  const [firstUpdate, secondUpdate] = await Promise.all([
    supabase.from("wiki_pages").update({ order_index: target.order_index }).eq("id", pageId),
    supabase.from("wiki_pages").update({ order_index: page.order_index }).eq("id", target.id),
  ]);
  if (firstUpdate.error) return { error: firstUpdate.error.message };
  if (secondUpdate.error) return { error: secondUpdate.error.message };

  revalidatePath("/portal/resources");
  return {};
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

  revalidatePath("/portal/resources");
  return {};
}

export async function deleteWikiPage(pageId: string): Promise<ActionResult> {
  const access = await requireExec();
  if (access.error) return { error: access.error };

  const supabase = await createClient();
  const { error } = await supabase.from("wiki_pages").delete().eq("id", pageId);
  if (error) return { error: error.message };

  revalidatePath("/portal/resources");
  return {};
}
