import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ProjectWithRelations, ProjectWithQuarter, MembershipWithProfile } from "./types";

export async function getProjects(quarterId?: string): Promise<ProjectWithRelations[]> {
  const supabase = await createClient();
  let query = supabase
    .from("projects")
    .select(
      "*, project_manager:profiles!projects_project_manager_id_fkey(id,name), senior_consultant:profiles!projects_senior_consultant_id_fkey(id,name)",
    )
    .order("client_name", { ascending: true });

  if (quarterId) {
    query = query.eq("quarter_id", quarterId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as ProjectWithRelations[];
}

export async function getProject(id: string): Promise<ProjectWithQuarter> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(
      "*, project_manager:profiles!projects_project_manager_id_fkey(id,name), senior_consultant:profiles!projects_senior_consultant_id_fkey(id,name), quarter:quarters(id,name)",
    )
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as unknown as ProjectWithQuarter;
}

export async function getProjectMembers(projectId: string): Promise<MembershipWithProfile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("id, user_id, profile:profiles(id,name,role,email)")
    .eq("project_id", projectId);

  if (error) throw error;
  return data as unknown as MembershipWithProfile[];
}
