"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PrelimReviewRow } from "@/lib/data/prelim-review";
import { RUN_CHIP, VERDICT_CHIP } from "@/lib/prelim-review/labels";
import { KIND_LABELS, type ReviewKind, type Rubric } from "@/lib/prelim-review/rubric";
import { pickDriveFile, pickerConfigured } from "./google-picker";
import { ReviewPanel } from "./review-panel";
import { ReviewingCard } from "./reviewing-card";

export function ReviewTab({
  projects,
  reviews,
  rubrics,
}: {
  projects: { id: string; name: string }[];
  reviews: PrelimReviewRow[];
  rubrics: Record<ReviewKind, Rubric>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Only true once a file is chosen, so the scan card does not show behind the Google Picker.
  const [reviewing, setReviewing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const configured = pickerConfigured();
  const selected = reviews.find((r) => r.id === selectedId) ?? null;

  async function onReview() {
    setBusy(true);
    try {
      const picked = await pickDriveFile();
      if (!picked) return;
      setReviewing(true);
      const res = await fetch("/api/prelim-review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, fileId: picked.id, accessToken: picked.accessToken }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        toast.error(data.error ?? "The review could not be completed. Please try again.");
        return;
      }
      setSelectedId(data.id);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
      setReviewing(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap items-end gap-3">
        <Field className="w-56">
          <FieldLabel>Project</FieldLabel>
          <Select value={projectId} onValueChange={(v) => v && setProjectId(v)}>
            <SelectTrigger className="w-full">
              <SelectValue>{projects.find((p) => p.id === projectId)?.name ?? "Choose a project"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="flex flex-col items-end gap-1">
          <Button size="lg" onClick={onReview} disabled={busy || !configured || !projectId}>
            Review a file
          </Button>
          {!projectId && <span className="text-sm text-muted-foreground">You&apos;re not on a project yet, so there&apos;s nothing to attach a review to.</span>}
          {!configured && <span className="text-sm text-muted-foreground">Google Drive isn&apos;t set up yet. Ask an exec.</span>}
        </div>
        </div>
      </div>

      {reviewing && <ReviewingCard />}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {reviews.length === 0 ? (
            <div className="rounded-[22px] border bg-card p-6">
              <p className="font-medium">No reviews yet</p>
              <p className="text-sm text-muted-foreground">Pick a file to get one.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[22px] border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Passing</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviews.map((r) => {
                    const chip = r.status === "done" && r.verdict ? VERDICT_CHIP[r.verdict] : RUN_CHIP[r.status === "running" ? "running" : "error"];
                    const passing = r.results.filter((x) => x.status === "pass").length;
                    const isSelected = r.id === selectedId;
                    return (
                      <TableRow
                        key={r.id}
                        data-state={isSelected ? "selected" : undefined}
                        aria-selected={isSelected}
                        tabIndex={0}
                        onClick={() => setSelectedId(r.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedId(r.id);
                          }
                        }}
                        className="cursor-pointer outline-none focus-visible:bg-muted/60"
                      >
                        <TableCell>
                          <span className="block font-semibold">{r.fileName}</span>
                          <span className="block text-sm text-muted-foreground">
                            {r.projectName} · {KIND_LABELS[r.kind]} · {r.authorName} · {format(new Date(r.createdAt), "MMM d, h:mm a")}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={chip.variant}>{chip.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.status === "done" ? `${passing} of ${r.results.length}` : "–"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {selected && (
          <ReviewPanel
            review={selected}
            rubric={rubrics[selected.kind]}
            busy={busy}
            onReviewAgain={onReview}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}
