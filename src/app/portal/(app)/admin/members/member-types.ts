import { ROLE_LABELS } from "@/lib/auth/roles";
import type { UserRole } from "@/lib/supabase/database.types";

export interface Member {
  id: string;
  name: string;
  role: UserRole;
  email: string;
}

export interface ArchivedMember extends Member {
  archived_at: string;
}

export const ROLE_OPTIONS = Object.keys(ROLE_LABELS) as UserRole[];
