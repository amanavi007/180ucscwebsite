"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { isProjectLead } from "@/lib/auth/project-access";
import { logAudit } from "@/lib/audit";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ProjectHealth, ProjectStatus } from "@/lib/supabase/database.types";

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
  const leads = await isProjectLead(projectId, profile.id, isExec(profile.role));

  if (!leads) {
    return { error: "You don't have permission to edit this project.", profile } as const;
  }
  return { error: undefined, profile } as const;
}

/**
 * The single-select PM/SC dropdowns (project-header.tsx, new-project-dialog.tsx)
 * express "this one person is the PM" -- demote whoever currently holds the role,
 * then hand it to the new pick. `team_role` memberships are the source of truth;
 * `projects.project_manager_id`/`senior_consultant_id` are kept in sync by a DB
 * trigger. Adding a *second* PM/SC without demoting the first is only exposed via
 * the Team Builder's `assignToTeam`.
 */
async function reconcileLead(
  supabase: SupabaseClient<Database>,
  projectId: string,
  role: "pm" | "sc",
  userId: string | null | undefined,
) {
  await supabase
    .from("memberships")
    .update({ team_role: "member" })
    .eq("project_id", projectId)
    .eq("team_role", role);

  if (!userId) return;

  await supabase
    .from("memberships")
    .upsert(
      { project_id: projectId, user_id: userId, team_role: role },
      { onConflict: "project_id,user_id" },
    );
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
      industry: input.industry || null,
      start_date: input.startDate || null,
      deadline: input.deadline || null,
      deliverable_link: input.deliverableLink || null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const roles = new Map<string, "pm" | "sc" | "member">();
  for (const memberId of input.memberIds) roles.set(memberId, "member");
  if (input.projectManagerId) roles.set(input.projectManagerId, "pm");
  if (input.seniorConsultantId) roles.set(input.seniorConsultantId, "sc");

  if (roles.size > 0) {
    const { error: membershipError } = await supabase.from("memberships").insert(
      [...roles].map(([user_id, team_role]) => ({
        project_id: data.id,
        user_id,
        team_role,
      })),
    );
    if (membershipError) return { error: membershipError.message };
  }

  await logAudit(denied.profile.id, "project.created", input.clientName);

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
      industry: input.industry || null,
      start_date: input.startDate || null,
      deadline: input.deadline || null,
      deliverable_link: input.deliverableLink || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  await reconcileLead(supabase, id, "pm", input.projectManagerId);
  await reconcileLead(supabase, id, "sc", input.seniorConsultantId);

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
