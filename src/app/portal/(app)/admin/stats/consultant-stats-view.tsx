"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PersonAvatar } from "@/components/person-avatar";
import { FilterChip } from "@/components/filter-chip";
import { cn } from "@/lib/utils";
import type { ConsultantStatsRow } from "@/lib/data/consultant-stats";
import { memberStatus, needsCheckIn } from "../members/member-types";

type SortKey = "name" | "team" | "attendance" | "tasks" | "status";
type SortDir = "asc" | "desc";

const SORT_ACCESSORS: Record<SortKey, (r: ConsultantStatsRow, threshold: number) => number | string> = {
  name: (r) => r.name,
  team: (r) => r.team,
  attendance: (r) => r.attendanceRate ?? -1,
  tasks: (r) => (r.tasksTotal === 0 ? -1 : r.tasksDone / r.tasksTotal),
  status: (r, threshold) => (needsCheckIn(r, threshold) ? 0 : 1),
};

function SortableHead({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey | null;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = activeKey === sortKey;
  const Icon = isActive ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn("flex items-center gap-1 uppercase hover:text-foreground", isActive ? "text-foreground" : "text-muted-foreground")}
      >
        {label}
        <Icon className="size-3.5" />
      </button>
    </TableHead>
  );
}

function Meter({ value, label }: { value: number | null; label: string }) {
  if (value === null) return <span className="text-muted-foreground">–</span>;
  const pct = Math.round(value * 100);
  return (
    <div className="flex min-w-36 items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${label} ${pct}%`}>
        <div className="h-full rounded-full bg-foreground" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="w-10 text-right text-sm tabular-nums">{pct}%</span>
    </div>
  );
}

export function ConsultantStatsView({
  rows,
  attendanceThreshold,
}: {
  rows: ConsultantStatsRow[];
  attendanceThreshold: number;
}) {
  const [sortKey, setSortKey] = useState<SortKey | null>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filter, setFilter] = useState<"all" | "checkin" | "consultants">("all");

  function onSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const checkInCount = rows.filter((r) => needsCheckIn(r, attendanceThreshold)).length;
  const consultantCount = rows.filter((r) => !r.isExec).length;

  const visible = useMemo(() => {
    if (filter === "checkin") return rows.filter((r) => needsCheckIn(r, attendanceThreshold));
    if (filter === "consultants") return rows.filter((r) => !r.isExec);
    return rows;
  }, [rows, filter, attendanceThreshold]);

  const sorted = useMemo(() => {
    if (!sortKey) return visible;
    const accessor = SORT_ACCESSORS[sortKey];
    const copy = [...visible];
    copy.sort((a, b) => {
      const av = accessor(a, attendanceThreshold);
      const bv = accessor(b, attendanceThreshold);
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [visible, sortKey, sortDir, attendanceThreshold]);

  const withRate = rows.filter((r) => r.attendanceRate !== null);
  const avgAttendance = withRate.length ? withRate.reduce((n, r) => n + (r.attendanceRate ?? 0), 0) / withRate.length : null;
  const tasksTotal = rows.reduce((n, r) => n + r.tasksTotal, 0);
  const tasksDone = rows.reduce((n, r) => n + r.tasksDone, 0);
  const overdue = rows.reduce((n, r) => n + r.overdueTasks, 0);

  const tiles = [
    { n: avgAttendance === null ? "–" : `${Math.round(avgAttendance * 100)}%`, label: "Average attendance", tone: "bg-sidebar text-sidebar-primary" },
    { n: tasksTotal ? `${Math.round((tasksDone / tasksTotal) * 100)}%` : "–", label: `Tasks done (${overdue} overdue)`, tone: "bg-status-info text-status-info-foreground" },
    { n: String(consultantCount), label: "Consultants", tone: "bg-status-warn text-status-warn-foreground" },
    { n: String(checkInCount), label: "Need a check-in", tone: "bg-status-bad text-status-bad-foreground" },
  ];

  return (
    <div className="space-y-5">
      <section aria-label="Totals" className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className={cn("rounded-[22px] p-5", t.tone)}>
            <div className="font-heading text-5xl leading-none font-extrabold tracking-tight tabular-nums">{t.n}</div>
            <div className="mt-2 text-sm font-semibold">{t.label}</div>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter people">
        <FilterChip selected={filter === "all"} onClick={() => setFilter("all")} count={rows.length}>
          Everyone
        </FilterChip>
        <FilterChip selected={filter === "consultants"} onClick={() => setFilter("consultants")} count={consultantCount}>
          Consultants only
        </FilterChip>
        <FilterChip selected={filter === "checkin"} onClick={() => setFilter("checkin")} count={checkInCount}>
          Needs a check-in
        </FilterChip>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead label="Person" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={onSort} />
            <SortableHead label="Team" sortKey="team" activeKey={sortKey} dir={sortDir} onSort={onSort} />
            <SortableHead label="Attendance" sortKey="attendance" activeKey={sortKey} dir={sortDir} onSort={onSort} />
            <SortableHead label="Tasks done" sortKey="tasks" activeKey={sortKey} dir={sortDir} onSort={onSort} />
            <SortableHead label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                {filter === "checkin" ? "Nobody needs a check-in right now." : "No members with a team this quarter yet."}
              </TableCell>
            </TableRow>
          )}
          {sorted.map((row) => {
            const status = memberStatus(row, attendanceThreshold);
            return (
              <TableRow key={row.userId}>
                <TableCell>
                  <span className="flex items-center gap-3">
                    <PersonAvatar name={row.name} className="size-8" />
                    <span className="font-semibold">{row.name}</span>
                  </span>
                </TableCell>
                <TableCell className={row.team === "Unassigned" ? "text-muted-foreground" : ""}>{row.team}</TableCell>
                <TableCell>
                  <Meter value={row.attendanceRate} label="Attendance" />
                </TableCell>
                <TableCell>
                  <Meter value={row.tasksTotal === 0 ? null : row.tasksDone / row.tasksTotal} label="Tasks done" />
                </TableCell>
                <TableCell>
                  <Badge variant={status.variant}>
                    {status.variant === "warn" || status.variant === "bad" ? `Check in: ${status.label}` : status.label}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
