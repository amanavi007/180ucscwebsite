"use client";

import Link from "next/link";
import { format } from "date-fns";
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
import { statusLabel } from "@/lib/project-labels";
import { parseLocalDate } from "@/lib/date";
import type { ProjectWithRelations } from "@/lib/data/types";

export function ProjectTable({ projects }: { projects: ProjectWithRelations[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Client</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Health</TableHead>
          <TableHead>Project manager</TableHead>
          <TableHead>Senior consultant</TableHead>
          <TableHead>Deadline</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground">
              No projects in this quarter yet.
            </TableCell>
          </TableRow>
        )}
        {projects.map((project) => (
          <TableRow key={project.id}>
            <TableCell className="font-medium">
              <Link href={`/projects/${project.id}`} className="hover:underline">
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
              {project.project_manager?.name ?? "—"}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {project.senior_consultant?.name ?? "—"}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {project.deadline ? format(parseLocalDate(project.deadline), "MMM d, yyyy") : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
