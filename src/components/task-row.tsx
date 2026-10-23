"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { updateTask, updateTaskDueDate, updateTaskStageStep, deleteTask } from "@/actions/tasks";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TaskStageTimeline } from "@/components/task-stage-timeline";
import { TaskStatusSelect } from "@/components/task-status-select";
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
import type { TaskStatus } from "@/lib/supabase/database.types";
import type { TaskWithAssignee } from "@/lib/data/types";

const UNASSIGNED = "__unassigned__";

/**
 * Shared task row for both the project-detail task list and the global tasks
 * page. `rosterProfiles` (reassign UI) and `showDeleteColumn` are optional
 * because the global list doesn't have per-project roster data and never
 * offers delete.
 */
export function TaskRow({
  task,
  projectId,
  canManage,
  isOwn,
  currentUserId,
  rosterProfiles,
  showAssignee = true,
  showDeleteColumn = true,
  selectable = false,
  selected = false,
  onSelectChange,
}: {
  task: TaskWithAssignee;
  projectId: string;
  canManage: boolean;
  isOwn: boolean;
  /** Lets an assigned exec reviewer see their "Mark reviewed" button. */
  currentUserId?: string;
  rosterProfiles?: { id: string; name: string }[];
  showAssignee?: boolean;
  showDeleteColumn?: boolean;
  /** Bulk-select mode: renders a leading checkbox column. Off by default. */
  selectable?: boolean;
  selected?: boolean;
  onSelectChange?: (selected: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const router = useRouter();

  const canEditFields = canManage || isOwn;
  const canDelete = canManage || (isOwn && !task.is_default_task);
  const canReassign = canManage && !!rosterProfiles;

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
      setDeleteOpen(false);
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

  const gridColsClass = selectable
    ? showAssignee
      ? showDeleteColumn
        ? "grid-cols-[1.5rem_1fr_9rem_9rem_16rem_2rem]"
        : "grid-cols-[1.5rem_1fr_9rem_9rem_16rem]"
      : showDeleteColumn
        ? "grid-cols-[1.5rem_1fr_9rem_16rem_2rem]"
        : "grid-cols-[1.5rem_1fr_9rem_16rem]"
    : showAssignee
      ? showDeleteColumn
        ? "grid-cols-[1fr_9rem_9rem_16rem_2rem]"
        : "grid-cols-[1fr_9rem_9rem_16rem]"
      : showDeleteColumn
        ? "grid-cols-[1fr_9rem_16rem_2rem]"
        : "grid-cols-[1fr_9rem_16rem]";

  return (
    <div
      className={cn(
        "grid items-center gap-6 border-b px-3 py-2.5 last:border-b-0",
        gridColsClass,
      )}
    >
      {selectable && (
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onSelectChange?.(checked === true)}
          aria-label={`Select ${task.task_name}`}
        />
      )}
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
          <span className="ml-3 text-xs text-muted-foreground">{taskTypeLabel(task.task_type)}</span>
        )}
      </div>

      {showAssignee &&
        (canReassign ? (
          <Select
            value={task.assignee_id ?? UNASSIGNED}
            onValueChange={(v) => v && apply({ assigneeId: v === UNASSIGNED ? null : v })}
            disabled={isPending}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue placeholder="Unassigned">
                {(value: string) =>
                  value === UNASSIGNED
                    ? "Unassigned"
                    : (rosterProfiles!.find((p) => p.id === value)?.name ?? "Unassigned")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
              {rosterProfiles!.map((p) => (
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
        ))}

      {canManage ? (
        <Input
          type="date"
          value={task.due_date ?? ""}
          onChange={(e) => applyDueDate(e.target.value || null)}
          disabled={isPending}
          className="w-full"
        />
      ) : (
        <span className="text-sm text-muted-foreground">
          {task.due_date ? format(parseLocalDate(task.due_date), "MMM d") : "-"}
        </span>
      )}

      {task.stage_step ? (
        <TaskStageTimeline
          taskId={task.id}
          projectId={projectId}
          currentStep={task.stage_step}
          editable={canEditFields}
          execReviews={task.exec_reviews}
          currentUserId={currentUserId}
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
        <TaskStatusSelect
          value={task.status}
          onValueChange={(status: TaskStatus) => apply({ status })}
          disabled={isPending}
        />
      ) : (
        <Badge variant="outline" className={cn("w-fit", TASK_STATUS_BADGE_CLASS[task.status])}>
          {TASK_STATUS_LABELS[task.status]}
        </Badge>
      )}

      {showDeleteColumn &&
        (canDelete ? (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={isPending}
              onClick={() => setDeleteOpen(true)}
              aria-label={`Delete ${task.task_name}`}
            >
              <Trash2 className="size-3.5" />
            </Button>
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete &quot;{task.task_name}&quot;?</AlertDialogTitle>
                  <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={onDelete} disabled={isPending}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : (
          <span />
        ))}
    </div>
  );
}
