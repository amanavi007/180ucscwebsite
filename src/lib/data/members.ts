import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getAllProfiles() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, role, email")
    .order("name", { ascending: true });

  if (error) throw error;
  return data;
}
