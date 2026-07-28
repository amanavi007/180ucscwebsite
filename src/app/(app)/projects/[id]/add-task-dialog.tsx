"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { createTask } from "@/actions/tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { TASK_PRIORITY_LABELS, TASK_TYPES, taskTypeLabel } from "@/lib/project-labels";
import type { TaskPriority, TaskType } from "@/lib/supabase/database.types";

const UNASSIGNED = "__unassigned__";

const schema = z.object({
  taskName: z.string().min(1, "Give the task a name."),
  taskType: z.enum(["preliminary_research", "implementables", "deliverable", "other"]),
  assigneeId: z.string(),
  dueDate: z.string(),
  priority: z.enum(["low", "medium", "high"]),
});

type FormValues = z.infer<typeof schema>;

export function AddTaskDialog({
  projectId,
  defaultAssigneeId,
  rosterProfiles,
  canAssignOthers,
}: {
  projectId: string;
  defaultAssigneeId: string;
  rosterProfiles: { id: string; name: string }[];
  canAssignOthers: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      taskName: "",
      taskType: "other",
      assigneeId: defaultAssigneeId,
      dueDate: "",
      priority: "medium",
    },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await createTask({
        projectId,
        taskName: values.taskName,
        taskType: values.taskType as TaskType,
        assigneeId: values.assigneeId === UNASSIGNED ? null : values.assigneeId,
        dueDate: values.dueDate || null,
        priority: values.priority,
      });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <Plus className="size-3.5" />
            Add task
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.taskName}>
              <FieldLabel htmlFor="taskName">Task name</FieldLabel>
              <Input id="taskName" {...register("taskName")} />
              <FieldError errors={[errors.taskName]} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Phase</FieldLabel>
                <Controller
                  control={control}
                  name="taskType"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(value: TaskType) => taskTypeLabel(value)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {taskTypeLabel(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field>
                <FieldLabel>Priority</FieldLabel>
                <Controller
                  control={control}
                  name="priority"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => field.onChange(v as TaskPriority)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(value: TaskPriority) => TASK_PRIORITY_LABELS[value]}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>

            {canAssignOthers && (
              <Field>
                <FieldLabel>Assignee</FieldLabel>
                <Controller
                  control={control}
                  name="assigneeId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(value: string) =>
                            value === UNASSIGNED
                              ? "Unassigned"
                              : (rosterProfiles.find((p) => p.id === value)?.name ??
                                "Unassigned")
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
                  )}
                />
              </Field>
            )}

            <Field>
              <FieldLabel htmlFor="dueDate">Due date</FieldLabel>
              <Input id="dueDate" type="date" {...register("dueDate")} />
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="submit" disabled={isPending}>
              Add task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
