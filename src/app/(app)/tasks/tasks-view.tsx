"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { Play } from "lucide-react";
import { updateTask, updateTaskDueDate, updateTaskStageStep } from "@/actions/tasks";
import { TaskStageTimeline } from "@/components/task-stage-timeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  STEPPED_TASK_TYPES,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_DOT_CLASS,
  TASK_STATUS_LABELS,
  TASK_STATUS_BADGE_CLASS,
  TASK_TYPES,
  taskTypeLabel,
} from "@/lib/project-labels";
import { parseLocalDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { TaskPriority, TaskStatus } from "@/lib/supabase/database.types";
import type { ProjectWithRelations } from "@/lib/data/types";
import type { TaskWithProject } from "@/lib/data/types";

const ALL = "__all__";
const COLUMN_HEADERS = ["Task", "Priority", "Assignee", "Due", "Status"];

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
}: {
  tasks: TaskWithProject[];
  projects: ProjectWithRelations[];
  mine: boolean;
  filters: Filters;
  currentUserId: string;
  isExec: boolean;
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
    return (
      !!project &&
      (project.project_manager_id === currentUserId ||
        project.senior_consultant_id === currentUserId)
    );
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
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
                <Link href={`/projects/${group.id}`} className="font-medium hover:underline">
                  {group.name}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {group.tasks.length} task{group.tasks.length === 1 ? "" : "s"}
                </span>
              </CardHeader>
              <CardContent className="p-0">
                <div className="hidden grid-cols-[1fr_7rem_9rem_9rem_13rem] gap-3 px-4 py-2 text-xs font-medium text-muted-foreground sm:grid">
                  {COLUMN_HEADERS.map((h) => (
                    <span key={h}>{h}</span>
                  ))}
                </div>
                {group.tasks.map((task) => (
                  <GlobalTaskRow
                    key={task.id}
                    task={task}
                    canEdit={canManageProject(task.project_id) || task.assignee_id === currentUserId}
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

function GlobalTaskRow({ task, canEdit }: { task: TaskWithProject; canEdit: boolean }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const isStepped = STEPPED_TASK_TYPES.includes(task.task_type);

  function applyStatus(status: TaskStatus) {
    startTransition(async () => {
      const result = await updateTask(task.id, task.project_id, { status });
      if (result?.error) toast.error(result.error);
      else router.refresh();
    });
  }

  function applyPriority(priority: TaskPriority) {
    startTransition(async () => {
      const result = await updateTask(task.id, task.project_id, { priority });
      if (result?.error) toast.error(result.error);
      else router.refresh();
    });
  }

  function applyDueDate(dueDate: string | null) {
    startTransition(async () => {
      const result = await updateTaskDueDate(task.id, task.project_id, dueDate);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  function startTimeline() {
    startTransition(async () => {
      const result = await updateTaskStageStep(task.id, task.project_id, "draft_in_progress");
      if (result?.error) toast.error(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-[1fr_7rem_9rem_9rem_13rem] items-center gap-3 border-b px-4 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={cn("size-1.5 shrink-0 rounded-full", TASK_PRIORITY_DOT_CLASS[task.priority])}
            title={`${TASK_PRIORITY_LABELS[task.priority]} priority`}
          />
          <span className={`truncate text-sm ${task.is_default_task ? "font-medium" : ""}`}>
            {task.task_name}
          </span>
        </div>
      </div>

      {canEdit ? (
        <Select
          value={task.priority}
          onValueChange={(v) => applyPriority(v as TaskPriority)}
          disabled={isPending}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue>{(value: TaskPriority) => TASK_PRIORITY_LABELS[value]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Badge variant="secondary" className="w-fit">
          {TASK_PRIORITY_LABELS[task.priority]}
        </Badge>
      )}

      <span className="truncate text-sm text-muted-foreground">
        {task.assignee?.name ?? "Unassigned"}
      </span>

      {canEdit ? (
        <Input
          type="date"
          value={task.due_date ?? ""}
          onChange={(e) => applyDueDate(e.target.value || null)}
          disabled={isPending}
          className="w-full"
        />
      ) : (
        <span className="text-sm text-muted-foreground">
          {task.due_date ? format(parseLocalDate(task.due_date), "MMM d, yyyy") : "—"}
        </span>
      )}

      {task.stage_step ? (
        <TaskStageTimeline
          taskId={task.id}
          projectId={task.project_id}
          currentStep={task.stage_step}
          editable={canEdit}
        />
      ) : isStepped ? (
        canEdit ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={startTimeline}
            disabled={isPending}
            className="h-7 w-fit gap-1.5 px-2 text-xs font-medium text-muted-foreground"
          >
            <Play className="size-3" />
            Start
          </Button>
        ) : (
          <Badge variant="outline" className={cn("w-fit", TASK_STATUS_BADGE_CLASS.not_started)}>
            Not started
          </Badge>
        )
      ) : canEdit ? (
        <Select
          value={task.status}
          onValueChange={(v) => applyStatus(v as TaskStatus)}
          disabled={isPending}
        >
          <SelectTrigger
            size="sm"
            className={cn("w-32 border-transparent", TASK_STATUS_BADGE_CLASS[task.status])}
          >
            <SelectValue>{(value: TaskStatus) => TASK_STATUS_LABELS[value]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Badge variant="outline" className={TASK_STATUS_BADGE_CLASS[task.status]}>
          {TASK_STATUS_LABELS[task.status]}
        </Badge>
      )}
    </div>
  );
}
