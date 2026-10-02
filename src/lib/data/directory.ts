import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/supabase/database.types";
import { compareByRole } from "@/lib/auth/roles";

export interface DirectoryRow {
  user_id: string;
  name: string;
  role: UserRole;
  project_id: string | null;
  client_name: string | null;
  quarter_id: string | null;
  email: string;
}

/** Everyone's name/role/current team for the given quarter. Members with no team show up too (project_id null). */
export async function getDirectory(activeQuarterId: string | null): Promise<DirectoryRow[]> {
  const supabase = await createClient();
  let query = supabase.from("directory_view").select("*").order("name", { ascending: true });

  query = activeQuarterId
    ? query.or(`quarter_id.eq.${activeQuarterId},quarter_id.is.null`)
    : query.is("quarter_id", null);

  const { data, error } = await query;
  if (error) throw error;
  // Seniority order (exec, PM, SC, consultant); user_id keeps one member's per-project rows together.
  return [...data].sort((a, b) => compareByRole(a, b) || a.user_id.localeCompare(b.user_id));
}
