"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateApplicantAction, voidPointsAction } from "@/actions/recruit";
import type { ApplicantRow } from "@/lib/data/recruit";
import { formatPoints } from "@/lib/recruit";
import type { StageSummary } from "@/lib/recruit-scoring";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function ApplicantPanel({
  applicant,
  onClose,
  onGivePoints,
  summaries,
  disagreementThreshold,
}: {
  applicant: ApplicantRow | null;
  onClose: () => void;
  onGivePoints: () => void;
  summaries: { resume?: StageSummary; interview?: StageSummary };
  disagreementThreshold: number;
}) {
  return (
    <Sheet open={!!applicant} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {/* Keyed by applicant so switching people resets the edit drafts without effects. */}
        {applicant && (
          <PanelBody
            key={applicant.id}
            applicant={applicant}
            onGivePoints={onGivePoints}
            summaries={summaries}
            disagreementThreshold={disagreementThreshold}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function PanelBody({
  applicant,
  onGivePoints,
  summaries,
  disagreementThreshold,
}: {
  applicant: ApplicantRow;
  onGivePoints: () => void;
  summaries: { resume?: StageSummary; interview?: StageSummary };
  disagreementThreshold: number;
}) {
  const [name, setName] = useState(applicant.name);
  const [email, setEmail] = useState(applicant.email ?? "");
  const [major, setMajor] = useState(applicant.major ?? "");
  const [year, setYear] = useState(applicant.year ?? "");
  const [notes, setNotes] = useState(applicant.notes);
  const [applicationLink, setApplicationLink] = useState(applicant.applicationLink ?? "");
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const dirty =
    name !== applicant.name ||
    email !== (applicant.email ?? "") ||
    major !== (applicant.major ?? "") ||
    year !== (applicant.year ?? "") ||
    notes !== applicant.notes ||
    applicationLink !== (applicant.applicationLink ?? "");

  function save() {
    startTransition(async () => {
      const result = await updateApplicantAction(applicant.id, { name, email, major, year, notes, applicationLink });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Saved.");
      router.refresh();
    });
  }

  function confirmVoid(entryId: string) {
    startTransition(async () => {
      const result = await voidPointsAction(entryId, voidReason);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Entry voided.");
      setVoidingId(null);
      setVoidReason("");
      router.refresh();
    });
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{applicant.name}</SheetTitle>
        <SheetDescription>
          {applicant.total} point{applicant.total === 1 ? "" : "s"}
          {applicant.hasPrevious &&
            ` · Previously applied${applicant.previousQuarterName ? ` (${applicant.previousQuarterName})` : ""}`}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-5 px-4 pb-6">
        <Button onClick={onGivePoints}>Give points</Button>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Details</h3>
          <Input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input aria-label="Email" placeholder="UCSC email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input aria-label="Major" placeholder="Major" value={major} onChange={(e) => setMajor(e.target.value)} />
            <Input aria-label="Year" placeholder="Year" value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
          <Textarea
            aria-label="Notes"
            placeholder="Notes for the group"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <Input
            aria-label="Application link"
            placeholder="Link to their application (Google Doc, Drive, etc.)"
            value={applicationLink}
            onChange={(e) => setApplicationLink(e.target.value)}
          />
          <Button variant="outline" size="sm" disabled={!dirty || isPending} onClick={save}>
            Save changes
          </Button>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Scores</h3>
          {(["resume", "interview"] as const).map((s) => {
            const summary = summaries[s];
            return (
              <div key={s} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                <span className="capitalize">{s}</span>
                {summary ? (
                  <span className="flex items-center gap-2 tabular-nums">
                    raw {summary.raw.toFixed(2)} · adjusted {summary.normalized.toFixed(2)} · {summary.count} review
                    {summary.count === 1 ? "" : "s"}
                    {summary.count >= 2 && summary.spread >= disagreementThreshold && <Badge variant="destructive">disagree</Badge>}
                  </span>
                ) : (
                  <span className="text-muted-foreground">not scored yet</span>
                )}
              </div>
            );
          })}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Points history</h3>
          {applicant.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet. Use &ldquo;Give points&rdquo; to add the first entry.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {applicant.entries.map((e) => (
                <li key={e.id} className="space-y-1 p-2.5 text-sm">
                  <div className={`flex items-start justify-between gap-2 ${e.voidedAt ? "text-muted-foreground line-through" : ""}`}>
                    <span>
                      {e.categoryName}
                      {e.eventName ? ` · ${e.eventName}` : ""}
                    </span>
                    <Badge variant={e.points < 0 ? "destructive" : "secondary"}>{formatPoints(e.points)}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(e.createdAt).toLocaleDateString()}
                    {e.awardedByName ? ` · ${e.awardedByName}` : ""}
                    {e.source !== "manual" ? ` · ${e.source}` : ""}
                  </p>
                  {e.reason && <p className="text-xs">&ldquo;{e.reason}&rdquo;</p>}
                  {e.voidedAt && <p className="text-xs">Voided: {e.voidReason}</p>}
                  {!e.voidedAt &&
                    (voidingId === e.id ? (
                      <div className="space-y-1.5 pt-1">
                        <Input
                          aria-label="Reason for voiding"
                          placeholder="Why are you voiding this?"
                          value={voidReason}
                          onChange={(ev) => setVoidReason(ev.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          The entry stays in the history, crossed out, and stops counting toward the total.
                        </p>
                        <div className="flex gap-2">
                          <Button size="sm" variant="destructive" disabled={isPending || !voidReason.trim()} onClick={() => confirmVoid(e.id)}>
                            Void entry
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setVoidingId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button size="xs" variant="ghost" onClick={() => setVoidingId(e.id)}>
                        Void
                      </Button>
                    ))}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
