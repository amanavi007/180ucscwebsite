"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, Plus, UserPlus, X } from "lucide-react";
import { createExecTodo, deleteExecTodo, toggleExecTodo } from "@/actions/exec-todos";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { parseLocalDate } from "@/lib/date";
import { format } from "date-fns";
import type { ExecTodo } from "@/lib/data/exec-todos";

export function ExecTodoList({
  todos,
  execMembers,
  today,
}: {
  todos: ExecTodo[];
  execMembers: { id: string; name: string }[];
  today: string;
}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [showDate, setShowDate] = useState(false);
  const [assignedTo, setAssignedTo] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const nameById = new Map(execMembers.map((m) => [m.id, m.name]));

  const open = todos.filter((t) => t.status === "open");
  const done = todos.filter((t) => t.status === "done");

  function onAdd() {
    if (!title.trim()) return;
    startTransition(async () => {
      const result = await createExecTodo(title, dueDate || null, assignedTo);
      if (result?.error) toast.error(result.error);
      else {
        setTitle("");
        setDueDate("");
        setShowDate(false);
        setAssignedTo([]);
        router.refresh();
      }
    });
  }

  function onToggle(id: string, next: boolean) {
    startTransition(async () => {
      const result = await toggleExecTodo(id, next);
      if (result?.error) toast.error(result.error);
      else router.refresh();
    });
  }

  function onDelete(id: string) {
    startTransition(async () => {
      const result = await deleteExecTodo(id);
      if (result?.error) toast.error(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Add a to-do..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAdd()}
            disabled={isPending}
            className="h-8 flex-1"
          />
          <Button
            type="button"
            size="icon-sm"
            disabled={isPending || !title.trim()}
            onClick={onAdd}
            aria-label="Add to-do"
          >
            <Plus className="size-4" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {showDate || dueDate ? (
            <span className="flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2 text-xs">
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={isPending}
                autoFocus
                className="dark:[color-scheme:dark] h-5 w-32 border-none p-0 text-xs"
              />
              <button
                type="button"
                aria-label="Remove due date"
                onClick={() => {
                  setDueDate("");
                  setShowDate(false);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setShowDate(true)}
              className="flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:border-solid hover:text-foreground"
            >
              <CalendarPlus className="size-3" />
              Due date
            </button>
          )}

          <AssigneePicker
            execMembers={execMembers}
            selected={assignedTo}
            onChange={setAssignedTo}
            disabled={isPending}
          />
        </div>
      </div>

      {todos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No to-dos yet. Add one above.</p>
      ) : (
        <div className="space-y-1">
          {open.map((t) => (
            <TodoRow
              key={t.id}
              todo={t}
              nameById={nameById}
              today={today}
              isPending={isPending}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ))}
          {done.length > 0 && (
            <details className="pt-1">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                {done.length} done
              </summary>
              <div className="mt-1 space-y-1">
                {done.map((t) => (
                  <TodoRow
                    key={t.id}
                    todo={t}
                    nameById={nameById}
                    today={today}
                    isPending={isPending}
                    onToggle={onToggle}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function AssigneePicker({
  execMembers,
  selected,
  onChange,
  disabled,
}: {
  execMembers: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
}) {
  const label =
    selected.length === 0
      ? "Assign"
      : selected.length === 1
        ? (execMembers.find((m) => m.id === selected[0])?.name ?? "1 assigned")
        : `${selected.length} assigned`;

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
              selected.length === 0
                ? "border-dashed text-muted-foreground hover:border-solid hover:text-foreground"
                : "text-foreground",
            )}
          >
            <UserPlus className="size-3" />
            <span className="max-w-32 truncate">{label}</span>
          </button>
        }
      />
      <PopoverContent align="start" className="w-56 p-1.5">
        <div className="max-h-56 space-y-0.5 overflow-y-auto">
          {execMembers.map((m) => (
            <label
              key={m.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <Checkbox checked={selected.includes(m.id)} onCheckedChange={() => toggle(m.id)} />
              {m.name}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TodoRow({
  todo,
  nameById,
  today,
  isPending,
  onToggle,
  onDelete,
}: {
  todo: ExecTodo;
  nameById: Map<string, string>;
  today: string;
  isPending: boolean;
  onToggle: (id: string, next: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const overdue = todo.status === "open" && !!todo.due_date && todo.due_date < today;
  const assigneeNames = todo.assigned_to.map((id) => nameById.get(id)).filter(Boolean);

  return (
    <div className="group flex items-center gap-2 rounded-md border px-2.5 py-1.5">
      <Checkbox
        checked={todo.status === "done"}
        onCheckedChange={(c) => onToggle(todo.id, c === true)}
        disabled={isPending}
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm",
          todo.status === "done" && "text-muted-foreground line-through",
        )}
      >
        {todo.title}
      </span>
      {assigneeNames.length > 0 && (
        <span className="shrink-0 truncate text-xs text-muted-foreground">
          {assigneeNames.join(", ")}
        </span>
      )}
      {todo.due_date && (
        <span
          className={cn(
            "shrink-0 text-xs",
            overdue ? "font-medium text-destructive" : "text-muted-foreground",
          )}
        >
          {format(parseLocalDate(todo.due_date), "MMM d")}
        </span>
      )}
      <button
        type="button"
        aria-label="Delete to-do"
        disabled={isPending}
        onClick={() => onDelete(todo.id)}
        className="shrink-0 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
