"use client";

import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { format } from "date-fns";
import { Download, MoreHorizontal } from "lucide-react";
import { parseLocalDate } from "@/lib/date";
import {
  createQuarter,
  deactivateQuarter,
  deleteQuarter,
  setActiveQuarter,
  updateQuarter,
} from "@/actions/quarters";
import { exportQuarterCsv } from "@/actions/quarter-export";
import { toCsv, downloadCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import type { Database } from "@/lib/supabase/database.types";

type Quarter = Database["public"]["Tables"]["quarters"]["Row"];

const schema = z
  .object({
    name: z.string().min(1, "Give this quarter a name, e.g. Winter 2026."),
    startDate: z.string().min(1, "Start date is required."),
    endDate: z.string().min(1, "End date is required."),
    makeActive: z.boolean(),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "End date must be after the start date.",
    path: ["endDate"],
  });

type FormValues = z.infer<typeof schema>;

const editSchema = z
  .object({
    name: z.string().min(1, "Give this quarter a name."),
    startDate: z.string().min(1, "Start date is required."),
    endDate: z.string().min(1, "End date is required."),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "End date must be after the start date.",
    path: ["endDate"],
  });

type EditFormValues = z.infer<typeof editSchema>;

export function QuartersPanel({ quarters }: { quarters: Quarter[] }) {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { makeActive: quarters.length === 0 },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await createQuarter(values);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(`${values.name} created.`);
        reset({ name: "", startDate: "", endDate: "", makeActive: false });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quarters</CardTitle>
        <CardDescription>
          Projects and attendance are scoped to a quarter. Start a new one
          when teams roll over.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input id="name" placeholder="Winter 2026" {...register("name")} />
                <FieldError errors={[errors.name]} />
              </Field>
              <Field data-invalid={!!errors.startDate}>
                <FieldLabel htmlFor="startDate">Start date</FieldLabel>
                <Input id="startDate" type="date" {...register("startDate")} />
                <FieldError errors={[errors.startDate]} />
              </Field>
              <Field data-invalid={!!errors.endDate}>
                <FieldLabel htmlFor="endDate">End date</FieldLabel>
                <Input id="endDate" type="date" {...register("endDate")} />
                <FieldError errors={[errors.endDate]} />
              </Field>
            </div>

            <Field orientation="horizontal">
              <Controller
                control={control}
                name="makeActive"
                render={({ field }) => (
                  <Checkbox
                    id="makeActive"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                )}
              />
              <FieldLabel htmlFor="makeActive" className="font-normal">
                Make this the active quarter
              </FieldLabel>
            </Field>

            <Button type="submit" disabled={isPending} className="w-fit">
              Create quarter
            </Button>
          </FieldGroup>
        </form>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quarters.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No quarters yet.
                </TableCell>
              </TableRow>
            )}
            {quarters.map((q) => (
              <QuarterRow key={q.id} quarter={q} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function QuarterRow({ quarter: q }: { quarter: Quarter }) {
  const [isPending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function onToggleActive() {
    startTransition(async () => {
      const result = q.is_active
        ? await deactivateQuarter(q.id)
        : await setActiveQuarter(q.id);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(q.is_active ? `${q.name} deactivated.` : `${q.name} is now active.`);
      }
    });
  }

  function onDelete() {
    startTransition(async () => {
      const result = await deleteQuarter(q.id);
      setDeleteOpen(false);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(`${q.name} deleted.`);
      }
    });
  }

  function onExport() {
    startTransition(async () => {
      const result = await exportQuarterCsv(q.id);
      if (result.error || !result.rows) {
        toast.error(result.error ?? "Couldn't build the export.");
        return;
      }
      const headers = [
        "Name",
        "Email",
        "Org role",
        "Team",
        "Team role",
        "Attendance rate",
        "Tasks done",
        "Tasks total",
        "Project status",
        "Project health",
        "Project deadline",
      ];
      const csvRows = result.rows.map((r) => [
        r.name,
        r.email,
        r.orgRole,
        r.team,
        r.teamRole,
        r.attendanceRate,
        r.tasksDone,
        r.tasksTotal,
        r.projectStatus,
        r.projectHealth,
        r.projectDeadline,
      ]);
      downloadCsv(`${q.name.replace(/\s+/g, "-").toLowerCase()}-report.csv`, toCsv(headers, csvRows));
    });
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{q.name}</TableCell>
      <TableCell className="text-muted-foreground">
        {format(parseLocalDate(q.start_date), "MMM d, yyyy")} –{" "}
        {format(parseLocalDate(q.end_date), "MMM d, yyyy")}
      </TableCell>
      <TableCell>
        {q.is_active ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${q.name}`}>
                <MoreHorizontal className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditOpen(true)}>Edit</DropdownMenuItem>
            <DropdownMenuItem disabled={isPending} onClick={onToggleActive}>
              {q.is_active ? "Deactivate" : "Set active"}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={isPending} onClick={onExport}>
              <Download />
              Export report (CSV)
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <EditQuarterDialog quarter={q} open={editOpen} onOpenChange={setEditOpen} />

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {q.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This can&apos;t be undone. Quarters with projects already
                linked to them can&apos;t be deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={isPending} onClick={onDelete}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}

function EditQuarterDialog({
  quarter,
  open,
  onOpenChange,
}: {
  quarter: Quarter;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    values: {
      name: quarter.name,
      startDate: quarter.start_date,
      endDate: quarter.end_date,
    },
  });

  function onSubmit(values: EditFormValues) {
    startTransition(async () => {
      const result = await updateQuarter(quarter.id, values);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Quarter updated.");
        onOpenChange(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit quarter</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="edit-name">Name</FieldLabel>
              <Input id="edit-name" {...register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!errors.startDate}>
                <FieldLabel htmlFor="edit-startDate">Start date</FieldLabel>
                <Input id="edit-startDate" type="date" {...register("startDate")} />
                <FieldError errors={[errors.startDate]} />
              </Field>
              <Field data-invalid={!!errors.endDate}>
                <FieldLabel htmlFor="edit-endDate">End date</FieldLabel>
                <Input id="edit-endDate" type="date" {...register("endDate")} />
                <FieldError errors={[errors.endDate]} />
              </Field>
            </div>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="submit" disabled={isPending}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
