"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import type { LeadCandidateRole, MembershipTeamRole } from "@/lib/supabase/database.types";

export interface ActionResult {
  error?: string;
}

async function requireExec() {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) {
    return { error: "Only exec can do that." } as const;
  }
  return { error: undefined } as const;
}

// ── Drafts ──────────────────────────────────────────────────────────────

export async function createPlan(
  quarterId: string,
  name: string,
): Promise<ActionResult & { id?: string }> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };
  if (!name.trim()) return { error: "Draft name is required." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_plans")
    .insert({ quarter_id: quarterId, name: name.trim() })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const actor = await getCurrentProfile();
  await logAudit(actor.id, "team_plan.created", name.trim());

  revalidatePath("/portal/admin/team-builder");
  return { id: data.id };
}

/** Copies a draft's teams + placements into a brand new draft -- how you branch a variant to compare. */
export async function duplicatePlan(
  planId: string,
  newName: string,
): Promise<ActionResult & { id?: string }> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };
  if (!newName.trim()) return { error: "Draft name is required." };

  const supabase = await createClient();

  const { data: source, error: sourceError } = await supabase
    .from("team_plans")
    .select("quarter_id")
    .eq("id", planId)
    .single();
  if (sourceError) return { error: sourceError.message };

  const { data: newPlan, error: newPlanError } = await supabase
    .from("team_plans")
    .insert({ quarter_id: source.quarter_id, name: newName.trim() })
    .select("id")
    .single();
  if (newPlanError) return { error: newPlanError.message };

  const [{ data: sourceTeams, error: teamsError }, { data: sourcePlacements, error: placementsError }] =
    await Promise.all([
      supabase.from("team_plan_teams").select("id, client_name").eq("plan_id", planId),
      supabase
        .from("team_plan_placements")
        .select("plan_team_id, user_id, team_role")
        .eq("plan_id", planId),
    ]);
  if (teamsError) return { error: teamsError.message };
  if (placementsError) return { error: placementsError.message };

  // Pre-generate ids so teams + placements can each be inserted in a single
  // batch call instead of one round trip per team.
  const teamIdMap = new Map((sourceTeams ?? []).map((t) => [t.id, crypto.randomUUID()]));

  if (sourceTeams && sourceTeams.length > 0) {
    const { error: newTeamsError } = await supabase.from("team_plan_teams").insert(
      sourceTeams.map((team) => ({
        id: teamIdMap.get(team.id)!,
        plan_id: newPlan.id,
        client_name: team.client_name,
      })),
    );
    if (newTeamsError) return { error: newTeamsError.message };
  }

  if (sourcePlacements && sourcePlacements.length > 0) {
    const { error: newPlacementsError } = await supabase.from("team_plan_placements").insert(
      sourcePlacements.map((p) => ({
        plan_id: newPlan.id,
        plan_team_id: teamIdMap.get(p.plan_team_id)!,
        user_id: p.user_id,
        team_role: p.team_role,
      })),
    );
    if (newPlacementsError) return { error: newPlacementsError.message };
  }

  revalidatePath("/portal/admin/team-builder");
  return { id: newPlan.id };
}

export async function renamePlan(planId: string, name: string): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };
  if (!name.trim()) return { error: "Draft name is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("team_plans").update({ name: name.trim() }).eq("id", planId);
  if (error) return { error: error.message };

  revalidatePath("/portal/admin/team-builder");
  return {};
}

export async function deletePlan(planId: string): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };

  const supabase = await createClient();
  const { data: plan } = await supabase
    .from("team_plans")
    .select("name, is_finalized")
    .eq("id", planId)
    .single();
  if (plan?.is_finalized) {
    return { error: "Finalized drafts can't be deleted -- they're the record of what was applied." };
  }

  const { error } = await supabase.from("team_plans").delete().eq("id", planId);
  if (error) return { error: error.message };

  const actor = await getCurrentProfile();
  await logAudit(actor.id, "team_plan.deleted", plan?.name);

  revalidatePath("/portal/admin/team-builder");
  return {};
}

// ── Teams within a draft ───────────────────────────────────────────────

export async function createPlanTeam(
  planId: string,
  clientName: string,
): Promise<ActionResult & { id?: string }> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };
  if (!clientName.trim()) return { error: "Team name is required." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_plan_teams")
    .insert({ plan_id: planId, client_name: clientName.trim() })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/portal/admin/team-builder");
  return { id: data.id };
}

