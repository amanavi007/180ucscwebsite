"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  resetMemberPassword,
  updateMemberEmail,
  updateMemberRole,
  archiveMember,
  type ArchiveMemberInput,
} from "@/actions/members";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { PersonAvatar } from "@/components/person-avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { ROLE_OPTIONS, type Member, type MemberStats } from "./member-types";
import { MaskedSecret } from "./masked-secret";

/** Everything you can do to one member, in a panel beside the roster. Keyed by member so drafts reset when you pick someone else. */
export function MemberInspector({
  member,
  stats,
  photo,
  defaultPassword,
  onClose,
}: {
  member: Member;
  stats: MemberStats | undefined;
  photo?: string;
  defaultPassword: string;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [role, setRole] = useState<UserRole>(member.role);
  const [email, setEmail] = useState(member.email);
  const [resetOpen, setResetOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const roleChanged = role !== member.role;
  const emailChanged = email.trim() !== "" && email.trim().toLowerCase() !== member.email.toLowerCase();

  function saveRole() {
    startTransition(async () => {
      const result = await updateMemberRole(member.id, role);
      if (result?.error) toast.error(result.error);
      else toast.success(`${member.name} is now ${roleLabel(role)}.`);
    });
  }

  function saveEmail() {
    startTransition(async () => {
      const result = await updateMemberEmail(member.id, email);
      if (result?.error) toast.error(result.error);
      else toast.success(`Email updated for ${member.name}.`);
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
        onClose();
      }
    });
  }

  return (
    <aside aria-label={member.name} className="space-y-6 rounded-[22px] border bg-card p-6 xl:sticky xl:top-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <PersonAvatar name={member.name} src={photo} className="size-14 text-lg" />
          <div className="min-w-0">
            <h2 className="truncate text-xl">{member.name}</h2>
            <Badge variant="muted" className="mt-1">
              {roleLabel(member.role)}
            </Badge>
          </div>
        </div>
        <Button variant="outline" size="icon-sm" onClick={onClose} aria-label="Close panel">
          ✕
        </Button>
      </div>

      {stats && (
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-2xl bg-muted p-3">
            <dt className="text-muted-foreground">Team</dt>
            <dd className="mt-0.5 font-semibold">{stats.team}</dd>
          </div>
          <div className="rounded-2xl bg-muted p-3">
            <dt className="text-muted-foreground">Attendance</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">
              {stats.attendanceRate === null ? "–" : `${Math.round(stats.attendanceRate * 100)}%`}
            </dd>
          </div>
          <div className="rounded-2xl bg-muted p-3">
            <dt className="text-muted-foreground">Tasks</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">
              {stats.tasksDone} of {stats.tasksTotal}
              {stats.overdueTasks > 0 && <span className="block text-xs font-semibold text-status-bad-foreground">{stats.overdueTasks} overdue</span>}
            </dd>
          </div>
        </dl>
      )}

      <div className="space-y-5">
        <Field>
          <FieldLabel htmlFor="member-role">Role</FieldLabel>
          <div className="flex gap-2">
            <Select value={role} onValueChange={(v) => v && setRole(v as UserRole)}>
              <SelectTrigger id="member-role" className="flex-1">
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
            <Button variant="outline" disabled={isPending || !roleChanged} onClick={saveRole}>
              Save role
            </Button>
          </div>
        </Field>

        <Field>
          <FieldLabel htmlFor="member-email">Email</FieldLabel>
          <div className="flex gap-2">
            <Input id="member-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button variant="outline" disabled={isPending || !emailChanged} onClick={saveEmail}>
              Save email
            </Button>
          </div>
          <FieldDescription>
            This is the address they sign in with. Their projects and PM/SC roles stay as they are, so fix an email here instead of deleting and recreating the account.
          </FieldDescription>
        </Field>
      </div>

      <div className="border-t pt-5">
        <h3 className="text-sm font-bold">Reset password</h3>
        <p className="mt-1 mb-3 text-sm text-muted-foreground">
          Sets it back to the default and asks them to choose a new one the next time they sign in.
        </p>
        <Button variant="outline" disabled={isPending} onClick={() => setResetOpen(true)}>
          Reset password
        </Button>
      </div>

      <div className="border-t pt-5">
        <h3 className="text-sm font-bold">Archive {member.name.split(" ")[0]}</h3>
        <p className="mt-1 mb-3 text-sm text-muted-foreground">
          Removes them from the directory and this quarter&apos;s team. You can bring them back from the Archived list.
        </p>
        <Button variant="destructive" disabled={isPending} onClick={() => setArchiveOpen(true)}>
          Archive…
        </Button>
      </div>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset {member.name}&apos;s password?</AlertDialogTitle>
            <AlertDialogDescription>
              Their password will be set back to the default (<MaskedSecret value={defaultPassword} />) and they&apos;ll be
              required to set a new one on next login.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onResetPassword} disabled={isPending}>
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
    </aside>
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
