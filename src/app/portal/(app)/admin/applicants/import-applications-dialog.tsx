"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSpreadsheet, Undo2 } from "lucide-react";
import {
  assignReviewersAction,
  commitApplicationImportAction,
  previewApplicationImportAction,
  undoApplicationImportAction,
} from "@/actions/recruit-review";
import { readSpreadsheet } from "@/lib/read-spreadsheet";
import {
  buildApplicationCommitRows,
  defaultChoices,
  parseApplicationSheet,
  type ApplicationChoice,
  type ParseResult,
  type PreviewRow,
} from "@/lib/recruit-applications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DuplicateSubmissions } from "./duplicate-submissions";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type Step = "upload" | "review" | "done";

export function ImportApplicationsDialog({
  quarterId,
  open: controlledOpen,
  onOpenChange,
}: {
  quarterId: string;
  /** Pass `open` to control the dialog from outside (for example from a menu); it then renders no trigger of its own. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : innerOpen;
  const setOpen = (next: boolean) => {
    if (!controlled) setInnerOpen(next);
    onOpenChange?.(next);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!controlled && (
        <DialogTrigger
          render={
            <Button size="sm">
              <FileSpreadsheet />
              Import applications
            </Button>
          }
        />
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        {/* Remounted on every open so each import starts from a clean state. */}
        {open && <Flow quarterId={quarterId} onClose={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function choiceMatches(a: ApplicationChoice | undefined, b: ApplicationChoice): boolean {
  if (!a || a.kind !== b.kind) return false;
  return a.kind === "update" && b.kind === "update" ? a.applicantId === b.applicantId : true;
}

function Flow({ quarterId, onClose }: { quarterId: string; onClose: () => void }) {
  const [step, setStep] = useState<Step>("upload");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [baseRows, setRows] = useState<PreviewRow[]>([]);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [choices, setChoices] = useState<Record<number, ApplicationChoice>>({});
  const [result, setResult] = useState<{ batchId: string; created: number; updated: number; skipped: number } | null>(null);
  const [assigned, setAssigned] = useState<number | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // A picked submission replaces the default one under the same row key, so choices made on that row still apply.
  const rows = baseRows.map((r) => {
    const picked = picks[r.application.email];
    if (picked === undefined || picked === r.application.rowNumber) return r;
    const chosen = parsed?.duplicateGroups.find((g) => g.email === r.application.email)?.submissions.find((s) => s.rowNumber === picked);
    return chosen ? { ...r, application: { ...chosen, rowNumber: r.application.rowNumber } } : r;
  });
  const needsLook = rows.filter((r) => r.group === "needs-look");
  const undecided = needsLook.filter((r) => !choices[r.application.rowNumber]);
  const importing = buildApplicationCommitRows(rows, choices);
  const counts = {
    new: rows.filter((r) => r.group === "new").length,
    update: rows.filter((r) => r.group === "update").length,
  };

  function onFile(file: File | undefined) {
    if (!file) return;
    startTransition(async () => {
      try {
        const sheet = parseApplicationSheet(await readSpreadsheet(file));
        if (sheet.missingRequired.length > 0) {
          toast.error(`Couldn't find the ${sheet.missingRequired.join(" and ")} column. Is this the application export?`);
          return;
        }
        const preview = await previewApplicationImportAction({ quarterId, applications: sheet.applications });
        if (preview.error || !preview.rows) {
          toast.error(preview.error ?? "Couldn't read that file.");
          return;
        }
        setParsed(sheet);
        setRows(preview.rows);
        setChoices(defaultChoices(preview.rows));
        setStep("review");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't read that file.");
      }
    });
  }

  function commit() {
    startTransition(async () => {
      const out = await commitApplicationImportAction({ quarterId, rows: importing });
      if (out.error || !out.batchId) {
        toast.error(out.error ?? "Import failed.");
        return;
      }
      setResult({ batchId: out.batchId, created: out.created ?? 0, updated: out.updated ?? 0, skipped: out.skipped ?? 0 });
      setAssigned(out.assignError ? null : (out.assigned ?? 0));
      setAssignError(out.assignError ?? null);
      setStep("done");
      router.refresh();
    });
  }

  function assign() {
    startTransition(async () => {
      const out = await assignReviewersAction({ quarterId });
      if (out.error) {
        toast.error(out.error);
        return;
      }
      setAssigned(out.added ?? 0);
      router.refresh();
    });
  }

  function undo() {
    if (!result) return;
    startTransition(async () => {
      const out = await undoApplicationImportAction(result.batchId);
      if (out.error) {
        toast.error(out.error);
        return;
      }
      toast.success(`Removed ${out.archived} applicants this import created.`);
      router.refresh();
      onClose();
    });
  }

  if (step === "upload") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Import applications</DialogTitle>
          <DialogDescription>
            Upload the Google Form export (.xlsx or .csv). Interview availability columns are ignored.
          </DialogDescription>
        </DialogHeader>
        <Input
          type="file"
          accept=".xlsx,.csv"
          aria-label="Application spreadsheet"
          disabled={isPending}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        {isPending && <p className="text-sm text-muted-foreground">Reading the file…</p>}
      </>
    );
  }

  if (step === "review" && parsed) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{rows.length} applications</DialogTitle>
          <DialogDescription>Check this over, then import. Nothing is saved until you do.</DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-3 gap-4 border-y py-4 text-sm">
          <div>
            <dt className="text-muted-foreground">New people</dt>
            <dd className="text-2xl font-semibold tabular-nums">{counts.new}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Already here, will be updated</dt>
            <dd className="text-2xl font-semibold tabular-nums">{counts.update}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Need your decision</dt>
            <dd className="text-2xl font-semibold tabular-nums">{needsLook.length}</dd>
          </div>
        </dl>

        <div className="space-y-1 text-sm text-muted-foreground">
          {parsed.unmapped.length > 0 && <p>Ignored columns: {parsed.unmapped.join(", ")}.</p>}
          {parsed.skipped.length > 0 && (
            <details>
              <summary className="cursor-pointer">{parsed.skipped.length} rows skipped</summary>
              <ul className="mt-1 list-disc pl-5">
                {parsed.skipped.map((s) => (
                  <li key={s.rowNumber}>
                    Row {s.rowNumber}: {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        {parsed.duplicateGroups.length > 0 && (
          <DuplicateSubmissions
            groups={parsed.duplicateGroups}
            picks={picks}
            onPick={(email, rowNumber) => setPicks((prev) => ({ ...prev, [email]: rowNumber }))}
          />
        )}

        {needsLook.length > 0 && (
          <section className="space-y-3">
            <h3 className="font-medium">Are these the same person?</h3>
            <ul className="divide-y rounded-lg border">
              {needsLook.map((r) => {
                const key = r.application.rowNumber;
                const options: { label: string; choice: ApplicationChoice }[] = [
                  ...r.candidates.map((c) => ({
                    label: `Same as ${c.name}`,
                    choice: { kind: "update", applicantId: c.id } as ApplicationChoice,
                  })),
                  { label: "New person", choice: { kind: "new" } },
                  { label: "Skip", choice: { kind: "skip" } },
                ];
                return (
                  <li key={key} className="space-y-2 p-3">
                    <div className="text-sm">
                      <span className="font-medium">{r.application.name}</span>{" "}
                      <span className="text-muted-foreground">{r.application.email}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {options.map((o) => {
                        const selected = choiceMatches(choices[key], o.choice);
                        return (
                          <Button
                            key={o.label}
                            type="button"
                            size="sm"
                            variant={selected ? "default" : "outline"}
                            aria-pressed={selected}
                            onClick={() => setChoices((prev) => ({ ...prev, [key]: o.choice }))}
                          >
                            {o.label}
                          </Button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <DialogFooter className="items-center">
          {undecided.length > 0 && (
            <span className="mr-auto text-sm text-muted-foreground">{undecided.length} still need a decision</span>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={isPending || undecided.length > 0 || importing.length === 0} onClick={commit}>
            Import {importing.length} applicants
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Import finished</DialogTitle>
        <DialogDescription>
          {result?.created} added, {result?.updated} updated{result?.skipped ? `, ${result.skipped} skipped` : ""}.
        </DialogDescription>
      </DialogHeader>
      {assigned === null ? (
        <p className="text-sm text-muted-foreground">
          {assignError ? `Reviewers couldn't be assigned automatically: ${assignError}` : "Give every applicant their reviewers."}{" "}
          Each reviewer will only see the applicants assigned to them.
        </p>
      ) : (
        <p className="text-sm">
          {assigned === 0 ? "Everyone already had their reviewers." : `${assigned} reviewer assignments made automatically.`} Reviewers can start scoring.
        </p>
      )}
      <DialogFooter className="items-center">
        <Button variant="ghost" onClick={undo} disabled={isPending}>
          <Undo2 />
          Undo this import
        </Button>
        {assigned === null ? (
          <Button onClick={assign} disabled={isPending}>
            {assignError ? "Try again" : "Assign reviewers"}
          </Button>
        ) : (
          <Button onClick={onClose}>Close</Button>
        )}
      </DialogFooter>
      <p className="text-xs text-muted-foreground">Undo removes applicants this import created. Updates to existing applicants are kept.</p>
    </>
  );
}
