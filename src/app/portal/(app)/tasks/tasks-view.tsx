"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { TaskRow } from "@/components/task-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TASK_STATUS_LABELS, TASK_TYPES, taskTypeLabel } from "@/lib/project-labels";
import { cn } from "@/lib/utils";
import type { ProjectWithRelations } from "@/lib/data/types";
import type { TaskWithProject } from "@/lib/data/types";

const ALL = "__all__";

interface Filters {
  project?: string;
  status?: string;
  type?: string;
}

export function TasksView({
  tasks,
  projects,
  mine,
  filters,
  currentUserId,
  isExec,
  canViewAll,
}: {
  tasks: TaskWithProject[];
  projects: ProjectWithRelations[];
  mine: boolean;
  filters: Filters;
  currentUserId: string;
  isExec: boolean;
  canViewAll: boolean;
}) {
  const router = useRouter();

  function setParam(key: string, value: string | null) {
    const url = new URL(window.location.href);
    if (!value || value === ALL) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
    router.push(`${url.pathname}${url.search}`);
  }

  function canManageProject(projectId: string) {
    if (isExec) return true;
    const project = projects.find((p) => p.id === projectId);
    return !!project && (project.lead_ids ?? []).includes(currentUserId);
  }

  const groups = new Map<string, { id: string; name: string; tasks: TaskWithProject[] }>();
  for (const task of tasks) {
    const key = task.project_id;
    if (!groups.has(key)) {
      groups.set(key, { id: key, name: task.project?.client_name ?? "Unknown project", tasks: [] });
    }
    groups.get(key)!.tasks.push(task);
  }
  const groupList = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  const columnHeaders = mine
    ? ["Task", "Priority", "Due", "Status"]
    : ["Task", "Priority", "Assignee", "Due", "Status"];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {canViewAll && (
          <div className="flex overflow-hidden rounded-md border">
            <Button
              variant={mine ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setParam("mine", "1")}
            >
              My tasks
            </Button>
            <Button
              variant={!mine ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setParam("mine", "0")}
            >
              All tasks
            </Button>
          </div>
        )}

        <Select value={filters.project ?? ALL} onValueChange={(v) => setParam("project", v)}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="All projects">
              {(value: string) =>
                value === ALL
                  ? "All projects"
                  : (projects.find((p) => p.id === value)?.client_name ?? "All projects")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.client_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.status ?? ALL} onValueChange={(v) => setParam("status", v)}>
          <SelectTrigger size="sm" className="w-36">
            <SelectValue placeholder="All statuses">
              {(value: string) =>
                value === ALL
                  ? "All statuses"
                  : TASK_STATUS_LABELS[value as keyof typeof TASK_STATUS_LABELS]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.type ?? ALL} onValueChange={(v) => setParam("type", v)}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="All types">
              {(value: string) =>
                value === ALL ? "All types" : taskTypeLabel(value as (typeof TASK_TYPES)[number])
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {TASK_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {taskTypeLabel(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {groupList.length === 0 ? (
        <p className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
          No tasks match these filters.
        </p>
      ) : (
        <div className="space-y-4">
          {groupList.map((group) => (
            <Card key={group.id}>
              <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 border-b py-3">
                <Link href={`/portal/projects/${group.id}`} className="font-medium hover:underline">
                  {group.name}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {group.tasks.length} task{group.tasks.length === 1 ? "" : "s"}
                </span>
              </CardHeader>
              <CardContent className="p-0">
                <div
                  className={cn(
                    "hidden gap-6 px-4 py-2 text-xs font-medium text-muted-foreground sm:grid",
                    mine ? "grid-cols-[1fr_7rem_9rem_13rem]" : "grid-cols-[1fr_7rem_9rem_9rem_13rem]",
                  )}
                >
                  {columnHeaders.map((h) => (
                    <span key={h}>{h}</span>
                  ))}
                </div>
                {group.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    projectId={task.project_id}
                    canManage={canManageProject(task.project_id)}
                    isOwn={task.assignee_id === currentUserId}
                    showAssignee={!mine}
                    showDeleteColumn={false}
                  />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
