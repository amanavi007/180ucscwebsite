"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { format } from "date-fns";
import { updateTask, deleteTask } from "@/actions/tasks";
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
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/lib/project-labels";
import { parseLocalDate } from "@/lib/date";
import type { TaskPriority, TaskStatus } from "@/lib/supabase/database.types";
import type { TaskWithAssignee } from "@/lib/data/types";

const UNASSIGNED = "__unassigned__";

export function TaskRow({
  task,
  projectId,
  canEdit,
  canDelete,
  rosterProfiles,
  currentUserId,
  indented,
}: {
  task: TaskWithAssignee;
  projectId: string;
  canEdit: boolean;
  canDelete: boolean;
  rosterProfiles: { id: string; name: string }[];
  currentUserId: string;
  indented?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function apply(patch: Parameters<typeof updateTask>[2]) {
    startTransition(async () => {
      const result = await updateTask(task.id, projectId, patch);
      if (result?.error) toast.error(result.error);
      else router.refresh();
    });
  }

  function onDelete() {
    startTransition(async () => {
      const result = await deleteTask(task.id, projectId);
      if (result?.error) toast.error(result.error);
      else router.refresh();
    });
  }

  // Base users may update status on tasks assigned to them even without full edit rights.
  const statusEditable = canEdit || task.assignee_id === currentUserId;

  return (
    <div
      className={`flex flex-wrap items-center gap-2 border-b py-2 last:border-b-0 ${
        indented ? "pl-6" : ""
      }`}
    >
      <span className={`min-w-40 flex-1 text-sm ${task.is_milestone ? "font-medium" : ""}`}>
        {task.task_name}
      </span>

      {canEdit ? (
        <Select
          value={task.priority}
          onValueChange={(v) => apply({ priority: v as TaskPriority })}
          disabled={isPending}
        >
          <SelectTrigger size="sm" className="w-24">
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

      {canEdit ? (
        <Select
          value={task.assignee_id ?? UNASSIGNED}
          onValueChange={(v) => apply({ assigneeId: v === UNASSIGNED ? null : v })}
          disabled={isPending}
        >
          <SelectTrigger size="sm" className="w-36">
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
        <span className="w-36 text-sm text-muted-foreground">
          {task.assignee?.name ?? "Unassigned"}
        </span>
      )}

      {canEdit ? (
        <Input
          type="date"
          value={task.due_date ?? ""}
          onChange={(e) => apply({ dueDate: e.target.value || null })}
          disabled={isPending}
          className="w-36"
        />
      ) : (
        <span className="w-28 text-sm text-muted-foreground">
          {task.due_date ? format(parseLocalDate(task.due_date), "MMM d") : "—"}
        </span>
      )}

      {statusEditable ? (
        <Select
          value={task.status}
          onValueChange={(v) => apply({ status: v as TaskStatus })}
          disabled={isPending}
        >
          <SelectTrigger size="sm" className="w-32">
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
        <Badge variant="secondary">{TASK_STATUS_LABELS[task.status]}</Badge>
      )}

      {canDelete && (
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={isPending}
          onClick={onDelete}
          aria-label={`Delete ${task.task_name}`}
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
