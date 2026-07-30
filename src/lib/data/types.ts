import type { Database, MembershipTeamRole } from "@/lib/supabase/database.types";

type Project = Database["public"]["Tables"]["projects"]["Row"];
type Task = Database["public"]["Tables"]["tasks"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type WikiPage = Database["public"]["Tables"]["wiki_pages"]["Row"];

export type NamedProfile = Pick<Profile, "id" | "name"> | null;

export interface ProjectWithRelations extends Project {
  project_manager: NamedProfile;
  senior_consultant: NamedProfile;
  /** user_ids with a 'pm'/'sc' membership on this project -- covers additional, non-primary leads too. */
  lead_ids?: string[];
}

export interface ProjectWithQuarter extends ProjectWithRelations {
  quarter: { id: string; name: string } | null;
}

export interface TaskWithAssignee extends Task {
  assignee: NamedProfile;
}

export interface TaskWithProject extends TaskWithAssignee {
  project: { id: string; client_name: string } | null;
}

export interface MembershipWithProfile {
  id: string;
  user_id: string;
  team_role: MembershipTeamRole;
  profile: Pick<Profile, "id" | "name" | "role" | "email"> | null;
}

export interface WikiPageWithAuthor extends WikiPage {
  updated_by_profile: NamedProfile;
}
