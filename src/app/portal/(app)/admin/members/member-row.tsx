"use client";

import { Badge } from "@/components/ui/badge";
import { PersonAvatar } from "@/components/person-avatar";
import { TableCell, TableRow } from "@/components/ui/table";
import { roleLabel } from "@/lib/auth/roles";
import { memberStatus, type Member, type MemberStats } from "./member-types";

/** One roster row. Clicking it opens that member in the panel beside the table. */
export function MemberRow({
  member,
  stats,
  photo,
  threshold,
  selected,
  onSelect,
}: {
  member: Member;
  stats: MemberStats | undefined;
  photo?: string;
  threshold: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const status = memberStatus(stats, threshold);
  const rate = stats?.attendanceRate;
  const team = stats?.team ?? "Unassigned";
  return (
    <TableRow
      data-state={selected ? "selected" : undefined}
      aria-selected={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className="cursor-pointer outline-none focus-visible:bg-muted/60"
    >
      <TableCell>
        <span className="flex items-center gap-3">
          <PersonAvatar name={member.name} src={photo} />
          <span className="min-w-0">
            <span className="block font-semibold">{member.name}</span>
            <span className="block text-sm text-muted-foreground">{member.email}</span>
          </span>
        </span>
      </TableCell>
      <TableCell>
        <Badge variant="muted">{roleLabel(member.role)}</Badge>
      </TableCell>
      <TableCell className={team === "Unassigned" ? "text-muted-foreground" : ""}>{team}</TableCell>
      <TableCell className="tabular-nums">{rate === null || rate === undefined ? "–" : `${Math.round(rate * 100)}%`}</TableCell>
      <TableCell>
        <Badge variant={status.variant}>{status.label}</Badge>
      </TableCell>
    </TableRow>
  );
}
