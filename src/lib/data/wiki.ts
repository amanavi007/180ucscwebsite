import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { WikiSection } from "@/lib/supabase/database.types";
import type { WikiPageWithAuthor } from "./types";

export async function getWikiPages(section: WikiSection): Promise<WikiPageWithAuthor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wiki_pages")
    .select("*, updated_by_profile:profiles!wiki_pages_updated_by_fkey(id,name)")
    .eq("section", section)
    .order("order_index", { ascending: true });

  if (error) throw error;
  return data as unknown as WikiPageWithAuthor[];
}
