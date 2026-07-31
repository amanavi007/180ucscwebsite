"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { updateClientRecord } from "@/actions/clients";
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
import type { ClientDetail } from "@/lib/data/clients";

const schema = z.object({
  name: z.string().min(1, "Client name is required."),
  contactName: z.string(),
  contactEmail: z.string(),
  notes: z.string(),
});

type FormValues = z.infer<typeof schema>;

export function EditClientDialog({ client }: { client: ClientDetail }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: {
      name: client.name,
      contactName: client.contactName ?? "",
      contactEmail: client.contactEmail ?? "",
      notes: client.notes ?? "",
    },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await updateClientRecord(client.id, {
        name: values.name,
        contactName: values.contactName || null,
        contactEmail: values.contactEmail || null,
        notes: values.notes || null,
      });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Client updated.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Pencil />
            Edit
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit client</DialogTitle>
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
              <Textarea id="notes" rows={4} {...register("notes")} />
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
  );
}
