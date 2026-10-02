"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  MoreHorizontal,
} from "lucide-react";
import {
  bulkCreateMembers,
  resetMemberPassword,
  updateMemberEmail,
  updateMemberRole,
  archiveMember,
  restoreMember,
  deleteMemberPermanently,
  type ArchiveMemberInput,
  type BulkCreateResult,
} from "@/actions/members";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
import { ROLE_LABELS, compareByRole, roleLabel } from "@/lib/auth/roles";
import { ListSearch } from "@/components/list-search";
import { useFilteredList } from "@/lib/use-filtered-list";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/supabase/database.types";

interface Member {
  id: string;
  name: string;
  role: UserRole;
  email: string;
}

interface ArchivedMember extends Member {
  archived_at: string;
}

const ROLE_OPTIONS = Object.keys(ROLE_LABELS) as UserRole[];

/**
 * Execs legitimately need to read this off to a new member, so hide it behind
 * a reveal toggle rather than exposing it in plain text everywhere it shows up.
 */
function MaskedSecret({ value }: { value: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <code>{visible ? value : "•".repeat(value.length || 8)}</code>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
      </Button>
    </span>
  );
}

type MemberSortKey = "name" | "role";
type SortDir = "asc" | "desc";

const MEMBER_COMPARATORS: Record<MemberSortKey, (a: Member, b: Member) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  role: compareByRole, // seniority, not alphabetical by role label
};

function SortableMemberHead({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: MemberSortKey;
  activeKey: MemberSortKey | null;
  dir: SortDir;
  onSort: (key: MemberSortKey) => void;
}) {
  const isActive = activeKey === sortKey;
  const Icon = isActive ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "flex items-center gap-1 hover:text-foreground",
          isActive ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <Icon className="size-3.5" />
      </button>
    </TableHead>
  );
}

function parseRows(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, email] = line.split(",").map((s) => s.trim());
      return { name: name ?? "", email: email ?? "" };
    });
}

