"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { createProject } from "@/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { Database } from "@/lib/supabase/database.types";
import { roleLabel } from "@/lib/auth/roles";

type Quarter = Database["public"]["Tables"]["quarters"]["Row"];
type Profile = Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "name" | "role">;

const NONE = "__none__";

const schema = z.object({
  clientName: z.string().min(1, "Client name is required."),
  quarterId: z.string().min(1, "Pick a quarter."),
  projectManagerId: z.string(),
  seniorConsultantId: z.string(),
  industry: z.string(),
  startDate: z.string(),
  deadline: z.string(),
  deliverableLink: z.string(),
  memberIds: z.array(z.string()),
});

type FormValues = z.infer<typeof schema>;

export function NewProjectDialog({
  quarters,
  members,
  defaultQuarterId,
}: {
  quarters: Quarter[];
  members: Profile[];
  defaultQuarterId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function quarterLabel(id: string) {
    const q = quarters.find((q) => q.id === id);
    return q ? `${q.name}${q.is_active ? " (active)" : ""}` : "Select a quarter";
  }
  function memberLabel(id: string) {
    return id === NONE ? "Unassigned" : (members.find((m) => m.id === id)?.name ?? "Unassigned");
  }

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      clientName: "",
      quarterId: defaultQuarterId ?? "",
      projectManagerId: NONE,
      seniorConsultantId: NONE,
      industry: "",
      startDate: "",
      deadline: "",
      deliverableLink: "",
      memberIds: [],
    },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await createProject({
        clientName: values.clientName,
        quarterId: values.quarterId,
        projectManagerId: values.projectManagerId === NONE ? null : values.projectManagerId,
        seniorConsultantId:
          values.seniorConsultantId === NONE ? null : values.seniorConsultantId,
        industry: values.industry,
        startDate: values.startDate || null,
        deadline: values.deadline || null,
        deliverableLink: values.deliverableLink,
        memberIds: values.memberIds,
      });

      if (result?.error) {
        toast.error(result.error);
        return;
      }

      toast.success(`${values.clientName} created.`);
      setOpen(false);
      reset();
      router.refresh();
      if (result.id) router.push(`/portal/projects/${result.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus />
            New project
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.clientName}>
              <FieldLabel htmlFor="clientName">Client name</FieldLabel>
              <Input id="clientName" {...register("clientName")} />
              <FieldError errors={[errors.clientName]} />
            </Field>

            <Field data-invalid={!!errors.quarterId}>
              <FieldLabel>Quarter</FieldLabel>
              <Controller
                control={control}
                name="quarterId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a quarter">{quarterLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {quarters.map((q) => (
                        <SelectItem key={q.id} value={q.id}>
                          {q.name}
                          {q.is_active ? " (active)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.quarterId]} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Project manager</FieldLabel>
                <Controller
                  control={control}
                  name="projectManagerId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue>{memberLabel}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Unassigned</SelectItem>
                        {members.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field>
                <FieldLabel>Senior consultant</FieldLabel>
                <Controller
                  control={control}
                  name="seniorConsultantId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue>{memberLabel}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Unassigned</SelectItem>
                        {members.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="industry">Industry</FieldLabel>
              <Input id="industry" placeholder="e.g. Healthcare" {...register("industry")} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="startDate">Start date</FieldLabel>
                <Input id="startDate" type="date" {...register("startDate")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="deadline">Deadline</FieldLabel>
                <Input id="deadline" type="date" {...register("deadline")} />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="deliverableLink">Deliverable link</FieldLabel>
              <Input
                id="deliverableLink"
                type="url"
                placeholder="https://..."
                {...register("deliverableLink")}
              />
            </Field>

            <Field>
              <FieldLabel>Team members</FieldLabel>
              <Controller
                control={control}
                name="memberIds"
                render={({ field }) => (
                  <div className="max-h-40 overflow-y-auto rounded-md border p-2">
                    {members.map((m) => {
                      const checked = field.value.includes(m.id);
                      return (
                        <label
                          key={m.id}
                          className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(c) =>
                              field.onChange(
                                c === true
                                  ? [...field.value, m.id]
                                  : field.value.filter((id) => id !== m.id),
                              )
                            }
                          />
                          {m.name}
                          <span className="text-xs text-muted-foreground">
                            {roleLabel(m.role)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              />
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <Button type="submit" disabled={isPending}>
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
