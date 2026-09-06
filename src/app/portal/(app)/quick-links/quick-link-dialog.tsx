"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { createQuickLink, updateQuickLink } from "@/actions/quick-links";
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
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import type { QuickLink } from "@/lib/data/quick-links";

const schema = z.object({
  title: z.string().min(1, "Title is required."),
  url: z.string().min(1, "URL is required.").url("Must be a valid URL."),
  description: z.string(),
  category: z.string(),
});

type FormValues = z.infer<typeof schema>;

export function QuickLinkDialog({
  link,
  trigger,
}: {
  link?: QuickLink;
  trigger?: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const isEdit = !!link;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: link?.title ?? "",
      url: link?.url ?? "",
      description: link?.description ?? "",
      category: link?.category ?? "",
    },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = isEdit
        ? await updateQuickLink(link!.id, values)
        : await createQuickLink(values);

      if (result?.error) {
        toast.error(result.error);
        return;
      }

      toast.success(isEdit ? "Link updated." : "Link added.");
      setOpen(false);
      if (!isEdit) reset();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next && !isEdit) reset();
      }}
    >
      <DialogTrigger
        render={
          trigger ?? (
            <Button size="sm">
              <Plus />
              New link
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit link" : "New link"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.title}>
              <FieldLabel htmlFor="title">Title</FieldLabel>
              <Input id="title" placeholder="Prelim Research Document (Template)" {...register("title")} />
              <FieldError errors={[errors.title]} />
            </Field>

            <Field data-invalid={!!errors.url}>
              <FieldLabel htmlFor="url">URL</FieldLabel>
              <Input id="url" placeholder="https://..." {...register("url")} />
              <FieldError errors={[errors.url]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="category">Category (optional)</FieldLabel>
              <Input id="category" placeholder="Templates" {...register("category")} />
            </Field>

            <Field>
              <FieldLabel htmlFor="description">Description (optional)</FieldLabel>
              <Input id="description" placeholder="What this link is for" {...register("description")} />
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <Button type="submit" disabled={isPending}>
              {isEdit ? "Save changes" : "Add link"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
