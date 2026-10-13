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
import { PersonAvatar } from "@/components/person-avatar";
import { FilterChip } from "@/components/filter-chip";
import { ListSearch } from "@/components/list-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Download } from "lucide-react";
import { roleLabel, ROLE_LABELS, compareByRole, isExec } from "@/lib/auth/roles";
import { toCsv, downloadCsv } from "@/lib/csv";
import type { DirectoryRow } from "@/lib/data/directory";
import type { AttendanceRateResult } from "@/lib/attendance";

const ALL = "__all__";
const EXEC = "__exec__";
const NO_TEAM = "__no_team__";

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
  const [query, setQuery] = useState("");
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

  const filtered = rows
    .filter((r) => {
    if (query.trim() && !`${r.name} ${r.email}`.toLowerCase().includes(query.trim().toLowerCase())) return false;
    if (roleFilter === EXEC) return isExec(r.role);
    if (roleFilter !== ALL && r.role !== roleFilter) return false;
    if (teamFilter === NO_TEAM && r.project_id) return false;
    if (teamFilter !== ALL && teamFilter !== NO_TEAM && r.project_id !== teamFilter) return false;
    return true;
    })
    .sort(compareByRole);

  function onExport() {
    const headers = rates
      ? ["Name", "Email", "Role", "Team", "Attendance %", "Present", "Tardy", "Excused", "Unexcused"]
      : ["Name", "Email", "Role", "Team"];

    const csvRows = filtered.map((r) => {
      const base = [r.name, r.email, roleLabel(r.role), r.client_name ?? "No team"];
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

  const nonExecRoles = rolesPresent.filter((r) => !isExec(r)).sort((a, b) => compareByRole({ role: a, name: "" }, { role: b, name: "" }));
  const execCount = rows.filter((r) => isExec(r.role)).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <ListSearch value={query} onChange={setQuery} placeholder="Search by name or email" className="w-64" />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by role">
          <FilterChip selected={roleFilter === ALL} onClick={() => setRoleFilter(ALL)} count={rows.length}>
            Everyone
          </FilterChip>
          {execCount > 0 && (
            <FilterChip selected={roleFilter === EXEC} onClick={() => setRoleFilter(EXEC)} count={execCount}>
              Exec board
            </FilterChip>
          )}
          {nonExecRoles.map((r) => (
            <FilterChip key={r} selected={roleFilter === r} onClick={() => setRoleFilter(r)} count={rows.filter((x) => x.role === r).length}>
              {ROLE_LABELS[r]}
            </FilterChip>
          ))}
        </div>

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

      {filtered.length === 0 ? (
        <p className="rounded-[22px] border bg-card py-14 text-center text-sm text-muted-foreground">No one matches that.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((r) => {
            const result = rates?.[r.user_id];
            return (
              <li key={r.user_id} className="flex flex-col gap-4 rounded-[22px] border bg-card p-5">
                <div className="flex items-center gap-3.5">
                  <PersonAvatar name={r.name} className="size-14 text-lg" />
                  <div className="min-w-0">
                    <h3 className="truncate font-heading text-lg leading-tight font-bold">{r.name}</h3>
                    <Badge variant={isExec(r.role) ? "info" : "muted"} className="mt-1">
                      {roleLabel(r.role)}
                    </Badge>
                  </div>
                </div>

                <dl className="space-y-1.5 text-sm">
                  <div className="flex gap-2">
                    <dt className="w-12 shrink-0 text-muted-foreground">Team</dt>
                    <dd className="min-w-0 truncate font-semibold">
                      {r.project_id && r.client_name ? (
                        <Link href={`/portal/projects/${r.project_id}`} className="hover:underline">
                          {r.client_name}
                        </Link>
                      ) : (
                        <span className="font-normal text-muted-foreground">No team yet</span>
                      )}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-12 shrink-0 text-muted-foreground">Email</dt>
                    <dd className="min-w-0 truncate">
                      <a href={`mailto:${r.email}`} className="text-link hover:underline">
                        {r.email}
                      </a>
                    </dd>
                  </div>
                </dl>

                {rates && (
                  <div className="mt-auto flex flex-wrap items-center gap-2 border-t pt-3">
                    {result && result.rate !== null ? (
                      <>
                        <Badge variant={result.rate < attendanceThreshold ? "bad" : "ok"}>
                          {Math.round(result.rate * 100)}% attendance
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {result.excusedCount}E / {result.unexcusedCount}U / {result.tardyCount}T
                        </span>
                        {result.missingSessionDates.length > 0 && (
                          <AlertTriangle
                            className="size-3.5 text-status-warn-foreground"
                            aria-label={`Team hasn't logged ${result.missingSessionDates.length} session(s) other teams logged this quarter`}
                          />
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">No attendance yet</span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
