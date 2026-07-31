import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Active members only -- feeds every directory/search/assignment picker in the app. */
export async function getAllProfiles() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, role, email")
    .is("archived_at", null)
    .order("name", { ascending: true });

  if (error) throw error;
  return data;
}

/** Archived members, most recently archived first -- feeds the collapsed section in Admin > Members. */
export async function getArchivedProfiles() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, role, email, archived_at")
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });

  if (error) throw error;
  return data;
}
