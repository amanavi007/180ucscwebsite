"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GitMerge } from "lucide-react";
import { mergeClients } from "@/actions/clients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Field, FieldLabel } from "@/components/ui/field";
import type { ClientDetail } from "@/lib/data/clients";

/**
 * Merges `client` (the duplicate) into another client the exec picks. The
 * auto-link trigger in the projects table matches client_name exactly, so a
 * typo or naming variant creates a second client record with no built-in way
 * to reconcile it -- this is that reconciliation path. Deleting a client and
 * reassigning its projects can't be undone, so -- like the Quarters
 * cascade-delete -- the final step requires typing the client's name back.
 */
export function MergeClientDialog({
  client,
  otherClients,
}: {
  client: ClientDetail;
  otherClients: { id: string; name: string }[];
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const projectCount = client.projects.length;
  const target = otherClients.find((c) => c.id === targetId);
  const canConfirm = confirmText.trim() === client.name;

  function reset() {
    setTargetId("");
    setConfirmText("");
  }

  function onContinue() {
    if (!targetId) return;
    setPickerOpen(false);
    setConfirmOpen(true);
  }

  function onConfirm() {
    if (!canConfirm || !targetId) return;
    startTransition(async () => {
      const result = await mergeClients(targetId, client.id);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${client.name} merged into ${target?.name ?? "the other client"}.`);
      setConfirmOpen(false);
      reset();
      router.push("/portal/clients");
      router.refresh();
    });
  }

  if (otherClients.length === 0) return null;

  return (
    <>
      <Dialog
        open={pickerOpen}
        onOpenChange={(next) => {
          setPickerOpen(next);
          if (!next) reset();
        }}
      >
        <DialogTrigger
          render={
            <Button variant="outline" size="sm">
              <GitMerge />
              Merge into another client
            </Button>
          }
        />
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Merge {client.name} into another client</DialogTitle>
            <DialogDescription>
              {projectCount === 0
                ? `${client.name} has no linked projects.`
                : `${projectCount} project${projectCount === 1 ? "" : "s"} will move to the client you pick below. ${client.name} will then be deleted.`}
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel>Merge into</FieldLabel>
            <Select value={targetId} onValueChange={(value) => setTargetId(value ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a client">
                  {(value: string) => otherClients.find((c) => c.id === value)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {otherClients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter className="mt-6">
            <Button type="button" disabled={!targetId} onClick={onContinue}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {client.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {projectCount > 0
                ? `This permanently moves ${projectCount} project${projectCount === 1 ? "" : "s"} to ${target?.name} and deletes ${client.name}. This can't be undone.`
                : `This permanently deletes ${client.name} and merges it into ${target?.name}. This can't be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="confirm-merge-name">
              Type <span className="font-medium">{client.name}</span> to confirm.
            </FieldLabel>
            <Input
              id="confirm-merge-name"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending || !canConfirm}
              onClick={onConfirm}
            >
              Merge and delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
