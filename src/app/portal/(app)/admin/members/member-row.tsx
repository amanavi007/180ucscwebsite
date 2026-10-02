"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import {
  resetMemberPassword,
  updateMemberEmail,
  updateMemberRole,
  archiveMember,
  type ArchiveMemberInput,
} from "@/actions/members";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { TableCell, TableRow } from "@/components/ui/table";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ROLE_LABELS, roleLabel } from "@/lib/auth/roles";
import type { UserRole } from "@/lib/supabase/database.types";
import { ROLE_OPTIONS, type Member } from "./member-types";
import { MaskedSecret } from "./masked-secret";

export function MemberRow({ member, defaultPassword }: { member: Member; defaultPassword: string }) {
  const [isPending, startTransition] = useTransition();
  const [resetOpen, setResetOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);

  function onChangeEmail(email: string) {
    startTransition(async () => {
      const result = await updateMemberEmail(member.id, email);
      if (result?.error) toast.error(result.error);
      else {
        setEmailOpen(false);
        toast.success(`Email updated for ${member.name}.`);
      }
    });
  }

  function onChangeRole(role: UserRole) {
    startTransition(async () => {
      const result = await updateMemberRole(member.id, role);
      if (result?.error) toast.error(result.error);
      else {
        setRoleOpen(false);
        toast.success("Role updated.");
      }
    });
  }

  function onResetPassword() {
    startTransition(async () => {
      const result = await resetMemberPassword(member.id);
      setResetOpen(false);
      if (result?.error) toast.error(result.error);
      else toast.success(`Password reset for ${member.name}.`);
    });
  }

  function onArchive(input: ArchiveMemberInput) {
    startTransition(async () => {
      const result = await archiveMember(member.id, input);
      if (result?.error) toast.error(result.error);
      else {
        setArchiveOpen(false);
        toast.success(`${member.name} archived.`);
      }
    });
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{member.name}</TableCell>
      <TableCell className="text-muted-foreground">{member.email}</TableCell>
      <TableCell>{roleLabel(member.role)}</TableCell>
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
            <DropdownMenuItem onClick={() => setRoleOpen(true)}>Change role…</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setEmailOpen(true)}>Edit email</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setResetOpen(true)}>Reset password</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setArchiveOpen(true)}>
              Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ChangeRoleDialog
          open={roleOpen}
          onOpenChange={setRoleOpen}
          memberName={member.name}
          currentRole={member.role}
          isPending={isPending}
          onSubmit={onChangeRole}
        />

        <EditEmailDialog
          open={emailOpen}
          onOpenChange={setEmailOpen}
          memberName={member.name}
          currentEmail={member.email}
          isPending={isPending}
          onSubmit={onChangeEmail}
        />

        <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset {member.name}&apos;s password?</AlertDialogTitle>
              <AlertDialogDescription>
                Their password will be set back to the default (
                <MaskedSecret value={defaultPassword} />) and they&apos;ll be required to set a
                new one on next login.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onResetPassword} disabled={isPending}>
                Reset password
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <ArchiveMemberDialog
          open={archiveOpen}
          onOpenChange={setArchiveOpen}
          memberName={member.name}
          isPending={isPending}
          onSubmit={onArchive}
        />
      </TableCell>
    </TableRow>
  );
}

function ChangeRoleDialog({
  open,
  onOpenChange,
  memberName,
  currentRole,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberName: string;
  currentRole: UserRole;
  isPending: boolean;
  onSubmit: (role: UserRole) => void;
}) {
  const [role, setRole] = useState<UserRole>(currentRole);

  function handleOpenChange(next: boolean) {
    if (next) setRole(currentRole);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change {memberName}&apos;s role</DialogTitle>
          <DialogDescription>Currently {roleLabel(currentRole)}.</DialogDescription>
        </DialogHeader>
        <Select value={role} onValueChange={(v) => v && setRole(v as UserRole)}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue>{(value: UserRole) => roleLabel(value)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button disabled={isPending || role === currentRole} onClick={() => onSubmit(role)}>
            Change role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditEmailDialog({
  open,
  onOpenChange,
  memberName,
  currentEmail,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberName: string;
  currentEmail: string;
  isPending: boolean;
  onSubmit: (email: string) => void;
}) {
  const [email, setEmail] = useState(currentEmail);

  function handleOpenChange(next: boolean) {
    if (next) setEmail(currentEmail);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {memberName}&apos;s email</DialogTitle>
          <DialogDescription>
            This changes the address they sign in with. Their account, project roster spots, and
            PM/SC roles stay exactly as they are. Don&apos;t delete and recreate an account to fix
            an email &mdash; that wipes their project memberships.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="edit-email">Email</FieldLabel>
          <Input
            id="edit-email"
            type="email"
            placeholder="name@180dc.org"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            disabled={isPending || !email.trim() || email.trim().toLowerCase() === currentEmail.toLowerCase()}
            onClick={() => onSubmit(email)}
          >
            Save email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArchiveMemberDialog({
  open,
  onOpenChange,
  memberName,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberName: string;
  isPending: boolean;
  onSubmit: (input: ArchiveMemberInput) => void;
}) {
  const [reason, setReason] = useState<"graduated" | "left">("graduated");
  const [currentTitle, setCurrentRole] = useState("");
  const [currentCompany, setCurrentCompany] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");

  function handleOpenChange(next: boolean) {
    if (next) {
      setReason("graduated");
      setCurrentRole("");
      setCurrentCompany("");
      setLinkedinUrl("");
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive {memberName}?</DialogTitle>
          <DialogDescription>
            They&apos;ll drop off the directory, search, and any team/task pickers, and lose their
            spot on this quarter&apos;s team if they have one. They can still sign in, and
            everything else about their history stays intact. You can restore them from the
            Archived list at any time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field>
            <FieldLabel htmlFor="archive-reason">Reason</FieldLabel>
            <Select value={reason} onValueChange={(v) => v && setReason(v as "graduated" | "left")}>
              <SelectTrigger id="archive-reason" size="sm">
                <SelectValue>{(value: string) => (value === "graduated" ? "Graduated" : "Left")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="graduated">Graduated</SelectItem>
                <SelectItem value="left">Left</SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription>
              Graduated members show up in the org-wide Alumni directory. &quot;Left&quot; stays
              private, same as today.
            </FieldDescription>
          </Field>

          {reason === "graduated" && (
            <>
              <Field>
                <FieldLabel htmlFor="archive-role">Current title (optional)</FieldLabel>
                <Input
                  id="archive-role"
                  placeholder="Product Manager"
                  value={currentTitle}
                  onChange={(e) => setCurrentRole(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="archive-company">Current company (optional)</FieldLabel>
                <Input
                  id="archive-company"
                  placeholder="Notion"
                  value={currentCompany}
                  onChange={(e) => setCurrentCompany(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="archive-linkedin">LinkedIn (optional)</FieldLabel>
                <Input
                  id="archive-linkedin"
                  placeholder="https://linkedin.com/in/..."
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                />
              </Field>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() => onSubmit({ reason, currentTitle, currentCompany, linkedinUrl })}
          >
            Archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
