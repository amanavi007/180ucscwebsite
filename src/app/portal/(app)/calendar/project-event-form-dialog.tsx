"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { createProjectEvent, updateProjectEvent } from "@/actions/calendar";
import type { LeadProject } from "@/lib/data/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
  FieldDescription,
} from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const schema = z.object({
  title: z.string().min(1, "Title is required."),
  date: z.string().min(1, "Date is required."),
  time: z.string(),
  location: z.string(),
  description: z.string(),
});

type FormValues = z.infer<typeof schema>;

export interface ProjectEventFormValues {
  id: string | null;
  projectId: string;
  consultantId: string | null;
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
}

/**
 * Mounted only while a project item is being added/edited, mirroring
 * EventFormDialog -- fresh defaultValues on every open, no resync effect.
 */
export function ProjectEventFormDialog({
  defaults,
  leadProjects,
  onClose,
}: {
  defaults: ProjectEventFormValues;
  leadProjects: LeadProject[];
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [projectId, setProjectId] = useState(defaults.projectId || leadProjects[0]?.id || "");
  const [consultantId, setConsultantId] = useState<string | null>(defaults.consultantId);
  const router = useRouter();
  const isEdit = defaults.id !== null;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: defaults.title,
      date: defaults.date,
      time: defaults.time,
      location: defaults.location,
      description: defaults.description,
    },
  });

  const selectedProject = leadProjects.find((p) => p.id === projectId);

  function onSubmit(values: FormValues) {
    if (!projectId) {
      toast.error("Choose a project.");
      return;
    }
    startTransition(async () => {
      const input = {
        projectId,
        consultantId,
        title: values.title,
        date: values.date,
        time: values.time || null,
        location: values.location || null,
        description: values.description || null,
      };
      const result = isEdit
        ? await updateProjectEvent(defaults.id!, input)
        : await createProjectEvent(input);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(isEdit ? "Item updated." : "Item added.");
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit project item" : "New project item"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel>Project</FieldLabel>
              <Select
                value={projectId}
                onValueChange={(value) => {
                  setProjectId(value ?? "");
                  setConsultantId(null);
                }}
                disabled={isEdit}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a project">
                    {(value: string) => leadProjects.find((p) => p.id === value)?.clientName}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {leadProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.clientName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>About (optional)</FieldLabel>
              <Select
                value={consultantId ?? "__team__"}
                onValueChange={(value) => setConsultantId(!value || value === "__team__" ? null : value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Whole team">
                    {(value: string) =>
                      value === "__team__" ? "Whole team" : selectedProject?.members.find((m) => m.id === value)?.name
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__team__">Whole team</SelectItem>
                  {selectedProject?.members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                Tag one consultant for something like a 1:1 agenda, or leave it as the whole team.
              </FieldDescription>
            </Field>
            <Field data-invalid={!!errors.title}>
              <FieldLabel htmlFor="title">Title</FieldLabel>
              <Input id="title" autoFocus {...register("title")} />
              <FieldError errors={[errors.title]} />
            </Field>
            <Field data-invalid={!!errors.date}>
              <FieldLabel htmlFor="date">Date</FieldLabel>
              <Input id="date" type="date" {...register("date")} />
              <FieldError errors={[errors.date]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="time">Time</FieldLabel>
              <Input id="time" placeholder="e.g. 6:00 PM" {...register("time")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="location">Location</FieldLabel>
              <Input id="location" {...register("location")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <Textarea id="description" rows={3} {...register("description")} />
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="submit" disabled={isPending}>
              {isEdit ? "Save changes" : "Add item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
