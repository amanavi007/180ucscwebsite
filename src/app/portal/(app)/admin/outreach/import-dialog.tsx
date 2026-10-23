"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { commitImportAction, previewImportAction, type ImportPreview } from "@/actions/outreach";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildResearchPrompt } from "@/lib/outreach/research-prompt";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const PROMPT_STORAGE_KEY = "outreach-research-prompt";

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
  const [niche, setNiche] = useState("");
  const [needs, setNeeds] = useState("");
  const [exclude, setExclude] = useState("");
  const [checking, setChecking] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewRequest = useRef(0);

  // The prompt boxes remember what was typed, so closing the dialog or reloading never loses them. Browser storage can be
  // blocked, so every read and write is guarded and the dialog works without it.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PROMPT_STORAGE_KEY) ?? "{}") as Record<string, string>;
      /* eslint-disable react-hooks/set-state-in-effect -- one-time restore from browser storage on mount */
      if (saved.niche) setNiche(saved.niche);
      if (saved.needs) setNeeds(saved.needs);
      if (saved.exclude) setExclude(saved.exclude);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      // No saved prompt: start empty.
    }
  }, []);

  useEffect(
    () => () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    },
    [],
  );

  function remember(next: { niche: string; needs: string; exclude: string }) {
    try {
      localStorage.setItem(PROMPT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Not saved; nothing else depends on it.
    }
  }

  async function onCopyPrompt() {
    try {
      await navigator.clipboard.writeText(buildResearchPrompt({ niche, needs, exclude }));
      toast.success("Prompt copied. Paste it into Claude Research.");
    } catch {
      toast.error("Couldn't copy. Allow clipboard access and try again.");
    }
  }

  function reset(next: boolean) {
    if (!next) {
      if (previewTimer.current) clearTimeout(previewTimer.current);
      previewRequest.current++;
      setCsv("");
      setPreview(null);
      setChecking(false);
    }
    onOpenChange(next);
  }

  /** Checks the CSV a moment after it stops changing, so there is no separate Preview step to remember. */
  function schedulePreview(text: string) {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    const request = ++previewRequest.current;
    setPreview(null);
    if (text.trim() === "") {
      setChecking(false);
      return;
    }
    setChecking(true);
    previewTimer.current = setTimeout(async () => {
      const result = await previewImportAction(text);
      if (request !== previewRequest.current) return; // the text changed while this was running
      setChecking(false);
      if (result.error) toast.error(result.error);
      else setPreview(result);
    }, 500);
  }

  function onCsvChange(text: string) {
    setCsv(text);
    schedulePreview(text);
  }

  async function onFile(file: File | undefined) {
    if (file) onCsvChange(await file.text());
  }

  const readyToImport = !checking && !!preview && (preview.willImport ?? 0) > 0;
  const importHint = checking
    ? "Checking the file..."
    : csv.trim() === ""
      ? "Paste or choose a CSV to import."
      : !preview
        ? "The file couldn't be checked. Edit it and try again."
        : (preview.willImport ?? 0) === 0
          ? "Nothing in this file can be imported. See why above."
          : null;

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
            Get a research prompt below, run it in Claude Research, then upload the CSV it gives you. Past clients, duplicates and anyone who opted out are skipped.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <section aria-labelledby="research-prompt-heading" className="space-y-3 rounded-[18px] border p-4">
            <h3 id="research-prompt-heading" className="text-base">
              1. Get the research prompt
            </h3>
            <div className="space-y-1.5">
              <Label htmlFor="research-niche">Who to look for</Label>
              <Input
                id="research-niche"
                value={niche}
                onChange={(e) => {
                  setNiche(e.target.value);
                  remember({ niche: e.target.value, needs, exclude });
                }}
                placeholder="Seed to Series A med-tech startups in the Bay Area, 5 to 50 employees"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="research-needs">What they might need</Label>
              <Input id="research-needs" value={needs} onChange={(e) => {
                  setNeeds(e.target.value);
                  remember({ niche, needs: e.target.value, exclude });
                }} placeholder="A go-to-market plan, market research or pricing" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="research-exclude">Companies to skip (optional)</Label>
              <Input id="research-exclude" value={exclude} onChange={(e) => {
                  setExclude(e.target.value);
                  remember({ niche, needs, exclude: e.target.value });
                }} placeholder="Past clients, separated by commas" />
            </div>
            <Button variant="outline" onClick={() => void onCopyPrompt()}>
              Copy prompt
            </Button>
          </section>

          <h3 className="text-base">2. Upload what it found</h3>
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
              onChange={(e) => onCsvChange(e.target.value)}
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
        <DialogFooter className="items-center sm:justify-between">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {importHint}
          </p>
          <Button onClick={onImport} disabled={isPending || !readyToImport}>
            {preview?.willImport ? `Import ${preview.willImport} prospect${preview.willImport === 1 ? "" : "s"}` : "Import prospects"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
