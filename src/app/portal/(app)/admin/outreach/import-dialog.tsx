"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { commitImportAction, previewImportAction, type ImportPreview } from "@/actions/outreach";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SKIP_REASONS: Record<string, string> = {
  duplicate_email: "Already in the pipeline",
  duplicate_company: "Company already in the pipeline",
  past_client: "Past client",
  suppressed: "On the do-not-contact list",
  invalid_email: "Not a valid email",
};

/** Upload the research CSV, see what will and will not be imported, then confirm. */
export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset(next: boolean) {
    if (!next) {
      setCsv("");
      setPreview(null);
    }
    onOpenChange(next);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setCsv(await file.text());
    setPreview(null);
  }

  function onPreview() {
    startTransition(async () => {
      const result = await previewImportAction(csv);
      if (result.error) toast.error(result.error);
      else setPreview(result);
    });
  }

  function onImport() {
    startTransition(async () => {
      const result = await commitImportAction(csv);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.imported} prospect${result.imported === 1 ? "" : "s"} imported. Drafts are written at 7am, or press Generate drafts.`);
      reset(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import prospects</DialogTitle>
          <DialogDescription>
            Upload the CSV from the research prompt (see docs/outreach-research-prompt.md). Past clients, duplicates and anyone who opted out are skipped.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="outreach-csv-file">CSV file</Label>
            <input
              id="outreach-csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => void onFile(e.target.files?.[0])}
              className="block w-full text-sm file:mr-3 file:rounded-[10px] file:border file:border-input file:bg-card file:px-3 file:py-1.5 file:text-sm file:font-semibold"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="outreach-csv-text">Or paste it here</Label>
            <Textarea
              id="outreach-csv-text"
              rows={5}
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setPreview(null);
              }}
              placeholder="Company,Website,What they do,Size,Stage,Niche,Contact name,Contact role,Contact email,..."
            />
          </div>

          {preview && (
            <div className="space-y-3 rounded-[18px] border p-4" aria-live="polite">
              <p className="font-semibold">
                {preview.willImport} will be imported · {preview.skipped?.length ?? 0} skipped · {preview.errors?.length ?? 0} rows with problems
              </p>
              {(preview.skipped?.length ?? 0) > 0 && (
                <ul className="max-h-40 space-y-1 overflow-auto text-sm text-muted-foreground">
                  {preview.skipped!.map((s, i) => (
                    <li key={`${s.email}-${i}`}>
                      {s.company} ({s.email}): {SKIP_REASONS[s.reason] ?? s.reason}
                    </li>
                  ))}
                </ul>
              )}
              {(preview.errors?.length ?? 0) > 0 && (
                <ul className="max-h-32 space-y-1 overflow-auto text-sm text-muted-foreground">
                  {preview.errors!.map((e, i) => (
                    <li key={i}>
                      Line {e.line}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onPreview} disabled={isPending || csv.trim() === ""}>
            Preview import
          </Button>
          <Button onClick={onImport} disabled={isPending || !preview || (preview.willImport ?? 0) === 0}>
            {preview?.willImport ? `Import ${preview.willImport} prospect${preview.willImport === 1 ? "" : "s"}` : "Import prospects"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
