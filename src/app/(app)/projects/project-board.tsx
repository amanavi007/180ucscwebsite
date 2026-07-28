"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthBadge } from "@/components/health-badge";
import { ProjectStatusSelect } from "./project-status-select";
import { PROJECT_STATUSES, statusLabel } from "@/lib/project-labels";
import { parseLocalDate } from "@/lib/date";
import { format } from "date-fns";
import type { ProjectWithRelations } from "@/lib/data/types";

export function ProjectBoard({
  projects,
  currentUserId,
  isExec,
}: {
  projects: ProjectWithRelations[];
  currentUserId: string;
  isExec: boolean;
}) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {PROJECT_STATUSES.map((status) => {
        const columnProjects = projects.filter((p) => p.status === status);
        return (
          <div key={status} className="w-72 shrink-0">
            <div className="mb-2 flex items-center gap-2 px-1">
              <h3 className="text-sm font-medium">{statusLabel(status)}</h3>
              <span className="text-xs text-muted-foreground">{columnProjects.length}</span>
            </div>
            <div className="space-y-2">
              {columnProjects.map((project) => {
                const canEdit =
                  isExec ||
                  project.project_manager_id === currentUserId ||
                  project.senior_consultant_id === currentUserId;
                return (
                  <Card key={project.id} className="gap-3 py-3">
                    <CardHeader className="px-3">
                      <Link href={`/projects/${project.id}`} className="hover:underline">
                        <CardTitle className="text-sm">{project.client_name}</CardTitle>
                      </Link>
                    </CardHeader>
                    <CardContent className="space-y-2 px-3">
                      <HealthBadge health={project.health} />
                      {project.project_manager && (
                        <p className="text-xs text-muted-foreground">
                          PM: {project.project_manager.name}
                        </p>
                      )}
                      {project.deadline && (
                        <p className="text-xs text-muted-foreground">
                          Due {format(parseLocalDate(project.deadline), "MMM d")}
                        </p>
                      )}
                      <ProjectStatusSelect
                        projectId={project.id}
                        status={project.status}
                        disabled={!canEdit}
                      />
                    </CardContent>
                  </Card>
                );
              })}
              {columnProjects.length === 0 && (
                <p className="px-1 text-xs text-muted-foreground">No projects</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
