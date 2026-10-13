"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HealthBadge } from "@/components/health-badge";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { statusLabel } from "@/lib/project-labels";
import { parseLocalDate } from "@/lib/date";
import type { ProjectWithRelations } from "@/lib/data/types";
import { pmNames } from "@/lib/project-leads";

type SortKey = "client_name" | "status" | "health" | "pm" | "sc" | "deadline";
type SortDir = "asc" | "desc";

const SORT_ACCESSORS: Record<SortKey, (p: ProjectWithRelations) => string> = {
  client_name: (p) => p.client_name ?? "",
  status: (p) => p.status ?? "",
  health: (p) => p.health ?? "",
  pm: (p) => pmNames(p).join(", "),
  sc: (p) => p.senior_consultant?.name ?? "",
  deadline: (p) => p.deadline ?? "",
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

export function ProjectTable({ projects }: { projects: ProjectWithRelations[] }) {
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
    if (!sortKey) return projects;
    const accessor = SORT_ACCESSORS[sortKey];
    const copy = [...projects];
    copy.sort((a, b) => {
      const cmp = accessor(a).localeCompare(accessor(b));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [projects, sortKey, sortDir]);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHead label="Client" sortKey="client_name" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableHead label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableHead label="Health" sortKey="health" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableHead
            label="Project manager"
            sortKey="pm"
            activeKey={sortKey}
            dir={sortDir}
            onSort={onSort}
          />
          <SortableHead
            label="Senior consultant"
            sortKey="sc"
            activeKey={sortKey}
            dir={sortDir}
            onSort={onSort}
          />
          <SortableHead label="Deadline" sortKey="deadline" activeKey={sortKey} dir={sortDir} onSort={onSort} />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground">
              No projects in this quarter yet.
            </TableCell>
          </TableRow>
        )}
        {sorted.map((project) => (
          <TableRow key={project.id}>
            <TableCell className="font-medium">
              <Link href={`/portal/projects/${project.id}`} className="hover:underline">
                {project.client_name}
              </Link>
            </TableCell>
            <TableCell>
              <Badge variant="secondary">{statusLabel(project.status)}</Badge>
            </TableCell>
            <TableCell>
              <HealthBadge health={project.health} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {pmNames(project).join(", ") || "-"}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {project.senior_consultant?.name ?? "-"}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {project.deadline ? format(parseLocalDate(project.deadline), "MMM d, yyyy") : "-"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
