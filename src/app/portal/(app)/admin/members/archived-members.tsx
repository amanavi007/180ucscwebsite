"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { restoreMember, deleteMemberPermanently } from "@/actions/members";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { roleLabel } from "@/lib/auth/roles";
import type { ArchivedMember } from "./member-types";

export function ArchivedSection({ archivedMembers }: { archivedMembers: ArchivedMember[] }) {
  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">
        Former members. Restore them or delete permanently.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Archived</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {archivedMembers.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No archived members.
              </TableCell>
            </TableRow>
          )}
          {archivedMembers.map((m) => (
            <ArchivedMemberRow key={m.id} member={m} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ArchivedMemberRow({ member }: { member: ArchivedMember }) {
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);

  function onRestore() {
    startTransition(async () => {
      const result = await restoreMember(member.id);
      if (result?.error) toast.error(result.error);
      else toast.success(`${member.name} restored.`);
    });
  }

  function onDelete() {
    startTransition(async () => {
      const result = await deleteMemberPermanently(member.id);
      setDeleteOpen(false);
      if (result?.error) toast.error(result.error);
      else toast.success(`${member.name} permanently deleted.`);
    });
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{member.name}</TableCell>
      <TableCell className="text-muted-foreground">{member.email}</TableCell>
      <TableCell className="text-muted-foreground">{roleLabel(member.role)}</TableCell>
      <TableCell className="text-muted-foreground">
        {new Date(member.archived_at).toLocaleDateString()}
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={isPending}
                aria-label={`Actions for ${member.name}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRestore}>Restore</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
              Delete permanently
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Permanently delete {member.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This can&apos;t be undone. It only works if this account has no activity anywhere
                (no attendance, tasks, projects, meeting notes, etc.), and if it has any history,
                you&apos;ll get an error and it stays archived instead.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete} disabled={isPending}>
                Delete permanently
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}
