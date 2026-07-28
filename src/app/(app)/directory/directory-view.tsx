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
import { roleLabel, ROLE_LABELS } from "@/lib/auth/roles";
import type { DirectoryRow } from "@/lib/data/directory";

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

export function DirectoryView({ rows }: { rows: DirectoryRow[] }) {
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
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Team</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground">
                No members match these filters.
              </TableCell>
            </TableRow>
          )}
          {filtered.map((r) => (
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
