"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  bulkCreateMembers,
  resetMemberPassword,
  updateMemberRole,
  type BulkCreateResult,
} from "@/actions/members";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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

interface Member {
  id: string;
  name: string;
  role: UserRole;
  email: string;
}

const ROLE_OPTIONS = Object.keys(ROLE_LABELS) as UserRole[];

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
  defaultPassword,
}: {
  members: Member[];
  defaultPassword: string;
}) {
  const [bulkText, setBulkText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<BulkCreateResult[] | null>(null);

  const previewRows = parseRows(bulkText);

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
            password <code>{defaultPassword}</code> and a consultant role, and are forced to set
            their own password on first login. Change the default password in Settings.
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
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No members yet.
                  </TableCell>
                </TableRow>
              )}
              {members.map((m) => (
                <MemberRow key={m.id} member={m} defaultPassword={defaultPassword} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function MemberRow({ member, defaultPassword }: { member: Member; defaultPassword: string }) {
  const [isPending, startTransition] = useTransition();
  const [resetOpen, setResetOpen] = useState(false);

  function onRoleChange(value: string | null) {
    if (!value) return;
    startTransition(async () => {
      const result = await updateMemberRole(member.id, value as UserRole);
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

  return (
    <TableRow>
      <TableCell className="font-medium">{member.name}</TableCell>
      <TableCell className="text-muted-foreground">{member.email}</TableCell>
      <TableCell>
        <Select value={member.role} onValueChange={onRoleChange} disabled={isPending}>
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
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => setResetOpen(true)}
        >
          Reset password
        </Button>

        <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset {member.name}&apos;s password?</AlertDialogTitle>
              <AlertDialogDescription>
                Their password will be set back to the default (
                <code>{defaultPassword}</code>) and they&apos;ll be required to set a new one on
                next login.
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
      </TableCell>
    </TableRow>
  );
}