export async function renamePlanTeam(planTeamId: string, clientName: string): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };
  if (!clientName.trim()) return { error: "Team name is required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("team_plan_teams")
    .update({ client_name: clientName.trim() })
    .eq("id", planTeamId);
  if (error) return { error: error.message };

  revalidatePath("/portal/admin/team-builder");
  return {};
}

export async function deletePlanTeam(planTeamId: string): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };

  const supabase = await createClient();
  const { error } = await supabase.from("team_plan_teams").delete().eq("id", planTeamId);
  if (error) return { error: error.message };

  revalidatePath("/portal/admin/team-builder");
  return {};
}

// ── Placements within a draft ─────────────────────────────────────────

/** One team per user per draft: placing someone removes any other placement they have in this draft. */
export async function assignInPlan(
  userId: string,
  planId: string,
  planTeamId: string,
  role: MembershipTeamRole,
): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };

  const supabase = await createClient();

  const { error: removeError } = await supabase
    .from("team_plan_placements")
    .delete()
    .eq("plan_id", planId)
    .eq("user_id", userId)
    .neq("plan_team_id", planTeamId);
  if (removeError) return { error: removeError.message };

  const { error } = await supabase
    .from("team_plan_placements")
    .upsert(
      { plan_id: planId, plan_team_id: planTeamId, user_id: userId, team_role: role },
      { onConflict: "plan_id,user_id" },
    );
  if (error) return { error: error.message };

  revalidatePath("/portal/admin/team-builder");
  return {};
}

/** Drag back to the Unassigned pool -- removes whatever placement the user has in this draft. */
export async function unassignInPlan(userId: string, planId: string): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("team_plan_placements")
    .delete()
    .eq("plan_id", planId)
    .eq("user_id", userId);
  if (error) return { error: error.message };

  revalidatePath("/portal/admin/team-builder");
  return {};
}

// ── Finalize: lock a draft (no data writes) ─────────────────────────────

/** Locks a draft so it can't be edited anymore. Doesn't touch real data -- that's what applyPlan does. */
export async function finalizePlan(planId: string): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };

  const supabase = await createClient();
  const { data: plan, error } = await supabase
    .from("team_plans")
    .update({ is_finalized: true, finalized_at: new Date().toISOString() })
    .eq("id", planId)
    .select("name")
    .single();
  if (error) return { error: error.message };

  const actor = await getCurrentProfile();
  await logAudit(actor.id, "team_plan.finalized", plan.name);

  revalidatePath("/portal/admin/team-builder");
  return {};
}

/** Unlocks a finalized draft back to editable. Doesn't touch real data or undo a prior Apply. */
export async function unfinalizePlan(planId: string): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };

  const supabase = await createClient();
  const { data: plan, error } = await supabase
    .from("team_plans")
    .update({ is_finalized: false, finalized_at: null })
    .eq("id", planId)
    .select("name")
    .single();
  if (error) return { error: error.message };

  const actor = await getCurrentProfile();
  await logAudit(actor.id, "team_plan.unfinalized", plan.name);

  revalidatePath("/portal/admin/team-builder");
  return {};
}

// ── Apply: write a finalized draft into the real projects/memberships ──

/**
 * Applies a *finalized* draft to the real quarter roster. Draft teams are
 * matched to existing real projects by name (trim + case-insensitive) -- a
 * match gets its roster reconciled, no match creates a new project. Real
 * memberships for anyone not placed anywhere in the draft are removed: the
 * applied draft becomes the full source of truth for the quarter, not a
 * patch. Safe to run more than once.
 */
