"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { updateProjectStatus } from "@/actions/projects";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthBadge } from "@/components/health-badge";
import { Badge } from "@/components/ui/badge";
import { ProjectStatusSelect } from "./project-status-select";
import { PROJECT_STATUSES, statusLabel } from "@/lib/project-labels";
import { parseLocalDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { ProjectWithRelations } from "@/lib/data/types";
import type { ProjectStatus } from "@/lib/supabase/database.types";

function canEditProject(
  project: ProjectWithRelations,
  currentUserId: string,
  isExec: boolean,
): boolean {
  // lead_ids covers every 'pm'/'sc' membership; project_manager_id/senior_consultant_id
  // only hold the oldest one of each, so an additional PM would be locked out.
  return (
    isExec ||
    (project.lead_ids ?? []).includes(currentUserId) ||
    project.project_manager_id === currentUserId ||
    project.senior_consultant_id === currentUserId
  );
}

function ProjectCard({
  project,
  canEdit,
  mine = false,
  dragging = false,
}: {
  project: ProjectWithRelations;
  canEdit: boolean;
  /** The viewer is on this project: it gets the outlined, lifted look. */
  mine?: boolean;
  dragging?: boolean;
}) {
  const pmNames = (
    project.project_managers ?? (project.project_manager ? [project.project_manager] : [])
  ).map((pm) => pm.name);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: project.id,
    data: project,
    disabled: !canEdit,
  });

  return (
    <Card
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "gap-3 rounded-[18px] py-3.5",
        mine && "border-[1.5px] border-(--primary-border) shadow-[0_3px_0_var(--primary-edge)]",
        canEdit && "cursor-grab active:cursor-grabbing",
        (isDragging || dragging) && "opacity-50",
      )}
    >
      <CardHeader className="px-3">
        <Link
          href={`/portal/projects/${project.id}`}
          className="hover:underline"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <CardTitle className="text-base">{project.client_name}</CardTitle>
        </Link>
        {mine && (
          <Badge variant="default" className="mt-1">
            Your project
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-2 px-3">
        <HealthBadge health={project.health} />
        {pmNames.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {pmNames.length > 1 ? "PMs" : "PM"}: {pmNames.join(", ")}
          </p>
        )}
        {project.deadline && (
          <p className="text-xs text-muted-foreground">
            Due {format(parseLocalDate(project.deadline), "MMM d")}
          </p>
        )}
        <div onPointerDown={(e) => e.stopPropagation()}>
          <ProjectStatusSelect
            projectId={project.id}
            status={project.status}
            disabled={!canEdit}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function BoardColumn({
  status,
  projects,
  currentUserId,
  myProjectIds,
  isExec,
}: {
  status: ProjectStatus;
  projects: ProjectWithRelations[];
  currentUserId: string;
  myProjectIds: string[];
  isExec: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div key={status} className="w-72 shrink-0 rounded-[22px] bg-muted/70 p-3">
      <div className="mb-2 flex items-center gap-2 px-1">
        <h3 className="text-sm font-medium">{statusLabel(status)}</h3>
        <span className="text-xs text-muted-foreground">{projects.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "min-h-10 space-y-2.5 rounded-2xl p-1 transition-colors",
          isOver && "bg-accent ring-2 ring-link/40",
        )}
      >
        {[...projects]
          .sort((a, b) => Number(myProjectIds.includes(b.id)) - Number(myProjectIds.includes(a.id)))
          .map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              mine={myProjectIds.includes(project.id)}
              canEdit={canEditProject(project, currentUserId, isExec)}
            />
          ))}
        {projects.length === 0 && (
          <p className="px-1 text-xs text-muted-foreground">No projects</p>
        )}
      </div>
    </div>
  );
}

export function ProjectBoard({
  projects: initialProjects,
  currentUserId,
  myProjectIds,
  isExec,
}: {
  projects: ProjectWithRelations[];
  currentUserId: string;
  myProjectIds: string[];
  isExec: boolean;
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [activeProject, setActiveProject] = useState<ProjectWithRelations | null>(null);
  const router = useRouter();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragStart(event: DragStartEvent) {
    const project = projects.find((p) => p.id === String(event.active.id)) ?? null;
    setActiveProject(project);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveProject(null);
    const { active, over } = event;
    if (!over) return;

    const projectId = String(active.id);
    const nextStatus = String(over.id) as ProjectStatus;
    if (!PROJECT_STATUSES.includes(nextStatus)) return;

    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    if (!canEditProject(project, currentUserId, isExec)) return;
    if (project.status === nextStatus) return;

    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, status: nextStatus } : p)),
    );

    updateProjectStatus(projectId, nextStatus).then((result) => {
      if (result?.error) {
        toast.error(result.error);
        router.refresh();
      }
    });
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {PROJECT_STATUSES.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            projects={projects.filter((p) => p.status === status)}
            currentUserId={currentUserId}
            myProjectIds={myProjectIds}
            isExec={isExec}
          />
        ))}
      </div>

      <DragOverlay>
        {activeProject && (
          <ProjectCard
            project={activeProject}
            mine={myProjectIds.includes(activeProject.id)}
            canEdit={canEditProject(activeProject, currentUserId, isExec)}
            dragging
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
