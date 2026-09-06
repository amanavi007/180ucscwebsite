"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { createPlan, deletePlan, duplicatePlan, renamePlan } from "@/actions/team-builder";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import type { PlanSummary } from "@/lib/data/team-builder";

type DialogMode = "new" | "duplicate" | "rename" | null;

export function PlanSelect({
  quarterId,
  plans,
  selectedPlan,
}: {
  quarterId: string;
  plans: PlanSummary[];
  selectedPlan: PlanSummary | null;
}) {
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [nameValue, setNameValue] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function goToPlan(planId: string) {
    router.push(`/portal/admin/team-builder?quarter=${quarterId}&plan=${planId}`);
  }

  function openDialog(mode: DialogMode) {
    setNameValue(
      mode === "rename" ? (selectedPlan?.name ?? "") : mode === "duplicate" ? `${selectedPlan?.name ?? ""} copy` : "",
    );
    setDialogMode(mode);
  }

  function onSubmitDialog() {
    if (!nameValue.trim()) return;
    startTransition(async () => {
      if (dialogMode === "new") {
        const result = await createPlan(quarterId, nameValue);
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        setDialogMode(null);
        if (result.id) goToPlan(result.id);
        else router.refresh();
      } else if (dialogMode === "duplicate" && selectedPlan) {
        const result = await duplicatePlan(selectedPlan.id, nameValue);
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        setDialogMode(null);
        if (result.id) goToPlan(result.id);
        else router.refresh();
      } else if (dialogMode === "rename" && selectedPlan) {
        const result = await renamePlan(selectedPlan.id, nameValue);
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        setDialogMode(null);
        router.refresh();
      }
    });
  }

  function onDelete() {
    if (!selectedPlan) return;
    startTransition(async () => {
      const result = await deletePlan(selectedPlan.id);
      if (result?.error) {
        toast.error(result.error);
        setDeleteOpen(false);
        return;
      }
      setDeleteOpen(false);
      const next = plans.find((p) => p.id !== selectedPlan.id);
      if (next) goToPlan(next.id);
      else router.push(`/portal/admin/team-builder?quarter=${quarterId}`);
    });
  }

  const dialogTitle =
    dialogMode === "new" ? "New draft" : dialogMode === "duplicate" ? "Duplicate draft" : "Rename draft";

  return (
    <div className="flex items-center gap-1.5">
      {plans.length > 0 && selectedPlan && (
        <Select value={selectedPlan.id} onValueChange={(v) => v && goToPlan(v)}>
          <SelectTrigger size="sm" className="w-56">
            <SelectValue>
              {(value: string) => {
                const p = plans.find((pp) => pp.id === value);
                return p ? p.name : "Select a draft";
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {plans.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
                {p.isFinalized ? " (finalized)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {selectedPlan?.isFinalized && (
        <Badge variant="outline" className="border-transparent bg-primary/10 text-primary">
          Finalized
        </Badge>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label="Draft actions">
              <MoreHorizontal className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => openDialog("new")}>New draft</DropdownMenuItem>
          {selectedPlan && (
            <DropdownMenuItem onClick={() => openDialog("duplicate")}>Duplicate</DropdownMenuItem>
          )}
          {selectedPlan && <DropdownMenuItem onClick={() => openDialog("rename")}>Rename</DropdownMenuItem>}
          {selectedPlan && !selectedPlan.isFinalized && (
            <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && setDialogMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Draft name"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSubmitDialog()}
            disabled={isPending}
          />
          <DialogFooter>
            <Button onClick={onSubmitDialog} disabled={isPending || !nameValue.trim()}>
              {dialogMode === "new" ? "Create" : dialogMode === "duplicate" ? "Duplicate" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedPlan?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the draft and everything in it. This can&apos;t be undone.
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
    </div>
  );
}
