"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Pencil } from "lucide-react";
import { deletePlanTeam, renamePlanTeam } from "@/actions/team-builder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  onSave,
}: {
  team: BoardTeam;
  readOnly: boolean;
  onSetCandidate: (userId: string, role: LeadCandidateRole, active: boolean) => void;
  /** Wraps a mutation so the board's autosave indicator reflects it too. */
  onSave: <T,>(fn: () => Promise<T>) => Promise<T>;
}) {
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(team.clientName);
  const router = useRouter();

  const headcount = team.pm.length + team.sc.length + team.members.length;

  function onRename() {
    if (name.trim() === team.clientName) {
      setRenaming(false);
      return;
    }
    startTransition(async () => {
      const result = await onSave(() => renamePlanTeam(team.id, name));
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
      const result = await onSave(() => deletePlanTeam(team.id));
      if (result?.error) toast.error(result.error);
      else router.refresh();
      setDeleteOpen(false);
    });
  }

  return (
    <Card className="w-80 shrink-0">
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
        <div className="flex shrink-0 items-center gap-1">
          <Badge variant="secondary">{headcount}</Badge>
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
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="mx-auto w-[65%] rounded-lg bg-primary/5 p-2">
          <p className="mb-1.5 flex items-center justify-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <span className="size-1.5 rounded-full bg-primary" />
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
                onSetCandidate={(role, active) => onSetCandidate(p.id, role, active)}
              />
            ))}
          </DropZone>
        </div>

        <div className="mx-auto w-[85%] rounded-lg bg-warm/5 p-2">
          <p className="mb-1.5 flex items-center justify-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <span className="size-1.5 rounded-full bg-warm" />
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
                onSetCandidate={(role, active) => onSetCandidate(p.id, role, active)}
              />
            ))}
          </DropZone>
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Members
          </p>
          <DropZone
            id={`team:${team.id}:member`}
            className="grid grid-cols-2 gap-2"
            placeholder={team.members.length === 0 ? "Drop members here" : undefined}
          >
            {team.members.map((p) => (
              <MemberChip
                key={p.id}
                profile={p}
                readOnly={readOnly}
                onSetCandidate={(role, active) => onSetCandidate(p.id, role, active)}
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
