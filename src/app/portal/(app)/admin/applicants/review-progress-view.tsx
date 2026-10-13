"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Download, Users } from "lucide-react";
import { assignReviewersAction, nudgeReviewerAction, setApplicantReviewersAction, setRevealAction } from "@/actions/recruit-review";
import type { ReviewerInsightRow, ScoringBundle } from "@/lib/data/recruit-scoring";
import {
  dashboardCsv,
  filterDashboardApplicants,
  STATUS_LABELS,
  type DashboardApplicant,
  type DashboardFilter,
} from "@/lib/recruit-review-dashboard";
import { downloadCsv, toCsv } from "@/lib/csv";
import { Badge } from "@/components/ui/badge";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReviewerInsights } from "./reviewer-insights";
import { StatusChip, type StatusTone } from "./status-chip";

type Setup = ScoringBundle["reviewSetup"];
type Role = "assigned" | "none" | "conflict";

const FILTERS: { value: DashboardFilter; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "needs", label: "Needs reviewers" },
  { value: "in-progress", label: "In progress" },
  { value: "complete", label: "Complete" },
];

const ROLE_LABELS: Record<Role, string> = {
  assigned: "Assigned",
  none: "Not assigned",
  conflict: "Conflict (never assign)",
};

const fmt = (n: number | null) => (n === null ? "–" : n.toFixed(2));

const STATUS_TONE: Record<DashboardApplicant["state"]["status"], StatusTone> = {
  unassigned: "warn",
  "not-started": "neutral",
  "in-progress": "warn",
  complete: "ok",
  revealed: "ok",
};

