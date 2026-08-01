import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/supabase/database.types";

export interface AlumniProject {
  projectId: string;
  clientName: string;
  quarterName: string | null;
}

export interface AlumniProfile {
  userId: string;
  name: string;
  role: UserRole;
  email: string;
  archivedAt: string;
  currentTitle: string | null;
  currentCompany: string | null;
  linkedinUrl: string | null;
  projects: AlumniProject[];
}

/** Graduated members, open to the whole org (not exec-gated) -- see alumni_view. */
export async function getAlumni(): Promise<AlumniProfile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("alumni_view")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;

  const byUser = new Map<string, AlumniProfile>();
  for (const row of data) {
    let profile = byUser.get(row.user_id);
    if (!profile) {
      profile = {
        userId: row.user_id,
        name: row.name,
        role: row.role,
        email: row.email,
        archivedAt: row.archived_at,
        currentTitle: row.current_title,
        currentCompany: row.current_company,
        linkedinUrl: row.linkedin_url,
        projects: [],
      };
      byUser.set(row.user_id, profile);
    }
    if (row.project_id && row.client_name) {
      profile.projects.push({
        projectId: row.project_id,
        clientName: row.client_name,
        quarterName: row.quarter_name,
      });
    }
  }
  return [...byUser.values()];
}
