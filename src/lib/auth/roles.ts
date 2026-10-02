import type { UserRole } from "@/lib/supabase/database.types";

export const EXEC_ROLES: UserRole[] = [
  "director_of_projects",
  "director_of_internal_affairs",
  "director_of_external_affairs",
  "director_of_marketing",
  "director_of_training",
  "president",
];

export const ELEVATED_ROLES: UserRole[] = [
  "senior_consultant",
  "project_manager",
  ...EXEC_ROLES,
];

export const ROLE_LABELS: Record<UserRole, string> = {
  junior_consultant: "Junior Consultant",
  consultant: "Consultant",
  senior_consultant: "Senior Consultant",
  project_manager: "Project Manager",
  director_of_projects: "Director of Projects",
  director_of_internal_affairs: "Director of Internal Affairs",
  director_of_external_affairs: "Director of External Affairs",
  director_of_marketing: "Director of Marketing",
  director_of_training: "Director of Training",
  president: "President",
};

/**
 * Seniority, most senior first. The single source of truth for ordering ANY
 * roster (team page, directory, admin lists): use `compareByRole`, never
 * sort roster rows alphabetically by role label.
 */
export const ROLE_RANK: Record<UserRole, number> = {
  president: 0,
  director_of_projects: 1,
  director_of_internal_affairs: 2,
  director_of_external_affairs: 3,
  director_of_training: 4,
  director_of_marketing: 5,
  project_manager: 6,
  senior_consultant: 7,
  consultant: 8,
  junior_consultant: 9,
};

/** Seniority first, then name (case-insensitive). */
export function compareByRole(a: { role: UserRole; name: string }, b: { role: UserRole; name: string }): number {
  return (
    ROLE_RANK[a.role] - ROLE_RANK[b.role] ||
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

export function isExec(role: UserRole): boolean {
  return EXEC_ROLES.includes(role);
}

export function isElevatedOrAbove(role: UserRole): boolean {
  return ELEVATED_ROLES.includes(role);
}

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role];
}
