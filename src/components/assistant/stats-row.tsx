import Link from "next/link";
import type { Stats } from "@/lib/assistant/stats";
import { cn } from "@/lib/utils";

function Tile({ label, value, detail, href, warn }: { label: string; value: string | number; detail?: string; href: string; warn?: boolean }) {
  return (
    <Link href={href} className="group min-w-28">
      <p className={cn("text-2xl font-semibold tabular-nums", warn && "text-warning")}>{value}</p>
      <p className="text-sm font-medium group-hover:underline">{label}</p>
      {detail && <p className={cn("text-xs", warn ? "text-warning" : "text-muted-foreground")}>{detail}</p>}
    </Link>
  );
}

/** Slim, server-rendered stats. No model calls. Execs also see the assistant's global daily usage. */
export function StatsRow({
  stats,
  execUsage,
}: {
  stats: Stats;
  execUsage: { used: number; cap: number } | null;
}) {
  return (
    <div className="flex flex-wrap gap-x-10 gap-y-3">
      <Tile label="Open tasks" value={stats.openTasks} href="/portal/tasks" />
      <Tile
        label="Overdue"
        value={stats.overdueTasks}
        href="/portal/tasks"
        warn={stats.overdueTasks > 0}
      />
      <Tile label="Projects" value={stats.projects} href="/portal/projects" />
      <Tile
        label="Attendance"
        value={stats.attendancePct === null ? "--" : `${stats.attendancePct}%`}
        href="/portal/attendance"
      />
      {execUsage && (
        <Tile
          label="Assistant today"
          value={`${execUsage.used}/${execUsage.cap}`}
          detail="Team messages (resets midnight PT)"
          href="/portal"
          warn={execUsage.used >= execUsage.cap * 0.8}
        />
      )}
    </div>
  );
}
