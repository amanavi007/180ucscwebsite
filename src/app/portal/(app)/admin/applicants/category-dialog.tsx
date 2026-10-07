"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createCategoryAction, updateCategoryAction } from "@/actions/recruit";
import type { RecruitCategory } from "@/lib/data/recruit";
import { RECRUIT_SECTIONS, type RecruitSection } from "@/lib/recruit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CategoryDialog({ category, trigger }: { category?: RecruitCategory; trigger: React.ReactElement }) {
  const isEdit = !!category;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(category?.name ?? "");
  const [section, setSection] = useState<RecruitSection>(category?.section ?? "engagement");
  const [points, setPoints] = useState(String(category?.defaultPoints ?? 1));
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    const input = { name, section, defaultPoints: Number(points) };
    startTransition(async () => {
      const result = isEdit ? await updateCategoryAction(category.id, input) : await createCategoryAction(input);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(isEdit ? "Category updated." : "Category added.");
      setOpen(false);
      if (!isEdit) {
        setName("");
        setPoints("1");
      }
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit category" : "New category"}</DialogTitle>
          <DialogDescription>
            A category is a reason to give points, like &ldquo;Info Session&rdquo;. Changing the usual points only affects
            future entries; past entries keep what they were given.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="category-name">Name</FieldLabel>
            <Input id="category-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Case workshop" />
          </Field>
          <Field>
            <FieldLabel>Section</FieldLabel>
            <Select value={section} onValueChange={(v) => v && setSection(v as RecruitSection)}>
              <SelectTrigger className="w-full">
                <SelectValue>{(value: string) => RECRUIT_SECTIONS.find((s) => s.value === value)?.label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {RECRUIT_SECTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>Sections are how points will roll up into the final ranking later.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="category-points">Usual points</FieldLabel>
            <Input id="category-points" type="number" step="0.5" value={points} onChange={(e) => setPoints(e.target.value)} />
            <FieldDescription>Use a negative number for a penalty, like −1 for a no-show.</FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button disabled={isPending || !name.trim() || points.trim() === ""} onClick={submit}>
            {isEdit ? "Save" : "Add category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
