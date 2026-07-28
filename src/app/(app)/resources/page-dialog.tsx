"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { createWikiPage, updateWikiPage } from "@/actions/wiki";
import { slugify } from "@/lib/slug";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import type { WikiSection } from "@/lib/supabase/database.types";
import type { WikiPageWithAuthor } from "@/lib/data/types";

const NONE = "__none__";

const schema = z.object({
  title: z.string().min(1, "Title is required."),
  slug: z
    .string()
    .min(1, "Slug is required.")
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only."),
  parentId: z.string(),
  body: z.string(),
});

type FormValues = z.infer<typeof schema>;

function descendantIds(pageId: string, pages: WikiPageWithAuthor[]): Set<string> {
  const ids = new Set<string>();
  let frontier = [pageId];
  while (frontier.length > 0) {
    const children = pages.filter((p) => p.parent_id && frontier.includes(p.parent_id));
    frontier = children.map((c) => c.id);
    children.forEach((c) => ids.add(c.id));
  }
  return ids;
}

export function PageDialog({
  section,
  pages,
  page,
  defaultParentId,
  trigger,
}: {
  section: WikiSection;
  pages: WikiPageWithAuthor[];
  page?: WikiPageWithAuthor;
  defaultParentId?: string | null;
  trigger?: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!!page);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const isEdit = !!page;

  const excluded = isEdit ? descendantIds(page.id, pages) : new Set<string>();
  if (isEdit) excluded.add(page.id);
  const parentOptions = pages.filter((p) => !excluded.has(p.id));

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: page?.title ?? "",
      slug: page?.slug ?? "",
      parentId: page?.parent_id ?? defaultParentId ?? NONE,
      body: page?.body ?? "",
    },
  });

  function onTitleChange(value: string) {
    if (!slugTouched) setValue("slug", slugify(value));
  }

  function onSubmit(values: FormValues) {
    const parentId = values.parentId === NONE ? null : values.parentId;
    startTransition(async () => {
      const result = isEdit
        ? await updateWikiPage(page!.id, {
            title: values.title,
            slug: values.slug,
            parentId,
            body: values.body,
          })
        : await createWikiPage({
            section,
            parentId,
            title: values.title,
            slug: values.slug,
            body: values.body,
          });

      if (result?.error) {
        toast.error(result.error);
        return;
      }

      toast.success(isEdit ? "Page updated." : "Page created.");
      setOpen(false);
      if (!isEdit) {
        reset();
        setSlugTouched(false);
      }
      router.push(`/resources?section=${section}&page=${values.slug}`);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next && !isEdit) {
          reset();
          setSlugTouched(false);
        }
      }}
    >
      <DialogTrigger
        render={
          trigger ?? (
            <Button size="sm">
              <Plus />
              New page
            </Button>
          )
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit page" : "New page"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.title}>
              <FieldLabel htmlFor="title">Title</FieldLabel>
              <Input
                id="title"
                {...register("title", {
                  onChange: (e) => onTitleChange(e.target.value),
                })}
              />
              <FieldError errors={[errors.title]} />
            </Field>

            <Field data-invalid={!!errors.slug}>
              <FieldLabel htmlFor="slug">Slug</FieldLabel>
              <Input
                id="slug"
                {...register("slug", { onChange: () => setSlugTouched(true) })}
              />
              <FieldError errors={[errors.slug]} />
            </Field>

            <Field>
              <FieldLabel>Parent page</FieldLabel>
              <Controller
                control={control}
                name="parentId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Top-level page">
                        {(value: string) =>
                          value === NONE
                            ? "Top-level page"
                            : (parentOptions.find((p) => p.id === value)?.title ?? "Top-level page")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Top-level page</SelectItem>
                      {parentOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="body">Body</FieldLabel>
              <Textarea
                id="body"
                rows={10}
                placeholder="Markdown supported..."
                {...register("body")}
              />
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <Button type="submit" disabled={isPending}>
              {isEdit ? "Save changes" : "Create page"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
