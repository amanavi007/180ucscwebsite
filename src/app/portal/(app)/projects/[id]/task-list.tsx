"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ListChecks, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
import { TaskRow } from "@/components/task-row";
import { AddTaskDialog } from "./add-task-dialog";
import { bulkDeleteTasks, bulkReassignTasks } from "@/actions/tasks";
import { cn } from "@/lib/utils";
import type { TaskWithAssignee } from "@/lib/data/types";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const COLUMN_HEADERS = ["Task", "Assignee", "Due", "Status", ""];

export function TaskList({
  projectId,
  tasks,
  canManage,
  currentUserId,
  rosterProfiles,
}: {
  projectId: string;
  tasks: TaskWithAssignee[];
  canManage: boolean;
  currentUserId: string;
  rosterProfiles: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Bulk-select mode is PM/SC-only (mirrors the reassign picker in TaskRow,
  // which is likewise gated to `canManage`) -- base members never see
  // checkboxes or the action bar.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reassignValue, setReassignValue] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  function toggleSelectMode() {
    setSelectMode((v) => !v);
    setSelectedIds(new Set());
  }

  function setTaskSelected(taskId: string, isSelected: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (isSelected) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
  }

  const selectedCount = selectedIds.size;

  function onBulkReassign(assigneeId: string | null) {
    if (!assigneeId || selectedCount === 0) return;
    const ids = [...selectedIds];
    startTransition(async () => {
      const result = await bulkReassignTasks(ids, assigneeId, projectId);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Reassigned ${ids.length} task${ids.length === 1 ? "" : "s"}.`);
      setReassignValue("");
      setSelectedIds(new Set());
      router.refresh();
    });
  }

  function onBulkDelete() {
    if (selectedCount === 0) return;
    const ids = [...selectedIds];
    startTransition(async () => {
      const result = await bulkDeleteTasks(ids, projectId);
      setDeleteOpen(false);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Deleted ${ids.length} task${ids.length === 1 ? "" : "s"}.`);
      setSelectedIds(new Set());
      router.refresh();
    });
  }

  const byAssignee = new Map<string, TaskWithAssignee[]>();
  const unassigned: TaskWithAssignee[] = [];
  for (const task of tasks) {
    if (!task.assignee_id) {
      unassigned.push(task);
      continue;
    }
    const list = byAssignee.get(task.assignee_id) ?? [];
    list.push(task);
    byAssignee.set(task.assignee_id, list);
  }

  // Someone with tasks who has since left the roster shouldn't lose their history.
  const knownIds = new Set(rosterProfiles.map((p) => p.id));
  const strayIds = [...byAssignee.keys()].filter((id) => !knownIds.has(id));

  // Base-tier consultants only ever have their own tasks in `tasks` (filtered upstream) --
  // don't show empty placeholder sections for teammates whose tasks are just hidden from view.
  const sections = canManage
    ? [
        ...rosterProfiles.map((p) => ({ id: p.id, name: p.name, tasks: byAssignee.get(p.id) ?? [] })),
        ...strayIds.map((id) => ({
          id,
          name: byAssignee.get(id)?.[0]?.assignee?.name ?? "Former member",
          tasks: byAssignee.get(id)!,
        })),
      ]
    : [
        {
          id: currentUserId,
          name: rosterProfiles.find((p) => p.id === currentUserId)?.name ?? "My tasks",
          tasks: byAssignee.get(currentUserId) ?? [],
        },
      ];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Tasks</CardTitle>
        {canManage && (
          <Button type="button" variant={selectMode ? "secondary" : "ghost"} size="sm" onClick={toggleSelectMode}>
            <ListChecks className="size-3.5" />
            {selectMode ? "Cancel" : "Select"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {selectMode && selectedCount > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/50 px-3 py-2">
            <span className="text-sm font-medium">
              {selectedCount} task{selectedCount === 1 ? "" : "s"} selected
            </span>
            <Select value={reassignValue} onValueChange={onBulkReassign} disabled={isPending}>
              <SelectTrigger size="sm" className="w-48">
                <SelectValue placeholder="Reassign to...">
                  {(value: string) => rosterProfiles.find((p) => p.id === value)?.name ?? "Reassign to..."}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {rosterProfiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isPending}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-3.5" />
              Delete selected
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </Button>
          </div>
        )}

        <div
          className={cn(
            "hidden gap-6 px-3 text-xs font-medium text-muted-foreground sm:grid",
            selectMode
              ? "grid-cols-[1.5rem_1fr_9rem_9rem_16rem_2rem]"
              : "grid-cols-[1fr_9rem_9rem_16rem_2rem]",
          )}
        >
          {selectMode && <span />}
          {COLUMN_HEADERS.map((h, i) => (
            <span key={i}>{h}</span>
          ))}
        </div>

        {sections.map((section) => {
          const isOwn = section.id === currentUserId;
          const doneCount = section.tasks.filter((t) => t.status === "done").length;
          const total = section.tasks.length;
          const progressPct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

          return (
            <div key={section.id}>
              <div className="mb-2 flex items-center gap-2.5">
                <Avatar className="size-6">
                  <AvatarFallback className="text-[10px]">{initials(section.name)}</AvatarFallback>
                </Avatar>
                <h3 className="text-sm font-medium">{section.name}</h3>
                {total > 0 && (
                  <>
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {doneCount}/{total} done
                    </span>
                  </>
                )}
              </div>
              <div className="overflow-hidden rounded-md border">
                {section.tasks.length === 0 && (
                  <p className="px-3 py-4 text-sm text-muted-foreground">No tasks yet.</p>
                )}
                {section.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    projectId={projectId}
                    canManage={canManage}
                    isOwn={isOwn}
                    rosterProfiles={rosterProfiles}
                    selectable={canManage && selectMode}
                    selected={selectedIds.has(task.id)}
                    onSelectChange={(isSelected) => setTaskSelected(task.id, isSelected)}
                  />
                ))}
              </div>
              {(canManage || isOwn) && (
                <div className="mt-1">
                  <AddTaskDialog
                    projectId={projectId}
                    defaultAssigneeId={section.id}
                    rosterProfiles={rosterProfiles}
                    canAssignOthers={canManage}
                  />
                </div>
              )}
            </div>
          );
        })}

        {unassigned.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium">Unassigned</h3>
            <div className="overflow-hidden rounded-md border">
              {unassigned.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  projectId={projectId}
                  canManage={canManage}
                  isOwn={false}
                  rosterProfiles={rosterProfiles}
                  selectable={canManage && selectMode}
                  selected={selectedIds.has(task.id)}
                  onSelectChange={(isSelected) => setTaskSelected(task.id, isSelected)}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedCount} task{selectedCount === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isPending} onClick={onBulkDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
