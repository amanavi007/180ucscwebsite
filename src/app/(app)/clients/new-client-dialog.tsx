"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { createClientRecord } from "@/actions/clients";
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
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";

const schema = z.object({
  name: z.string().min(1, "Client name is required."),
  contactName: z.string(),
  contactEmail: z.string(),
  notes: z.string(),
});

type FormValues = z.infer<typeof schema>;

export function NewClientDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", contactName: "", contactEmail: "", notes: "" },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await createClientRecord({
        name: values.name,
        contactName: values.contactName || null,
        contactEmail: values.contactEmail || null,
        notes: values.notes || null,
      });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Client added.");
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus />
            New client
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New client</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="name">Client name</FieldLabel>
              <Input id="name" {...register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="contactName">Contact name</FieldLabel>
              <Input id="contactName" {...register("contactName")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="contactEmail">Contact email</FieldLabel>
              <Input id="contactEmail" type="email" {...register("contactEmail")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="notes">Notes</FieldLabel>
              <Textarea id="notes" rows={3} {...register("notes")} />
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="submit" disabled={isPending}>
              Add client
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
