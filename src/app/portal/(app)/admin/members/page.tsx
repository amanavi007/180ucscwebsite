import type { Metadata } from "next";
import { getAllProfiles, getArchivedProfiles } from "@/lib/data/members";
import { getAttendanceAlertThreshold, getDefaultBulkPassword } from "@/lib/data/org-settings";
import { getConsultantStatsRollup } from "@/lib/data/consultant-stats";
import { getQuarters } from "@/lib/data/quarters";
import { defaultQuarterId, parseMembersAction, resolveQuarterId } from "@/lib/admin-nav";
import { MembersPanel } from "./members-panel";
import type { MemberStats } from "./member-types";

export const metadata: Metadata = { title: "Admin · People" };

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; quarter?: string }>;
}) {
  const [{ action, quarter }, members, archivedMembers, defaultPassword, quarters] = await Promise.all([
    searchParams,
    getAllProfiles(),
    getArchivedProfiles(),
    getDefaultBulkPassword(),
    getQuarters(),
  ]);
  const quarterId = resolveQuarterId(quarter, quarters, defaultQuarterId(quarters));
  const quarterName = quarters.find((q) => q.id === quarterId)?.name ?? null;

  // Team, attendance and task numbers are nice to have: the roster still works without them.
  let stats: Record<string, MemberStats> = {};
  let threshold = 0;
  if (quarterId) {
    try {
      const [rollup, alert] = await Promise.all([getConsultantStatsRollup(quarterId), getAttendanceAlertThreshold(true)]);
      threshold = alert;
      stats = Object.fromEntries(
        rollup.map((r) => [
          r.userId,
          {
            team: r.team,
            attendanceRate: r.attendanceRate,
            tasksDone: r.tasksDone,
            tasksTotal: r.tasksTotal,
            overdueTasks: r.overdueTasks,
          },
        ]),
      );
    } catch (error) {
      console.error("Roster stats failed:", error);
    }
  }

  return (
    <MembersPanel
      members={members}
      archivedMembers={archivedMembers}
      defaultPassword={defaultPassword}
      action={parseMembersAction(action)}
      stats={stats}
      attendanceThreshold={threshold}
      quarterName={quarterName}
    />
  );
}
