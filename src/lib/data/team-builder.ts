import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAllProfiles } from "./members";
import { isExec } from "@/lib/auth/roles";
import type { LeadCandidateRole, MembershipTeamRole, UserRole } from "@/lib/supabase/database.types";

export interface BoardProfile {
  id: string;
  name: string;
  role: UserRole;
  /** Team Builder-only tag: "being considered for PM/SC next" -- not a real assignment, not shown elsewhere. Can hold both roles at once. */
  candidateRoles: LeadCandidateRole[];
}

export interface BoardTeam {
  id: string;
  clientName: string;
  logoUrl: string | null;
  pm: BoardProfile[];
  sc: BoardProfile[];
  members: BoardProfile[];
}

export interface TeamBuilderBoard {
  teams: BoardTeam[];
  unassigned: BoardProfile[];
}

export interface PlanSummary {
  id: string;
  name: string;
  isFinalized: boolean;
  finalizedAt: string | null;
  updatedAt: string;
}

/** Every draft for a quarter, most recently updated first. */
export async function getPlansForQuarter(quarterId: string): Promise<PlanSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_plans")
    .select("id, name, is_finalized, finalized_at, updated_at")
    .eq("quarter_id", quarterId)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    isFinalized: p.is_finalized,
    finalizedAt: p.finalized_at,
    updatedAt: p.updated_at,
  }));
}

/**
 * Every draft team's PM/SC/member chips, in one shot -- powers the drag-and-drop
 * board. `quarterId` is only needed to look up the (quarter-scoped, not
 * draft-scoped) PM/SC candidate tags.
 */
export async function getPlanBoard(planId: string, quarterId: string): Promise<TeamBuilderBoard> {
  const supabase = await createClient();

  const [
    { data: planTeams, error: teamsError },
    allProfiles,
    { data: candidates, error: candidatesError },
  ] = await Promise.all([
    supabase
      .from("team_plan_teams")
      .select("id, client_name, logo_url")
      .eq("plan_id", planId)
      .order("client_name", { ascending: true }),
    getAllProfiles(),
    supabase.from("lead_candidates").select("user_id, candidate_role").eq("quarter_id", quarterId),
  ]);
  if (teamsError) throw teamsError;
  if (candidatesError) throw candidatesError;

  const candidateRolesByUserId = new Map<string, LeadCandidateRole[]>();
  for (const c of candidates ?? []) {
    const roles = candidateRolesByUserId.get(c.user_id) ?? [];
    roles.push(c.candidate_role);
    candidateRolesByUserId.set(c.user_id, roles);
  }
  const withCandidate = (p: Omit<BoardProfile, "candidateRoles">): BoardProfile => ({
    ...p,
    candidateRoles: candidateRolesByUserId.get(p.id) ?? [],
  });

  const buckets = new Map<string, { pm: BoardProfile[]; sc: BoardProfile[]; members: BoardProfile[] }>();
  for (const t of planTeams ?? []) buckets.set(t.id, { pm: [], sc: [], members: [] });

  const assignedIds = new Set<string>();
  const planTeamIds = (planTeams ?? []).map((t) => t.id);

  if (planTeamIds.length > 0) {
    const { data: placements, error: placementsError } = await supabase
      .from("team_plan_placements")
      .select("plan_team_id, team_role, profile:profiles(id,name,role)")
      .in("plan_team_id", planTeamIds)
      .order("created_at", { ascending: true });
    if (placementsError) throw placementsError;

    for (const p of placements as unknown as {
      plan_team_id: string;
      team_role: MembershipTeamRole;
      profile: Omit<BoardProfile, "candidateRoles"> | null;
    }[]) {
      if (!p.profile || isExec(p.profile.role)) continue;
      const bucket = buckets.get(p.plan_team_id);
      if (!bucket) continue;
      assignedIds.add(p.profile.id);
      const profile = withCandidate(p.profile);
      if (p.team_role === "pm") bucket.pm.push(profile);
      else if (p.team_role === "sc") bucket.sc.push(profile);
      else bucket.members.push(profile);
    }
  }

  const teams: BoardTeam[] = (planTeams ?? []).map((t) => ({
    id: t.id,
    clientName: t.client_name,
    logoUrl: t.logo_url,
    ...buckets.get(t.id)!,
  }));

  // Execs never sit on a project team -- keep them out of Team Builder entirely
  // rather than showing them as draggable chips no one should ever place.
  const unassigned = allProfiles
    .filter((p) => !assignedIds.has(p.id) && !isExec(p.role))
    .map(withCandidate);

  return { teams, unassigned };
}
