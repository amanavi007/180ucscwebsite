import type { Database } from "@/lib/supabase/database.types";

type Project = Database["public"]["Tables"]["projects"]["Row"];
type Task = Database["public"]["Tables"]["tasks"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type NamedProfile = Pick<Profile, "id" | "name"> | null;

export interface ProjectWithRelations extends Project {
  project_manager: NamedProfile;
  senior_consultant: NamedProfile;
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
  profile: Pick<Profile, "id" | "name" | "role" | "email"> | null;
}