export function MembersPanel({
  members,
  archivedMembers,
  defaultPassword,
}: {
  members: Member[];
  archivedMembers: ArchivedMember[];
  defaultPassword: string;
}) {
  const [bulkText, setBulkText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<BulkCreateResult[] | null>(null);
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [sortKey, setSortKey] = useState<MemberSortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const previewRows = parseRows(bulkText);

  const { query, setQuery, filtered: searchedMembers } = useFilteredList<Member>(members, [
    "name",
    "email",
  ]);
  const roleFiltered =
    roleFilter === "all" ? searchedMembers : searchedMembers.filter((m) => m.role === roleFilter);

  function onSort(key: MemberSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const visibleMembers = useMemo(() => {
    const copy = [...roleFiltered];
    if (!sortKey) return copy.sort(compareByRole); // default: seniority, then name
    const compare = MEMBER_COMPARATORS[sortKey];
    return copy.sort((a, b) => (sortDir === "asc" ? compare(a, b) : -compare(a, b)));
  }, [roleFiltered, sortKey, sortDir]);

  function onCreate() {
    const rows = parseRows(bulkText);
    if (rows.length === 0) {
      toast.error("Paste at least one row: Name, email@180dc.org");
      return;
    }
    startTransition(async () => {
      const res = await bulkCreateMembers(rows);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const rowResults = res.results ?? [];
      setResults(rowResults);
      const created = rowResults.filter((r) => r.status === "created").length;
      const failed = rowResults.length - created;
      if (created > 0) {
        toast.success(`${created} account${created === 1 ? "" : "s"} created.`);
        setBulkText("");
      }
      if (failed > 0) toast.error(`${failed} row${failed === 1 ? "" : "s"} failed -- see details below.`);
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add members</CardTitle>
          <CardDescription>
            One per line: <code>Name, email@180dc.org</code>. New accounts get the default
            password <MaskedSecret value={defaultPassword} /> and a consultant role, and are
            forced to set their own password on first login. Change the default password in
            Settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            rows={5}
            placeholder={"Jane Doe, jane@180dc.org\nJohn Smith, john@180dc.org"}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {previewRows.length} row{previewRows.length === 1 ? "" : "s"} ready.
            </p>
            <Button onClick={onCreate} disabled={isPending || previewRows.length === 0}>
              Create accounts
            </Button>
          </div>

          {results && results.length > 0 && (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r, i) => (
                    <TableRow key={`${r.email}-${i}`}>
                      <TableCell>{r.name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.email || "—"}</TableCell>
                      <TableCell>
                        {r.status === "created" ? (
                          <Badge className="border-transparent bg-primary/10 text-primary">
                            Created
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-transparent bg-destructive/10 text-destructive"
                          >
                            {r.message ?? "Failed"}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            {members.length} member{members.length === 1 ? "" : "s"} total.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <ListSearch
              value={query}
              onChange={setQuery}
              placeholder="Search name or email..."
              className="w-64"
            />
            <Select value={roleFilter} onValueChange={(v) => v && setRoleFilter(v as UserRole | "all")}>
              <SelectTrigger size="sm" className="w-48">
                <SelectValue>
                  {(value: UserRole | "all") => (value === "all" ? "All roles" : roleLabel(value))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableMemberHead label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={onSort} />
                <TableHead>Email</TableHead>
                <SortableMemberHead label="Role" sortKey="role" activeKey={sortKey} dir={sortDir} onSort={onSort} />
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleMembers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {members.length === 0 ? "No members yet." : "No members match."}
                  </TableCell>
                </TableRow>
              )}
              {visibleMembers.map((m) => (
                <MemberRow key={m.id} member={m} defaultPassword={defaultPassword} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ArchivedSection archivedMembers={archivedMembers} />
    </div>
  );
}

function MemberRow({ member, defaultPassword }: { member: Member; defaultPassword: string }) {
  const [isPending, startTransition] = useTransition();
  const [resetOpen, setResetOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [roleChangeOpen, setRoleChangeOpen] = useState(false);
  const [pendingRole, setPendingRole] = useState<UserRole | null>(null);

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

  function onRoleSelect(value: string | null) {
    if (!value || value === member.role) return;
    setPendingRole(value as UserRole);
    setRoleChangeOpen(true);
  }

  function onConfirmRoleChange() {
    if (!pendingRole) return;
    startTransition(async () => {
      const result = await updateMemberRole(member.id, pendingRole);
      setRoleChangeOpen(false);
      if (result?.error) toast.error(result.error);
      else toast.success("Role updated.");
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
      <TableCell>
        <Select value={member.role} onValueChange={onRoleSelect} disabled={isPending}>
          <SelectTrigger size="sm" className="w-56">
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

        <AlertDialog
          open={roleChangeOpen}
          onOpenChange={(open) => {
            setRoleChangeOpen(open);
            if (!open) setPendingRole(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Change {member.name}&apos;s role?</AlertDialogTitle>
              <AlertDialogDescription>
                {member.name} will be set to{" "}
                <span className="font-medium">
                  {pendingRole ? ROLE_LABELS[pendingRole] : ""}
                </span>
                .
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onConfirmRoleChange} disabled={isPending}>
                Change role
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
            <DropdownMenuItem onClick={() => setEmailOpen(true)}>Edit email</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setResetOpen(true)}>Reset password</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setArchiveOpen(true)}>
              Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

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

function ArchivedSection({ archivedMembers }: { archivedMembers: ArchivedMember[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left"
      >
        <div>
          <p className="text-sm font-semibold">Archived ({archivedMembers.length})</p>
          <p className="text-sm text-muted-foreground">
            Former members -- restore them or delete permanently.
          </p>
        </div>
        {open ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {open && (
        <CardContent className="pt-0">
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
        </CardContent>
      )}
    </Card>
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
                (no attendance, tasks, projects, meeting notes, etc.) -- if it has any history,
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
