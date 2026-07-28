"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { updateTask, updateTaskDueDate, updateTaskStageStep, deleteTask } from "@/actions/tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TaskStageTimeline } from "@/components/task-stage-timeline";
import {
  STEPPED_TASK_TYPES,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_DOT_CLASS,
  TASK_STATUS_LABELS,
  TASK_STATUS_BADGE_CLASS,
  taskTypeLabel,
} from "@/lib/project-labels";
import { parseLocalDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { TaskPriority, TaskStatus } from "@/lib/supabase/database.types";
import type { TaskWithAssignee } from "@/lib/data/types";

const UNASSIGNED = "__unassigned__";

export function TaskRow({
  task,
  projectId,
  canManage,
  isOwn,
  rosterProfiles,
}: {
  task: TaskWithAssignee;
  projectId: string;
  canManage: boolean;
  isOwn: boolean;
  rosterProfiles: { id: string; name: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const canEditFields = canManage || isOwn;
  const canDelete = canManage || (isOwn && !task.is_default_task);

  function apply(patch: Parameters<typeof updateTask>[2]) {
    startTransition(async () => {
      const result = await updateTask(task.id, projectId, patch);
      if (result?.error) toast.error(result.error);
      else router.refresh();
    });
  }

  function applyDueDate(dueDate: string | null) {
    startTransition(async () => {
      const result = await updateTaskDueDate(task.id, projectId, dueDate);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      if (canManage && task.is_default_task) {
        toast.success(`Due date set for everyone's "${task.task_name}".`);
      }
      router.refresh();
    });
  }

  function onDelete() {
    startTransition(async () => {
      const result = await deleteTask(task.id, projectId);
      if (result?.error) toast.error(result.error);
      else router.refresh();
    });
  }

  function startTimeline() {
    startTransition(async () => {
      const result = await updateTaskStageStep(task.id, projectId, "draft_in_progress");
      if (result?.error) toast.error(result.error);
      else router.refresh();
    });
  }

  const isStepped = STEPPED_TASK_TYPES.includes(task.task_type);

  return (
    <div className="grid grid-cols-[1fr_7rem_9rem_9rem_13rem_2rem] items-center gap-3 border-b px-3 py-2.5 last:border-b-0">
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
        {taskTypeLabel(task.task_type) !== task.task_name && (
          <span className="ml-3 text-xs text-muted-foreground">
            {taskTypeLabel(task.task_type)}
          </span>
        )}
      </div>

      {canEditFields ? (
        <Select
          value={task.priority}
          onValueChange={(v) => apply({ priority: v as TaskPriority })}
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

      {canManage ? (
        <Select
          value={task.assignee_id ?? UNASSIGNED}
          onValueChange={(v) => apply({ assigneeId: v === UNASSIGNED ? null : v })}
          disabled={isPending}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="Unassigned">
              {(value: string) =>
                value === UNASSIGNED
                  ? "Unassigned"
                  : (rosterProfiles.find((p) => p.id === value)?.name ?? "Unassigned")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
            {rosterProfiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="truncate text-sm text-muted-foreground">
          {task.assignee?.name ?? "Unassigned"}
        </span>
      )}

      {canEditFields ? (
        <Input
          type="date"
          value={task.due_date ?? ""}
          onChange={(e) => applyDueDate(e.target.value || null)}
          disabled={isPending}
          className="w-full"
        />
      ) : (
        <span className="text-sm text-muted-foreground">
          {task.due_date ? format(parseLocalDate(task.due_date), "MMM d") : "—"}
        </span>
      )}

      {task.stage_step ? (
        <TaskStageTimeline
          taskId={task.id}
          projectId={projectId}
          currentStep={task.stage_step}
          editable={canEditFields}
        />
      ) : isStepped ? (
        canEditFields ? (
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
      ) : canEditFields ? (
        <Select
          value={task.status}
          onValueChange={(v) => apply({ status: v as TaskStatus })}
          disabled={isPending}
        >
          <SelectTrigger
            size="sm"
            className={cn("w-full border-transparent", TASK_STATUS_BADGE_CLASS[task.status])}
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
        <Badge variant="outline" className={cn("w-fit", TASK_STATUS_BADGE_CLASS[task.status])}>
          {TASK_STATUS_LABELS[task.status]}
        </Badge>
      )}

      {canDelete ? (
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={isPending}
          onClick={onDelete}
          aria-label={`Delete ${task.task_name}`}
        >
          <Trash2 className="size-3.5" />
        </Button>
      ) : (
        <span />
      )}
    </div>
  );
}
