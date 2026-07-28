import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getQuarters() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quarters")
    .select("*")
    .order("start_date", { ascending: false });

  if (error) throw error;
  return data;
}

export async function getActiveQuarter() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quarters")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return data;
}
