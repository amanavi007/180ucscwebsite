import "server-only";
import { createClient } from "@/lib/supabase/server";
import { computeProjectHealth } from "@/lib/project-health";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TaskStatus } from "@/lib/supabase/database.types";
import type { ProjectWithRelations, ProjectWithQuarter, MembershipWithProfile } from "./types";

/**
 * The stored `health` column is only ever set at insert time and never kept
 * in sync, so replace it with the live value (same logic as the project
 * detail page) whenever projects are listed.
 */
async function withComputedHealth<T extends ProjectWithRelations>(
  supabase: SupabaseClient<Database>,
  projects: T[],
): Promise<T[]> {
  if (projects.length === 0) return projects;

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("project_id, status, due_date")
    .in(
      "project_id",
      projects.map((p) => p.id),
    );
  if (error) throw error;

  const tasksByProject = new Map<string, { status: TaskStatus; due_date: string | null }[]>();
  for (const task of tasks ?? []) {
    const list = tasksByProject.get(task.project_id) ?? [];
    list.push(task);
    tasksByProject.set(task.project_id, list);
  }

  return projects.map((project) => ({
    ...project,
    health: computeProjectHealth(project, tasksByProject.get(project.id) ?? []),
  }));
}

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
  return withComputedHealth(supabase, data as unknown as ProjectWithRelations[]);
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

/** Projects this member is on (via memberships, which PM/SC are auto-added to) for a quarter. */
export async function getMyProjects(
  userId: string,
  quarterId: string,
): Promise<ProjectWithRelations[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select(
      "project:projects!inner(*, project_manager:profiles!projects_project_manager_id_fkey(id,name), senior_consultant:profiles!projects_senior_consultant_id_fkey(id,name))",
    )
    .eq("user_id", userId)
    .eq("project.quarter_id", quarterId);

  if (error) throw error;
  const projects = (data as unknown as { project: ProjectWithRelations }[]).map(
    (row) => row.project,
  );
  return withComputedHealth(supabase, projects);
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
