"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { addOnboardingJcs, importJcsFromApplicants } from "@/actions/jc-onboarding";
import type { OnboardingData } from "@/lib/data/onboarding";
import type { OnboardingThresholds } from "@/lib/onboarding-attendance";
import { PageHeader } from "@/components/page-header";
import { UrlTabs } from "@/components/url-tabs";
import { Button } from "@/components/ui/button";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RosterTab } from "./roster-tab";
import { SessionsTab } from "./sessions-tab";

function ImportFromApplicants({
  quarterId,
  quarters,
  defaultCutoff,
  onDone,
}: {
  quarterId: string;
  quarters: { id: string; name: string }[];
  defaultCutoff: number | null;
  onDone: () => void;
}) {
  const [sourceId, setSourceId] = useState(quarterId);
  const [cutoff, setCutoff] = useState(defaultCutoff === null ? "" : String(defaultCutoff));
  const [preview, setPreview] = useState<{ total: number; fresh: number; alreadyOnRoster: number; noEmail: number } | null>(null);
  const [pending, startTransition] = useTransition();
  const n = Number(cutoff);
  const valid = cutoff.trim() !== "" && Number.isFinite(n);

  function run(dryRun: boolean) {
    startTransition(async () => {
      const result = await importJcsFromApplicants({ quarterId, sourceQuarterId: sourceId, cutoff: n, dryRun });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (dryRun) {
        setPreview({
          total: result.total ?? 0,
          fresh: result.fresh ?? 0,
          alreadyOnRoster: result.alreadyOnRoster ?? 0,
          noEmail: result.noEmail ?? 0,
        });
        return;
      }
      toast.success(`Added ${result.added ?? 0} JC${result.added === 1 ? "" : "s"} from applicants.`);
      onDone();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <p className="text-sm font-semibold">Import from applicants</p>
      <p className="text-[13px] text-muted-foreground">
        Adds everyone at or above a score, with the name and email already on file.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-40">
          <label htmlFor="jc-import-quarter" className="text-[13px] font-medium">Applicants from</label>
          <Select value={sourceId} onValueChange={(v) => { if (v) { setSourceId(v); setPreview(null); } }}>
            <SelectTrigger id="jc-import-quarter" size="sm" className="w-full">
              <SelectValue>{(value: string) => quarters.find((q) => q.id === value)?.name ?? "Quarter"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {quarters.map((q) => (
                <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-28">
          <label htmlFor="jc-import-cutoff" className="text-[13px] font-medium">Score cutoff</label>
          <Input
            id="jc-import-cutoff"
            type="number"
            step="0.5"
            inputMode="decimal"
            className="h-8"
            value={cutoff}
            onChange={(e) => { setCutoff(e.target.value); setPreview(null); }}
          />
        </div>
        <Button variant="outline" size="sm" disabled={pending || !valid} onClick={() => run(true)}>
          Preview
        </Button>
      </div>
      {preview && (
        <div className="space-y-2">
          <p className="text-sm">
            {preview.fresh} to add
            {preview.alreadyOnRoster > 0 ? `, ${preview.alreadyOnRoster} already on the roster` : ""}
            {preview.noEmail > 0 ? `, ${preview.noEmail} with no email on file` : ""}.
          </p>
          <Button size="sm" variant="outline" disabled={pending || preview.fresh === 0} onClick={() => run(false)}>
            Add {preview.fresh} from applicants
          </Button>
        </div>
      )}
    </div>
  );
}

function AddJcsDialog({
  quarterId,
  quarters,
  defaultCutoff,
}: {
  quarterId: string;
  quarters: { id: string; name: string }[];
  defaultCutoff: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await addOnboardingJcs(quarterId, text);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const parts = [`Added ${result.added} JC${result.added === 1 ? "" : "s"}`];
      if (result.skipped) parts.push(`${result.skipped} already on the roster`);
      toast.success(`${parts.join(", ")}.`);
      if (result.problems?.length) toast.error(result.problems.slice(0, 3).join(" "));
      setText("");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <UserPlus />
            Add JCs
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add JCs</DialogTitle>
          <DialogDescription>
            One per line: a name, or a name and email. Any email works, since JCs don&apos;t have a chapter address.
          </DialogDescription>
        </DialogHeader>
        <ImportFromApplicants
          quarterId={quarterId}
          quarters={quarters}
          defaultCutoff={defaultCutoff}
          onDone={() => setOpen(false)}
        />
        <Textarea
          aria-label="JCs, one per line"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Maya Chen, maya@gmail.com\nSam Lee"}
          disabled={pending}
        />
        <DialogFooter>
          <Button onClick={submit} disabled={pending || !text.trim()}>
            Add to roster
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OnboardingView({
  quarterId,
  quarterName,
  quarterStart,
  quarterEnd,
  today,
  data,
  thresholds,
  quarters,
  defaultCutoff,
}: {
  quarterId: string;
  quarterName: string;
  quarterStart: string;
  quarterEnd: string;
  today: string;
  data: OnboardingData;
  thresholds: OnboardingThresholds;
  quarters: { id: string; name: string }[];
  defaultCutoff: number | null;
}) {
  const activeCount = useMemo(() => data.jcs.filter((j) => !j.removedAt).length, [data.jcs]);
  const takenCount = data.meetings.filter((m) => m.taken).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Onboarding"
        description={`${quarterName} · attendance for Junior Consultant onboarding meetings. Any exec can take it.`}
        actions={<AddJcsDialog quarterId={quarterId} quarters={quarters} defaultCutoff={defaultCutoff} />}
      />
      <UrlTabs values={["sessions", "roster"]} fallback="sessions">
        <TabsList>
          <TabsTrigger value="sessions">Meetings {data.meetings.length}</TabsTrigger>
          <TabsTrigger value="roster">Roster {activeCount}</TabsTrigger>
        </TabsList>
        <TabsContent value="sessions" className="pt-4">
          <SessionsTab
            quarterId={quarterId}
            quarterStart={quarterStart}
            quarterEnd={quarterEnd}
            today={today}
            data={data}
            takenCount={takenCount}
          />
        </TabsContent>
        <TabsContent value="roster" className="pt-4">
          <RosterTab data={data} thresholds={thresholds} />
        </TabsContent>
      </UrlTabs>
    </div>
  );
}
