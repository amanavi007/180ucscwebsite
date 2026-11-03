"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addCompanyListAction, type CompanyListResult } from "@/actions/outreach";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseCompanyList } from "@/lib/outreach/discovery/list";
import { buildCompanyListPrompt } from "@/lib/outreach/research-prompt";

const STORAGE_KEY = "outreach-company-list-prompt";

const OUTCOME_WORDS: Record<string, string> = {
  ready: "ready to add",
  no_email: "no published email",
  duplicate: "already known",
  unreachable: "couldn't reach",
  no_facts: "nothing to say",
  error: "errors",
};

/** Paste a list of companies (names and websites). Each company's own site is read for its email and facts; nothing is sent. */
export function CompanyListDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [niche, setNiche] = useState("");
  const [region, setRegion] = useState("");
  const [needs, setNeeds] = useState("");
  const [exclude, setExclude] = useState("");
  const [text, setText] = useState("");
  const [result, setResult] = useState<CompanyListResult | null>(null);
  const [isPending, startTransition] = useTransition();

  // The prompt boxes remember what was typed. Browser storage can be blocked, so every access is guarded.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, string>;
      /* eslint-disable react-hooks/set-state-in-effect -- one-time restore from browser storage on mount */
      if (saved.niche) setNiche(saved.niche);
      if (saved.region) setRegion(saved.region);
      if (saved.needs) setNeeds(saved.needs);
      if (saved.exclude) setExclude(saved.exclude);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      // Nothing saved: start empty.
    }
  }, []);

  function remember(next: Record<string, string>) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable: the dialog still works.
    }
  }

  const parsed = useMemo(() => (text.trim() === "" ? null : parseCompanyList(text)), [text]);

  async function onCopyPrompt() {
    try {
      await navigator.clipboard.writeText(buildCompanyListPrompt({ niche, region, needs, exclude }));
      toast.success("Prompt copied. Paste it into Claude Research.");
    } catch {
      toast.error("Couldn't copy. Allow clipboard access and try again.");
    }
  }

  function onAdd() {
    startTransition(async () => {
      const res = await addCompanyListAction(text);
      if (res.error) return void toast.error(res.error);
      setResult(res);
      toast.success(`${res.staged ?? 0} ready to add.`);
      router.refresh();
    });
  }

  function close(next: boolean) {
    if (!next) {
      setText("");
      setResult(null);
    }
    onOpenChange(next);
  }

  const found = parsed?.leads.length ?? 0;
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Add companies</DialogTitle>
          <DialogDescription>
            Paste a list of companies and their websites. Each company&apos;s own site is read for the email it publishes and what it says about itself. Nothing is emailed, and anyone already known is skipped.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2 md:gap-6">
          <section aria-labelledby="list-prompt-heading" className="min-w-0 space-y-3 rounded-[18px] border p-4">
            <h3 id="list-prompt-heading" className="text-base">
              1. Get a list from Claude Research
            </h3>
            <p className="text-sm text-muted-foreground">It is only asked for names and websites. It is told never to write an email, because those come from each company&apos;s own site.</p>
            <div className="space-y-1.5">
              <Label htmlFor="list-niche">Who to look for</Label>
              <Input id="list-niche" value={niche} placeholder="Med-tech and health startups, 10 to 100 people" onChange={(e) => { setNiche(e.target.value); remember({ niche: e.target.value, region, needs, exclude }); }} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="list-region">Where</Label>
              <Input id="list-region" value={region} placeholder="Santa Cruz and the Monterey Bay area" onChange={(e) => { setRegion(e.target.value); remember({ niche, region: e.target.value, needs, exclude }); }} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="list-needs">What they might need</Label>
              <Input id="list-needs" value={needs} placeholder="Go-to-market plan, market research, pricing" onChange={(e) => { setNeeds(e.target.value); remember({ niche, region, needs: e.target.value, exclude }); }} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="list-exclude">Companies to skip (optional)</Label>
              <Input id="list-exclude" value={exclude} placeholder="Past clients, separated by commas" onChange={(e) => { setExclude(e.target.value); remember({ niche, region, needs, exclude: e.target.value }); }} />
            </div>
            <Button variant="outline" onClick={() => void onCopyPrompt()}>
              Copy prompt
            </Button>
          </section>

          <section aria-labelledby="list-paste-heading" className="min-w-0 space-y-3">
            <h3 id="list-paste-heading" className="text-base">
              2. Paste what it found
            </h3>
            <div className="space-y-1.5">
              <Label htmlFor="list-text">The list</Label>
              <Textarea
                id="list-text"
                rows={6}
                className="max-h-48 min-w-0"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setResult(null);
                }}
                placeholder={"Company,Website,What they do,Niche,Source URLs\nAcme Health,https://acmehealth.com,Remote monitoring for rural clinics,med-tech,https://...\n\nOr one per line: Acme Health, acmehealth.com"}
              />
            </div>
            {parsed && (
              <div className="min-w-0 space-y-2 rounded-[18px] border p-3.5" aria-live="polite">
                <p className="font-semibold">
                  {found} compan{found === 1 ? "y" : "ies"} found · {parsed.errors.length} with problems
                </p>
                {parsed.errors.length > 0 && (
                  <ul className="max-h-24 space-y-1 overflow-y-auto text-sm break-words text-muted-foreground">
                    {parsed.errors.map((e, i) => (
                      <li key={i}>{e.line > 0 ? `Line ${e.line}: ` : ""}{e.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {result && (
              <div className="min-w-0 space-y-1 rounded-[18px] bg-accent p-3.5 text-sm" aria-live="polite">
                <p className="font-semibold">
                  {result.staged} ready to add
                  {(result.skippedKnown ?? 0) > 0 && ` · ${result.skippedKnown} already known`}
                </p>
                <p className="break-words text-muted-foreground">
                  {Object.entries(result.byOutcome ?? {})
                    .filter(([outcome]) => outcome !== "ready")
                    .map(([outcome, n]) => `${n} ${OUTCOME_WORDS[outcome] ?? outcome}`)
                    .join(" · ") || "Every company had a published email."}
                </p>
                {(result.notReached ?? 0) > 0 && (
                  <p className="font-semibold">Time ran out before {result.notReached} could be read. Paste the same list again to carry on; the ones already done are skipped.</p>
                )}
              </div>
            )}
          </section>
        </div>
        <DialogFooter className="items-center sm:justify-between">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {found === 0 ? "Paste a list to read each company's website." : "Reading the websites takes a few seconds each."}
          </p>
          <Button onClick={onAdd} disabled={isPending || found === 0}>
            {isPending ? "Reading websites..." : `Read ${found || ""} website${found === 1 ? "" : "s"}`.replace("Read  ", "Read ")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
