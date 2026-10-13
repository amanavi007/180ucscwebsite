"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { approveAll, approveSubmission, rejectSubmission, setListed } from "@/actions/team-profiles";
import type { TeamPageAdminRow } from "@/lib/data/team-page";
import { roleLabel } from "@/lib/auth/roles";
import { approvalWouldRelist, formInitialValues, hasPending, teamPhotoUrl } from "@/lib/team-page";
import { TeamProfileForm } from "@/components/team/team-profile-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const photo = (path: string | null) => (path ? teamPhotoUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!, path) : null);

function ProfileSnapshot({
  title,
  data,
  changed,
}: {
  title: string;
  data: { photoPath: string | null; major: string | null; linkedin: string | null; bio: string | null };
  changed?: { photo: boolean; major: boolean; linkedin: boolean; bio: boolean };
}) {
  const mark = (on?: boolean) => (on ? "rounded bg-status-warn px-1" : "");
  const src = photo(data.photoPath);
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase">{title}</p>
      <div className={`aspect-[4/5] w-28 overflow-hidden rounded-lg bg-muted ${changed?.photo ? "ring-2 ring-link" : ""}`}>
        {src && (
          // eslint-disable-next-line @next/next/no-img-element -- admin preview
          <img src={src} alt="" className="size-full object-cover" />
        )}
      </div>
      <p className="text-sm"><span className={mark(changed?.major)}>{data.major || "No major"}</span></p>
      <p className="text-sm break-all"><span className={mark(changed?.linkedin)}>{data.linkedin || "No LinkedIn"}</span></p>
      <p className="text-sm text-muted-foreground"><span className={mark(changed?.bio)}>{data.bio || "No bio"}</span></p>
    </div>
  );
}

export function TeamPagePanel({ rows }: { rows: TeamPageAdminRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);

  const pendingRows = rows.filter((r) => hasPending(r.row));
  const editing = rows.find((r) => r.id === editingId) ?? null;

  function run(action: () => Promise<{ error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  function statusBadge(r: TeamPageAdminRow) {
    if (hasPending(r.row)) return <Badge variant="secondary">Pending</Badge>;
    if (r.row?.listed) return <Badge>Live</Badge>;
    if (r.row?.photo_path) return <Badge variant="outline">Hidden</Badge>;
    return <Badge variant="outline">Not set up</Badge>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Pending review ({pendingRows.length})</CardTitle>
            <CardDescription>Approve to publish on the public Our Team page.</CardDescription>
          </div>
          {pendingRows.length > 1 && (
            <Button
              size="sm"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const result = await approveAll();
                  if (result.error) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success(
                    result.skipped
                      ? `Approved. ${result.skipped} hidden member(s) skipped -- approve them individually.`
                      : "Approved all.",
                  );
                  router.refresh();
                })
              }
            >
              <Check /> Approve all
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {pendingRows.length === 0 && <p className="text-sm text-muted-foreground">Nothing waiting for review.</p>}
          {pendingRows.map((r) => {
            const row = r.row!;
            const hasLive = !!row.photo_path;
            return (
              <div key={r.id} className="space-y-3 rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {r.name} <span className="font-normal text-muted-foreground">· {roleLabel(r.role)}</span>
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => rejectSubmission(r.id), "Rejected.")}>
                      <X /> Reject
                    </Button>
                    <Button size="sm" disabled={isPending} onClick={() => run(() => approveSubmission(r.id), "Approved.")}>
                      <Check /> Approve
                    </Button>
                  </div>
                </div>
                {approvalWouldRelist(row) && (
                  <p className="text-sm text-status-warn-foreground">
                    Currently hidden from the page. Approving will show them again (Approve all skips them).
                  </p>
                )}
                <div className="grid gap-6 sm:grid-cols-2">
                  {hasLive && (
                    <ProfileSnapshot
                      title="Live now"
                      data={{ photoPath: row.photo_path, major: row.major, linkedin: row.linkedin_url, bio: row.bio }}
                    />
                  )}
                  <ProfileSnapshot
                    title="Proposed"
                    data={{ photoPath: row.pending_photo_path, major: row.pending_major, linkedin: row.pending_linkedin_url, bio: row.pending_bio }}
                    changed={
                      hasLive
                        ? {
                            photo: row.pending_photo_path !== row.photo_path,
                            major: row.pending_major !== row.major,
                            linkedin: row.pending_linkedin_url !== row.linkedin_url,
                            bio: row.pending_bio !== row.bio,
                          }
                        : undefined
                    }
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Roster</CardTitle>
          <CardDescription>Everyone with an active account. Name and title come from the portal.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{roleLabel(r.role)}</TableCell>
                  <TableCell>{statusBadge(r)}</TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => setEditingId(r.id)}>Edit</Button>
                    {r.row?.photo_path && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => run(() => setListed(r.id, !r.row!.listed), r.row!.listed ? "Hidden." : "Shown.")}
                      >
                        {r.row.listed ? "Hide" : "Show"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit {editing?.name}</DialogTitle>
          </DialogHeader>
          {editing && (
            <TeamProfileForm
              key={editing.id}
              targetId={editing.id}
              mode="exec"
              initial={formInitialValues(editing.row, editing.profileLinkedin)}
              approvedPhotoPath={editing.row?.photo_path ?? null}
              onSaved={() => setEditingId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
