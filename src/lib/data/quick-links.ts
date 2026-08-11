import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type QuickLink = Database["public"]["Tables"]["quick_links"]["Row"];

export async function getQuickLinks(): Promise<QuickLink[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quick_links")
    .select("*")
    .order("category", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });

  if (error) throw error;
  return data;
}
