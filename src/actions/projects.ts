"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import type { ProjectHealth, ProjectStatus } from "@/lib/supabase/database.types";

export interface ActionResult {
  error?: string;
}

async function requireExec() {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) {
    return { error: "Only exec can do that.", profile } as const;
  }
  return { error: undefined, profile } as const;
}

/** Exec can edit any project; a project's own PM/SC can edit their project. */
async function requireProjectEditAccess(projectId: string) {
  const profile = await getCurrentProfile();
  if (isExec(profile.role)) return { error: undefined, profile } as const;

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("project_manager_id, senior_consultant_id")
    .eq("id", projectId)
    .single();

  const leads =
    project &&
    (project.project_manager_id === profile.id || project.senior_consultant_id === profile.id);

  if (!leads) {
    return { error: "You don't have permission to edit this project.", profile } as const;
  }
  return { error: undefined, profile } as const;
}

/** Make sure a user assigned as PM/SC also has a membership row, so they show up in the roster/directory. */
async function ensureMembership(projectId: string, userId: string | null | undefined) {
  if (!userId) return;
  const supabase = await createClient();
  await supabase
    .from("memberships")
    .upsert({ project_id: projectId, user_id: userId }, { onConflict: "project_id,user_id" });
}

export async function createProject(input: {
  clientName: string;
  quarterId: string;
  projectManagerId?: string | null;
  seniorConsultantId?: string | null;
  industry?: string;
  startDate?: string | null;
  deadline?: string | null;
  deliverableLink?: string;
  memberIds: string[];
}): Promise<ActionResult & { id?: string }> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      client_name: input.clientName,
      quarter_id: input.quarterId,
      project_manager_id: input.projectManagerId || null,
      senior_consultant_id: input.seniorConsultantId || null,
      industry: input.industry || null,
      start_date: input.startDate || null,
      deadline: input.deadline || null,
      deliverable_link: input.deliverableLink || null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const memberIds = new Set(input.memberIds);
  if (input.projectManagerId) memberIds.add(input.projectManagerId);
  if (input.seniorConsultantId) memberIds.add(input.seniorConsultantId);

  if (memberIds.size > 0) {
    const { error: membershipError } = await supabase
      .from("memberships")
      .insert([...memberIds].map((user_id) => ({ project_id: data.id, user_id })));
    if (membershipError) return { error: membershipError.message };
  }

  revalidatePath("/projects");
  return { id: data.id };
}

export async function updateProject(
  id: string,
  input: {
    clientName: string;
    status: ProjectStatus;
    projectManagerId?: string | null;
    seniorConsultantId?: string | null;
    industry?: string;
    startDate?: string | null;
    deadline?: string | null;
    deliverableLink?: string;
  },
): Promise<ActionResult> {
  const denied = await requireProjectEditAccess(id);
  if (denied.error) return { error: denied.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({
      client_name: input.clientName,
      status: input.status,
      project_manager_id: input.projectManagerId || null,
      senior_consultant_id: input.seniorConsultantId || null,
      industry: input.industry || null,
      start_date: input.startDate || null,
      deadline: input.deadline || null,
      deliverable_link: input.deliverableLink || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  await ensureMembership(id, input.projectManagerId);
  await ensureMembership(id, input.seniorConsultantId);

  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return {};
}

export async function updateProjectStatus(
  id: string,
  status: ProjectStatus,
): Promise<ActionResult> {
  const denied = await requireProjectEditAccess(id);
  if (denied.error) return { error: denied.error };

  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ status }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return {};
}

export async function setHealthOverride(
  id: string,
  health: ProjectHealth | null,
): Promise<ActionResult> {
  const denied = await requireProjectEditAccess(id);
  if (denied.error) return { error: denied.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ health_manual_override: health })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/projects/${id}`);
  return {};
}

export async function addMember(projectId: string, userId: string): Promise<ActionResult> {
  const denied = await requireProjectEditAccess(projectId);
  if (denied.error) return { error: denied.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("memberships")
    .insert({ project_id: projectId, user_id: userId });
  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}`);
  return {};
}

export async function removeMember(projectId: string, userId: string): Promise<ActionResult> {
  const denied = await requireProjectEditAccess(projectId);
  if (denied.error) return { error: denied.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("memberships")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}`);
  return {};
}
