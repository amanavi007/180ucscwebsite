"use client";

import { Badge } from "@/components/ui/badge";
import { PersonAvatar } from "@/components/person-avatar";
import { TableCell, TableRow } from "@/components/ui/table";
import { roleLabel } from "@/lib/auth/roles";
import type { Member } from "./member-types";

/** One roster row. Clicking it opens that member in the panel beside the table. */
export function MemberRow({ member, selected, onSelect }: { member: Member; selected: boolean; onSelect: () => void }) {
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
          <PersonAvatar name={member.name} />
          <span className="font-semibold">{member.name}</span>
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground">{member.email}</TableCell>
      <TableCell>
        <Badge variant="muted">{roleLabel(member.role)}</Badge>
      </TableCell>
    </TableRow>
  );
}