export async function applyPlan(planId: string): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };

  const supabase = await createClient();

  const { data: plan, error: planError } = await supabase
    .from("team_plans")
    .select("id, name, quarter_id, is_finalized")
    .eq("id", planId)
    .single();
  if (planError) return { error: planError.message };
  if (!plan.is_finalized) return { error: "Finalize this draft first." };

  const [
    { data: planTeams, error: teamsError },
    { data: placements, error: placementsError },
    { data: realProjects, error: realProjectsError },
  ] = await Promise.all([
    supabase.from("team_plan_teams").select("id, client_name").eq("plan_id", planId),
    supabase.from("team_plan_placements").select("plan_team_id, user_id, team_role").eq("plan_id", planId),
    supabase.from("projects").select("id, client_name").eq("quarter_id", plan.quarter_id),
  ]);
  if (teamsError) return { error: teamsError.message };
  if (placementsError) return { error: placementsError.message };
  if (realProjectsError) return { error: realProjectsError.message };

  const realProjectIdByName = new Map(
    (realProjects ?? []).map((p) => [p.client_name.trim().toLowerCase(), p.id]),
  );

  const nameByMissingKey = new Map<string, string>();
  for (const team of planTeams ?? []) {
    const key = team.client_name.trim().toLowerCase();
    if (!realProjectIdByName.has(key) && !nameByMissingKey.has(key)) {
      nameByMissingKey.set(key, team.client_name);
    }
  }

  if (nameByMissingKey.size > 0) {
    const { data: created, error: createError } = await supabase
      .from("projects")
      .insert(
        [...nameByMissingKey.values()].map((clientName) => ({
          client_name: clientName,
          quarter_id: plan.quarter_id,
        })),
      )
      .select("id, client_name");
    if (createError) return { error: createError.message };
    for (const p of created) {
      realProjectIdByName.set(p.client_name.trim().toLowerCase(), p.id);
    }
  }

  const planTeamToProjectId = new Map<string, string>();
  for (const team of planTeams ?? []) {
    const key = team.client_name.trim().toLowerCase();
    planTeamToProjectId.set(team.id, realProjectIdByName.get(key)!);
  }

  const desired = new Map<string, { projectId: string; teamRole: MembershipTeamRole }>();
  for (const placement of placements ?? []) {
    const projectId = planTeamToProjectId.get(placement.plan_team_id);
    if (!projectId) continue;
    desired.set(placement.user_id, { projectId, teamRole: placement.team_role });
  }

  const { data: realMemberships, error: realMembershipsError } = await supabase
    .from("memberships")
    .select("id, project_id, user_id, team_role, project:projects!inner(quarter_id)")
    .eq("project.quarter_id", plan.quarter_id);
  if (realMembershipsError) return { error: realMembershipsError.message };

  const toDelete: string[] = [];
  const alreadyCorrect = new Set<string>();

  for (const m of realMemberships as unknown as {
    id: string;
    project_id: string;
    user_id: string;
    team_role: MembershipTeamRole;
  }[]) {
    const want = desired.get(m.user_id);
    if (!want || want.projectId !== m.project_id || want.teamRole !== m.team_role) {
      toDelete.push(m.id);
    } else {
      alreadyCorrect.add(m.user_id);
    }
  }

  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase.from("memberships").delete().in("id", toDelete);
    if (deleteError) return { error: deleteError.message };
  }

  const toInsert = [...desired.entries()]
    .filter(([userId]) => !alreadyCorrect.has(userId))
    .map(([userId, want]) => ({
      project_id: want.projectId,
      user_id: userId,
      team_role: want.teamRole,
    }));

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase.from("memberships").insert(toInsert);
    if (insertError) return { error: insertError.message };
  }

  const actor = await getCurrentProfile();
  await logAudit(actor.id, "team_plan.applied", plan.name);

  revalidatePath("/portal/admin/team-builder");
  revalidatePath("/portal/projects");
  revalidatePath("/portal/directory");
  revalidatePath("/portal");
  revalidatePath("/portal/attendance");
  for (const projectId of new Set(planTeamToProjectId.values())) {
    revalidatePath(`/portal/projects/${projectId}`);
  }

  return {};
}

// ── PM/SC candidate tagging (quarter-scoped, independent of any draft) ──

/**
 * Team Builder-only tag: mark someone as a PM/SC candidate for this quarter to
 * help exec decide who to drag where. Doesn't touch memberships or grant any
 * permission -- purely advisory, and only ever read back by the Team Builder.
 */
export async function setLeadCandidate(
  userId: string,
  quarterId: string,
  role: LeadCandidateRole | null,
): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };

  const supabase = await createClient();

  if (role === null) {
    const { error: deleteError } = await supabase
      .from("lead_candidates")
      .delete()
      .eq("user_id", userId)
      .eq("quarter_id", quarterId);
    if (deleteError) return { error: deleteError.message };
  } else {
    const { error: upsertError } = await supabase
      .from("lead_candidates")
      .upsert(
        { user_id: userId, quarter_id: quarterId, candidate_role: role },
        { onConflict: "quarter_id,user_id" },
      );
    if (upsertError) return { error: upsertError.message };
  }

  revalidatePath("/portal/admin/team-builder");
  return {};
}
