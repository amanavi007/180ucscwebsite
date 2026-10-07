"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createEventAction } from "@/actions/recruit";
import type { RecruitCategory } from "@/lib/data/recruit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function EventDialog({
  quarterId,
  categories,
  trigger,
}: {
  quarterId: string;
  categories: RecruitCategory[];
  trigger: React.ReactElement;
}) {
  const choices = categories.filter((c) => !c.archived);
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState(choices[0]?.id ?? "");
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    startTransition(async () => {
      const result = await createEventAction({ quarterId, categoryId, name, date });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Event added.");
      setOpen(false);
      setName("");
      setDate("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New event</DialogTitle>
          <DialogDescription>
            An event is one dated occurrence, like &ldquo;Info Session 1&rdquo; on Oct 14. Attaching points to an event lets
            you see who missed which one.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Category</FieldLabel>
            <Select value={categoryId} onValueChange={(v) => v && setCategoryId(v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick a category">
                  {(value: string) => choices.find((c) => c.id === value)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {choices.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="event-name">Name</FieldLabel>
            <Input id="event-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Info Session 1" />
          </Field>
          <Field>
            <FieldLabel htmlFor="event-date">Date</FieldLabel>
            <Input id="event-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button disabled={isPending || !categoryId || !name.trim() || !date} onClick={submit}>
            Add event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
