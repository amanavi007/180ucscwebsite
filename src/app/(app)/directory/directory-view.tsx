"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { roleLabel, ROLE_LABELS } from "@/lib/auth/roles";
import { toCsv, downloadCsv } from "@/lib/csv";
import type { DirectoryRow } from "@/lib/data/directory";
import type { AttendanceRateResult } from "@/lib/attendance";

const ALL = "__all__";
const NO_TEAM = "__no_team__";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function DirectoryView({
  rows,
  rates,
  attendanceThreshold = 0.8,
}: {
  rows: DirectoryRow[];
  rates?: Record<string, AttendanceRateResult>;
  attendanceThreshold?: number;
}) {
  const [roleFilter, setRoleFilter] = useState(ALL);
  const [teamFilter, setTeamFilter] = useState(ALL);

  const teams = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      if (r.project_id && r.client_name) map.set(r.project_id, r.client_name);
    });
    return [...map.entries()];
  }, [rows]);

  const rolesPresent = useMemo(() => {
    const set = new Set(rows.map((r) => r.role));
    return [...set];
  }, [rows]);

  const filtered = rows.filter((r) => {
    if (roleFilter !== ALL && r.role !== roleFilter) return false;
    if (teamFilter === NO_TEAM && r.project_id) return false;
    if (teamFilter !== ALL && teamFilter !== NO_TEAM && r.project_id !== teamFilter) return false;
    return true;
  });

  function onExport() {
    const headers = rates
      ? ["Name", "Role", "Team", "Attendance %", "Present", "Tardy", "Excused", "Unexcused"]
      : ["Name", "Role", "Team"];

    const csvRows = filtered.map((r) => {
      const base = [r.name, roleLabel(r.role), r.client_name ?? "No team"];
      if (!rates) return base;
      const result = rates[r.user_id];
      return [
        ...base,
        result && result.rate !== null ? Math.round(result.rate * 100) : "",
        result?.presentCount ?? "",
        result?.tardyCount ?? "",
        result?.excusedCount ?? "",
        result?.unexcusedCount ?? "",
      ];
    });

    downloadCsv(`directory-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, csvRows));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={roleFilter} onValueChange={(v) => v && setRoleFilter(v)}>
          <SelectTrigger size="sm" className="w-48">
            <SelectValue placeholder="All roles">
              {(value: string) => (value === ALL ? "All roles" : roleLabel(value as never))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All roles</SelectItem>
            {rolesPresent.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={teamFilter} onValueChange={(v) => v && setTeamFilter(v)}>
          <SelectTrigger size="sm" className="w-48">
            <SelectValue placeholder="All teams">
              {(value: string) => {
                if (value === ALL) return "All teams";
                if (value === NO_TEAM) return "No team";
                return teams.find(([id]) => id === value)?.[1] ?? "All teams";
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All teams</SelectItem>
            <SelectItem value={NO_TEAM}>No team</SelectItem>
            {teams.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" className="ml-auto gap-1.5" onClick={onExport}>
          <Download className="size-3.5" />
          Export CSV
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Team</TableHead>
            {rates && <TableHead>Attendance</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={rates ? 4 : 3} className="text-center text-muted-foreground">
                No members match these filters.
              </TableCell>
            </TableRow>
          )}
          {filtered.map((r) => {
            const result = rates?.[r.user_id];
            return (
              <TableRow key={r.user_id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="size-7">
                      <AvatarFallback className="text-xs">{initials(r.name)}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{r.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{roleLabel(r.role)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {r.project_id && r.client_name ? (
                    <Link href={`/projects/${r.project_id}`} className="hover:underline">
                      {r.client_name}
                    </Link>
                  ) : (
                    "No team"
                  )}
                </TableCell>
                {rates && (
                  <TableCell>
                    {result && result.rate !== null ? (
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={
                            result.rate < attendanceThreshold
                              ? "border-transparent bg-destructive/10 text-destructive"
                              : "border-transparent bg-primary/10 text-primary"
                          }
                        >
                          {Math.round(result.rate * 100)}%
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {result.excusedCount}E / {result.unexcusedCount}U / {result.tardyCount}T
                        </span>
                        {result.missingSessionDates.length > 0 && (
                          <span
                            title={`Team hasn't logged ${result.missingSessionDates.length} session(s) other teams logged this quarter`}
                            className="text-xs text-amber-600 dark:text-amber-400"
                          >
                            ⚠
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
