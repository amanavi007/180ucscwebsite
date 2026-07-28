"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ExternalLink, Pencil } from "lucide-react";
import { format } from "date-fns";
import { updateProject, setHealthOverride } from "@/actions/projects";
import { ProjectStatusSelect } from "../project-status-select";
import { HealthBadge } from "@/components/health-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { parseLocalDate } from "@/lib/date";
import { HEALTH_LABELS } from "@/lib/project-labels";
import type { ProjectHealth } from "@/lib/supabase/database.types";
import type { ProjectWithQuarter } from "@/lib/data/types";

const NONE = "__none__";

const schema = z.object({
  clientName: z.string().min(1, "Client name is required."),
  projectManagerId: z.string(),
  seniorConsultantId: z.string(),
  industry: z.string(),
  startDate: z.string(),
  deadline: z.string(),
  deliverableLink: z.string(),
});

type FormValues = z.infer<typeof schema>;

export function ProjectHeader({
  project,
  computedHealth,
  canEdit,
  members,
}: {
  project: ProjectWithQuarter;
  computedHealth: ProjectHealth;
  canEdit: boolean;
  members: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: {
      clientName: project.client_name,
      projectManagerId: project.project_manager_id ?? NONE,
      seniorConsultantId: project.senior_consultant_id ?? NONE,
      industry: project.industry ?? "",
      startDate: project.start_date ?? "",
      deadline: project.deadline ?? "",
      deliverableLink: project.deliverable_link ?? "",
    },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await updateProject(project.id, {
        clientName: values.clientName,
        status: project.status,
        projectManagerId: values.projectManagerId === NONE ? null : values.projectManagerId,
        seniorConsultantId:
          values.seniorConsultantId === NONE ? null : values.seniorConsultantId,
        industry: values.industry,
        startDate: values.startDate || null,
        deadline: values.deadline || null,
        deliverableLink: values.deliverableLink,
      });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Project updated.");
      setOpen(false);
      router.refresh();
    });
  }

  function memberLabel(id: string) {
    return id === NONE ? "Unassigned" : (members.find((m) => m.id === id)?.name ?? "Unassigned");
  }

  function onHealthChange(value: string | null) {
    startTransition(async () => {
      const result = await setHealthOverride(
        project.id,
        value === "auto" ? null : (value as ProjectHealth),
      );
      if (result?.error) toast.error(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{project.client_name}</h1>
          <p className="text-sm text-muted-foreground">
            {project.quarter?.name}
            {project.industry ? ` · ${project.industry}` : ""}
          </p>
        </div>

        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
              render={
                <Button variant="outline" size="sm">
                  <Pencil />
                  Edit
                </Button>
              }
            />
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Edit project</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit(onSubmit)} noValidate>
                <FieldGroup>
                  <Field data-invalid={!!errors.clientName}>
                    <FieldLabel htmlFor="clientName">Client name</FieldLabel>
                    <Input id="clientName" {...register("clientName")} />
                    <FieldError errors={[errors.clientName]} />
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
                    <Input id="industry" {...register("industry")} />
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
                    <Input id="deliverableLink" type="url" {...register("deliverableLink")} />
                  </Field>
                </FieldGroup>
                <DialogFooter className="mt-6">
                  <Button type="submit" disabled={isPending}>
                    Save changes
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-44">
          <ProjectStatusSelect projectId={project.id} status={project.status} disabled={!canEdit} />
        </div>

        {canEdit ? (
          <Select
            value={project.health_manual_override ?? "auto"}
            onValueChange={onHealthChange}
            disabled={isPending}
          >
            <SelectTrigger size="sm" className="w-40">
              <SelectValue>
                {(value: string) =>
                  value === "auto"
                    ? `Auto: ${HEALTH_LABELS[computedHealth]}`
                    : HEALTH_LABELS[value as keyof typeof HEALTH_LABELS]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto: {HEALTH_LABELS[computedHealth]}</SelectItem>
              <SelectItem value="on_track">On track</SelectItem>
              <SelectItem value="at_risk">At risk</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <HealthBadge health={project.health_manual_override ?? computedHealth} />
        )}

        {project.deliverable_link && (
          <a
            href={project.deliverable_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Deliverable <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span>PM: {project.project_manager?.name ?? "Unassigned"}</span>
        <span>SC: {project.senior_consultant?.name ?? "Unassigned"}</span>
        {project.start_date && (
          <span>Started {format(parseLocalDate(project.start_date), "MMM d, yyyy")}</span>
        )}
        {project.deadline && (
          <span>Due {format(parseLocalDate(project.deadline), "MMM d, yyyy")}</span>
        )}
      </div>
    </div>
  );
}
