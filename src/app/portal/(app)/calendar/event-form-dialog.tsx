"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import * as chrono from "chrono-node";
import { Wand2 } from "lucide-react";
import { createOrgEvent, updateOrgEvent } from "@/actions/calendar";
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
  FieldSeparator,
} from "@/components/ui/field";

const schema = z.object({
  title: z.string().min(1, "Title is required."),
  date: z.string().min(1, "Date is required."),
  time: z.string(),
  location: z.string(),
  description: z.string(),
});

type FormValues = z.infer<typeof schema>;

export interface EventFormValues {
  id: string | null;
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
}

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Best-effort split of a free-typed sentence into event fields. chrono-node
 * only understands date/time, so title and location are recovered
 * heuristically from whatever text is left after the date/time phrase is
 * removed -- good enough for a review-before-save quick-add, not a source
 * of truth. Falls back to today's date with the whole sentence as the title
 * when nothing parses, since a wrong title is easy to see and fix.
 */
function parseQuickAdd(text: string): { title: string; date: string; time: string; location: string } {
  const results = chrono.parse(text, new Date());
  if (results.length === 0) {
    return { title: text.trim(), date: toDateString(new Date()), time: "", location: "" };
  }

  const result = results[0];
  const date = result.start.date();
  const hasTime = result.start.isCertain("hour");
  const time = hasTime
    ? date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : "";

  let remainder = (text.slice(0, result.index) + text.slice(result.index + result.text.length))
    .replace(/^[-,.\s]+|[-,.\s]+$/g, "")
    .trim();

  let location = "";
  const atMatch = remainder.match(/^(.*)\bat\s+(.+)$/i);
  if (atMatch) {
    remainder = atMatch[1].replace(/^[-,.\s]+|[-,.\s]+$/g, "").trim();
    location = atMatch[2].trim();
  }

  return { title: remainder || text.trim(), date: toDateString(date), time, location };
}

/**
 * Mounted only while an event is being added/edited (CalendarView renders
 * `defaults && <EventFormDialog .../>`), so each open gets fresh
 * react-hook-form defaultValues instead of needing an effect to resync them.
 */
export function EventFormDialog({
  defaults,
  onClose,
}: {
  defaults: EventFormValues;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [quickAdd, setQuickAdd] = useState("");
  const router = useRouter();
  const isEdit = defaults.id !== null;

  const {
    register,
    handleSubmit,
    setValue,
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

  function applyQuickAdd() {
    if (!quickAdd.trim()) return;
    const parsed = parseQuickAdd(quickAdd);
    setValue("title", parsed.title, { shouldValidate: true });
    setValue("date", parsed.date, { shouldValidate: true });
    if (parsed.time) setValue("time", parsed.time);
    if (parsed.location) setValue("location", parsed.location);
  }

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const input = {
        title: values.title,
        date: values.date,
        time: values.time || null,
        location: values.location || null,
        description: values.description || null,
      };
      const result = isEdit
        ? await updateOrgEvent(defaults.id!, input)
        : await createOrgEvent(input);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(isEdit ? "Event updated." : "Event added.");
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit event" : "New event"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            {!isEdit && (
              <>
                <Field>
                  <FieldLabel htmlFor="quickAdd">Quick add</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id="quickAdd"
                      autoFocus
                      placeholder="Team social next Friday 6pm at Bay Tree Bookstore"
                      value={quickAdd}
                      onChange={(e) => setQuickAdd(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          applyQuickAdd();
                        }
                      }}
                    />
                    <Button type="button" variant="outline" onClick={applyQuickAdd} className="gap-1.5">
                      <Wand2 className="size-4" />
                      Fill in
                    </Button>
                  </div>
                  <FieldDescription>
                    Type a sentence and review the fields below before saving. The parser is a
                    best guess, not gospel.
                  </FieldDescription>
                </Field>
                <FieldSeparator>or fill in manually</FieldSeparator>
              </>
            )}
            <Field data-invalid={!!errors.title}>
              <FieldLabel htmlFor="title">Title</FieldLabel>
              <Input id="title" autoFocus={isEdit} {...register("title")} />
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
              {isEdit ? "Save changes" : "Add event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
