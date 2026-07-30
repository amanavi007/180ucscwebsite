"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Pencil } from "lucide-react";
import { deletePlanTeam, renamePlanTeam } from "@/actions/team-builder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { DropZone } from "./drop-zone";
import { MemberChip } from "./member-chip";
import type { BoardTeam } from "@/lib/data/team-builder";
import type { LeadCandidateRole } from "@/lib/supabase/database.types";

export function TeamColumn({
  team,
  readOnly,
  onSetCandidate,
}: {
  team: BoardTeam;
  readOnly: boolean;
  onSetCandidate: (userId: string, role: LeadCandidateRole | null) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(team.clientName);
  const router = useRouter();

  function onRename() {
    if (name.trim() === team.clientName) {
      setRenaming(false);
      return;
    }
    startTransition(async () => {
      const result = await renamePlanTeam(team.id, name);
      if (result?.error) {
        toast.error(result.error);
        setName(team.clientName);
      }
      setRenaming(false);
      router.refresh();
    });
  }

  function onDelete() {
    startTransition(async () => {
      const result = await deletePlanTeam(team.id);
      if (result?.error) toast.error(result.error);
      else router.refresh();
      setDeleteOpen(false);
    });
  }

  return (
    <Card className="w-72 shrink-0">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 border-b py-3">
        {renaming ? (
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={onRename}
            onKeyDown={(e) => e.key === "Enter" && onRename()}
            disabled={isPending}
            className="h-7 text-sm"
          />
        ) : readOnly ? (
          <span className="truncate text-sm font-medium">{team.clientName}</span>
        ) : (
          <button
            type="button"
            onClick={() => setRenaming(true)}
            className="flex min-w-0 items-center gap-1.5 text-sm font-medium hover:underline"
          >
            <span className="truncate">{team.clientName}</span>
            <Pencil className="size-3 shrink-0 text-muted-foreground" />
          </button>
        )}
        {!readOnly && (
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={isPending}
            onClick={() => setDeleteOpen(true)}
            aria-label={`Delete ${team.clientName}`}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            PM
          </p>
          <DropZone
            id={`team:${team.id}:pm`}
            placeholder={team.pm.length === 0 ? "Drop a PM here" : undefined}
          >
            {team.pm.map((p) => (
              <MemberChip
                key={p.id}
                profile={p}
                readOnly={readOnly}
                onSetCandidate={(role) => onSetCandidate(p.id, role)}
              />
            ))}
          </DropZone>
        </div>

        <div>
          <p className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            SC
          </p>
          <DropZone
            id={`team:${team.id}:sc`}
            placeholder={team.sc.length === 0 ? "Drop an SC here" : undefined}
          >
            {team.sc.map((p) => (
              <MemberChip
                key={p.id}
                profile={p}
                readOnly={readOnly}
                onSetCandidate={(role) => onSetCandidate(p.id, role)}
              />
            ))}
          </DropZone>
        </div>

        <div>
          <p className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Members
          </p>
          <DropZone
            id={`team:${team.id}:member`}
            placeholder={team.members.length === 0 ? "Drop members here" : undefined}
          >
            {team.members.map((p) => (
              <MemberChip
                key={p.id}
                profile={p}
                readOnly={readOnly}
                onSetCandidate={(role) => onSetCandidate(p.id, role)}
              />
            ))}
          </DropZone>
        </div>
      </CardContent>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {team.clientName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the team from this draft only -- it doesn&apos;t touch any real team or
              data. This can&apos;t be undone.
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
    </Card>
  );
}