export function ReviewProgressView({
  quarterId,
  dashboard,
  setup,
  insights,
  minN,
}: {
  quarterId: string;
  dashboard: ScoringBundle["dashboard"];
  setup: Setup;
  insights: ReviewerInsightRow[];
  minN: number;
}) {
  const [filter, setFilter] = useState<DashboardFilter>("all");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const visible = filterDashboardApplicants(dashboard.applicants, filter, query);
  const editing = dashboard.applicants.find((a) => a.id === editingId) ?? null;

  function assign() {
    startTransition(async () => {
      const out = await assignReviewersAction({ quarterId });
      if (out.error) {
        toast.error(out.error);
        return;
      }
      toast.success(out.added ? `${out.added} assignments made.` : "Everyone already has their reviewers.");
      router.refresh();
    });
  }

  function nudge(reviewerId: string, name: string) {
    startTransition(async () => {
      const out = await nudgeReviewerAction({ quarterId, reviewerId });
      if (out.error) toast.error(out.error);
      else toast.success(`Reminder sent to ${name}.`);
    });
  }

  function reveal(applicantId: string, revealed: boolean) {
    startTransition(async () => {
      const out = await setRevealAction({ applicantId, revealed });
      if (out.error) {
        toast.error(out.error);
        return;
      }
      router.refresh();
    });
  }

  function exportCsv() {
    const { headers, rows } = dashboardCsv(visible);
    downloadCsv("review-progress.csv", toCsv(headers, rows));
  }

  if (dashboard.totals.applicants === 0) {
    return (
      <div className="mt-8 py-10 text-center">
        <p className="font-medium">No applicants yet</p>
        <p className="text-sm text-muted-foreground">Import applications first. Reviewers get assigned right after.</p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-8">
      <section className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Scores stay hidden from other reviewers until everyone assigned has submitted.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download />
            Export CSV
          </Button>
          <Button onClick={assign} disabled={isPending}>
            <Users />
            Assign reviewers
          </Button>
        </div>
      </section>

      <section aria-label="Totals" className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {[
          { n: dashboard.totals.complete, label: "Fully reviewed", tone: "bg-sidebar text-sidebar-primary" },
          {
            n: Math.max(0, dashboard.totals.applicants - dashboard.totals.complete - dashboard.totals.unassigned),
            label: "In progress",
            tone: "bg-status-warn text-status-warn-foreground",
          },
          { n: dashboard.totals.applicants, label: "Applicants", tone: "bg-status-info text-status-info-foreground" },
          { n: dashboard.totals.unassigned, label: "No reviewer yet", tone: "bg-status-bad text-status-bad-foreground" },
        ].map((t) => (
          <div key={t.label} className={`rounded-[22px] p-5 ${t.tone}`}>
            <div className="font-heading text-5xl leading-none font-extrabold tracking-tight tabular-nums">{t.n}</div>
            <div className="mt-2 text-sm font-semibold">{t.label}</div>
          </div>
        ))}
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {dashboard.reviewers.length > 0 && (
          <section aria-labelledby="reviewers-heading" className="rounded-[22px] border bg-card">
            <h3 id="reviewers-heading" className="px-5 pt-5 pb-3 font-heading text-lg font-bold">
              Reviewers
            </h3>
            <ul>
              {dashboard.reviewers.map((r) => {
                const left = r.assigned - r.done;
                return (
                  <li key={r.id} className="grid grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1.4fr)_auto] items-center gap-4 border-t px-5 py-3">
                    <PersonAvatar name={r.name} />
                    <span className="truncate text-[0.9375rem] font-semibold">{r.name}</span>
                    <div>
                      <div
                        className="h-2.5 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-label={`${r.name} progress`}
                        aria-valuemin={0}
                        aria-valuemax={r.assigned}
                        aria-valuenow={r.done}
                      >
                        <div className="h-full rounded-full bg-foreground" style={{ width: `${r.assigned ? (r.done / r.assigned) * 100 : 0}%` }} />
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                        {r.done} of {r.assigned}
                      </div>
                    </div>
                    {left <= 0 ? (
                      <Badge variant="ok">Done</Badge>
                    ) : (
                      <Button size="sm" variant="outline" disabled={isPending} onClick={() => nudge(r.id, r.name)}>
                        Nudge
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section aria-labelledby="disagree-heading" className="rounded-[22px] border bg-card px-5 pb-3">
          <h3 id="disagree-heading" className="pt-5 font-heading text-lg font-bold">
            Reviewers disagree
          </h3>
          <p className="mt-1 mb-2 text-sm text-muted-foreground">Worth a second look before decisions.</p>
          {dashboard.applicants.filter((a) => a.disagree).length === 0 ? (
            <p className="border-t py-4 text-sm text-muted-foreground">No big gaps between reviewers so far.</p>
          ) : (
            <ul>
              {dashboard.applicants
                .filter((a) => a.disagree)
                .map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 border-t py-3">
                    <span className="min-w-0 truncate text-[0.9375rem] font-semibold">{a.name}</span>
                    <Badge variant="bad">Scores far apart</Badge>
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-medium">Applicants</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-48"
              placeholder="Search name or email"
              aria-label="Search applicants"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Select value={filter} onValueChange={(v) => v && setFilter(v as DashboardFilter)}>
              <SelectTrigger className="w-44">
                <SelectValue>{(value: string) => FILTERS.find((f) => f.value === value)?.label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">No applicants match.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Applicant</TableHead>
                <TableHead>Reviewers</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Raw</TableHead>
                <TableHead className="text-right">Adjusted</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((a) => (
                <ApplicantRow key={a.id} applicant={a} busy={isPending} onEdit={() => setEditingId(a.id)} onReveal={reveal} />
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium">How each reviewer grades</summary>
        <div className="mt-3 max-w-2xl">
          <ReviewerInsights reviewers={insights} minN={minN} />
        </div>
      </details>

      <ReassignDialog key={editing?.id ?? "none"} applicant={editing} setup={setup} onClose={() => setEditingId(null)} />
    </div>
  );
}

function ApplicantRow({
  applicant: a,
  busy,
  onEdit,
  onReveal,
}: {
  applicant: DashboardApplicant;
  busy: boolean;
  onEdit: () => void;
  onReveal: (id: string, revealed: boolean) => void;
}) {
  const status = a.state.status;
  return (
    <TableRow>
      <TableCell className="font-medium">
        {a.name}
        {a.disagree && (
          <Badge variant="destructive" className="ml-2">
            Reviewers disagree
          </Badge>
        )}
      </TableCell>
      <TableCell>
        {a.reviewers.length === 0 ? (
          <span className="text-muted-foreground">–</span>
        ) : (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {a.reviewers.map((r) => (
              <li key={r.id} className={`inline-flex items-center gap-1 ${r.submitted ? "" : "text-muted-foreground"}`}>
                {r.submitted && <Check className="size-3.5" aria-label="submitted" />}
                {r.name}
              </li>
            ))}
          </ul>
        )}
      </TableCell>
      <TableCell>
        <StatusChip tone={STATUS_TONE[status]} className="h-7 px-2.5 text-[13px]">
          {status === "in-progress" ? `${a.state.submitted} of ${a.state.assigned} done` : STATUS_LABELS[status]}
        </StatusChip>
      </TableCell>
      <TableCell className="text-right tabular-nums">{fmt(a.raw)}</TableCell>
      <TableCell className="text-right tabular-nums">{fmt(a.normalized)}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit}>
            Reviewers
          </Button>
          {status === "revealed" ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onReveal(a.id, false)}>
              Hide again
            </Button>
          ) : status === "not-started" || status === "in-progress" ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onReveal(a.id, true)}>
              Reveal now
            </Button>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

function ReassignDialog({ applicant, setup, onClose }: { applicant: DashboardApplicant | null; setup: Setup; onClose: () => void }) {
  const detail = applicant ? setup.detail[applicant.id] : undefined;
  const [roles, setRoles] = useState<Record<string, Role>>(() =>
    Object.fromEntries(
      setup.pool.map((p) => [p.id, detail?.assigned.includes(p.id) ? "assigned" : detail?.conflicts.includes(p.id) ? "conflict" : "none"]),
    ),
  );
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    if (!applicant) return;
    startTransition(async () => {
      const ids = Object.keys(roles);
      const out = await setApplicantReviewersAction({
        applicantId: applicant.id,
        assigned: ids.filter((id) => roles[id] === "assigned"),
        conflicts: ids.filter((id) => roles[id] === "conflict"),
      });
      if (out.error) {
        toast.error(out.error);
        return;
      }
      toast.success("Reviewers updated.");
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open={!!applicant} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reviewers for {applicant?.name}</DialogTitle>
          <DialogDescription>
            Mark a conflict if a reviewer knows this applicant. A reviewer who already submitted can&apos;t be unassigned.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {setup.pool.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3">
              <span className="text-sm">{p.name}</span>
              <Select value={roles[p.id] ?? "none"} onValueChange={(v) => v && setRoles((prev) => ({ ...prev, [p.id]: v as Role }))}>
                <SelectTrigger className="w-52">
                  <SelectValue>{(value: Role) => ROLE_LABELS[value]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={isPending}>
            Save reviewers
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
