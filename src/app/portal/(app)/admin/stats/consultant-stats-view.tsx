"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ConsultantStatsRow } from "@/lib/data/consultant-stats";

type SortKey = "name" | "team" | "attendance" | "tasks" | "overdue";
type SortDir = "asc" | "desc";

const SORT_ACCESSORS: Record<SortKey, (r: ConsultantStatsRow) => number | string> = {
  name: (r) => r.name,
  team: (r) => r.team,
  attendance: (r) => r.attendanceRate ?? -1,
  tasks: (r) => (r.tasksTotal === 0 ? -1 : r.tasksDone / r.tasksTotal),
  overdue: (r) => r.overdueTasks,
};

function SortableHead({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey | null;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const isActive = activeKey === sortKey;
  const Icon = isActive ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "flex items-center gap-1 hover:text-foreground",
          isActive ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <Icon className="size-3.5" />
      </button>
    </TableHead>
  );
}

export function ConsultantStatsView({
  rows,
  attendanceThreshold,
}: {
  rows: ConsultantStatsRow[];
  attendanceThreshold: number;
}) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function onSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const accessor = SORT_ACCESSORS[sortKey];
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHead label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableHead label="Team" sortKey="team" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableHead
            label="Attendance"
            sortKey="attendance"
            activeKey={sortKey}
            dir={sortDir}
            onSort={onSort}
          />
          <SortableHead label="Tasks" sortKey="tasks" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableHead
            label="Overdue"
            sortKey="overdue"
            activeKey={sortKey}
            dir={sortDir}
            onSort={onSort}
          />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">
              No members with a team this quarter yet.
            </TableCell>
          </TableRow>
        )}
        {sorted.map((row) => (
          <TableRow key={row.userId}>
            <TableCell className="font-medium">{row.name}</TableCell>
            <TableCell className="text-muted-foreground">{row.team}</TableCell>
            <TableCell>
              {row.attendanceRate === null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <Badge
                  variant="outline"
                  className={cn(
                    "border-transparent",
                    row.attendanceRate < attendanceThreshold
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {Math.round(row.attendanceRate * 100)}%
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {row.tasksDone}/{row.tasksTotal}
              {row.tasksTotal > 0 && (
                <span className="ml-1 text-xs">({Math.round((row.tasksDone / row.tasksTotal) * 100)}%)</span>
              )}
            </TableCell>
            <TableCell>
              {row.overdueTasks > 0 ? (
                <Badge variant="outline" className="border-transparent bg-destructive/10 text-destructive">
                  {row.overdueTasks}
                </Badge>
              ) : (
                <span className="text-muted-foreground">0</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
