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

/** The quarter's numbers for one member, from the consultant stats rollup. */
export interface MemberStats {
  team: string;
  attendanceRate: number | null;
  tasksDone: number;
  tasksTotal: number;
  overdueTasks: number;
}

export type MemberStatus = { label: string; variant: "ok" | "warn" | "bad" | "muted" };

/** One word for how a member is doing: a gentle prompt for an exec to check in, not a verdict. */
export function memberStatus(stats: MemberStats | undefined, threshold: number): MemberStatus {
  if (!stats) return { label: "No data", variant: "muted" };
  if (stats.overdueTasks > 0) {
    return { label: `${stats.overdueTasks} overdue task${stats.overdueTasks === 1 ? "" : "s"}`, variant: "bad" };
  }
  if (stats.attendanceRate !== null && stats.attendanceRate < threshold) return { label: "Low attendance", variant: "warn" };
  return { label: "On track", variant: "ok" };
}

export const needsCheckIn = (stats: MemberStats | undefined, threshold: number) => {
  const status = memberStatus(stats, threshold);
  return status.variant === "bad" || status.variant === "warn";
};
