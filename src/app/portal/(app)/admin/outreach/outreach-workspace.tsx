"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { runPrepareNowAction, runSendTestNowAction } from "@/actions/outreach";
import { FilterChip } from "@/components/filter-chip";
import { ListSearch } from "@/components/list-search";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { OutreachOverview, ProspectView } from "@/lib/data/outreach";
import { useFilteredList } from "@/lib/use-filtered-list";
import { STAGE_FILTERS, filterByStage, formatWhen, nicheOptions, stageChip } from "@/lib/outreach/view";
import { cn } from "@/lib/utils";
import { HealthStrip } from "./health-strip";
import { ImportDialog } from "./import-dialog";
import { ProspectPanel } from "./prospect-panel";

const SEARCH_FIELDS: ((p: ProspectView) => string)[] = [(p) => p.company, (p) => p.contactName ?? "", (p) => p.contactEmail];

const SKIP_MESSAGES: Record<string, string> = {
  nothing_due: "No drafts are ready to send. Generate drafts first.",
  no_test_recipient: "No test inbox yet. Save the mode again in Settings.",
  paused: "Outreach is paused. Unpause it in Settings.",
};

/** The prospect list with filters, the health strip above it, and the panel beside it. */
export function OutreachWorkspace({ overview }: { overview: OutreachOverview }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [importOpen, setImportOpen] = useState(false);
  const [niche, setNiche] = useState("");
  const [isPending, startTransition] = useTransition();

  const stage = params.get("stage") ?? "all";
  const selectedId = params.get("prospect");

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const { query, setQuery, filtered: searched } = useFilteredList<ProspectView>(overview.prospects, SEARCH_FIELDS);
  const niches = useMemo(() => nicheOptions(overview.prospects), [overview.prospects]);
  const counts = useMemo(
    () => Object.fromEntries(STAGE_FILTERS.map((f) => [f.key, filterByStage(overview.prospects, f.key).length])),
    [overview.prospects],
  );
  const visible = useMemo(
    () => filterByStage(searched, stage).filter((p) => !niche || p.niche === niche),
    [searched, stage, niche],
  );

  const selected = overview.prospects.find((p) => p.id === selectedId) ?? null;

  function onGenerate() {
    startTransition(async () => {
      const result = await runPrepareNowAction();
      if (result.error) toast.error(result.error);
      else if (result.result) {
        const r = result.result;
        toast.success(`${r.verified} verified, ${r.drafted} drafted, ${r.needsAttention} need a look.`);
        router.refresh();
      }
    });
  }

  function onSendTest() {
    startTransition(async () => {
      const result = await runSendTestNowAction();
      if (result.error) toast.error(result.error);
      else if (result.sent) toast.success(`Sent ${result.sent} test email${result.sent === 1 ? "" : "s"}. Check your inbox.`);
      else toast.message(SKIP_MESSAGES[result.skipped ?? ""] ?? "Nothing was sent.");
    });
  }

  const testMode = overview.settings.mode === "self_only" || overview.settings.mode === "exec_only";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Outreach"
        description={`${overview.prospects.length} prospects · emails go out slowly from the team address, and every reply is forwarded to all execs.`}
        actions={
          <>
            <Button variant="outline" size="lg" onClick={onGenerate} disabled={isPending || overview.settings.mode === "off"}>
              Generate drafts
            </Button>
            {testMode && (
              <Button variant="outline" size="lg" onClick={onSendTest} disabled={isPending}>
                Send test emails
              </Button>
            )}
            <Button size="lg" onClick={() => setImportOpen(true)}>
              Import prospects
            </Button>
          </>
        }
      />
      {overview.settings.mode === "off" && (
        <p className="text-sm text-muted-foreground">Generate drafts is disabled while outreach is off. Change the mode in Settings.</p>
      )}

      <HealthStrip overview={overview} />

      <div className={cn("grid items-start gap-6", selected && "xl:grid-cols-[minmax(0,1fr)_420px]")}>
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <ListSearch value={query} onChange={setQuery} placeholder="Search company or contact..." className="w-64" />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by stage">
              {STAGE_FILTERS.map((f) => (
                <FilterChip key={f.key} selected={stage === f.key} onClick={() => setParam("stage", f.key)} count={counts[f.key]}>
                  {f.label}
                </FilterChip>
              ))}
            </div>
            {niches.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Niche
                <select
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  className="h-8 rounded-[10px] border border-input bg-card px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">All</option>
                  {niches.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Niche</TableHead>
                <TableHead>Next step</TableHead>
                <TableHead>Stage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    {overview.prospects.length === 0
                      ? "No prospects yet. Import the CSV from the research prompt to fill this list."
                      : "No one matches that."}
                  </TableCell>
                </TableRow>
              )}
              {visible.map((p) => {
                const chip = stageChip(p.status);
                const isSelected = p.id === selectedId;
                return (
                  <TableRow
                    key={p.id}
                    data-state={isSelected ? "selected" : undefined}
                    aria-selected={isSelected}
                    tabIndex={0}
                    onClick={() => setParam("prospect", p.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setParam("prospect", p.id);
                      }
                    }}
                    className="cursor-pointer outline-none focus-visible:bg-muted/60"
                  >
                    <TableCell>
                      <span className="block font-semibold">{p.company}</span>
                      <span className="block text-sm text-muted-foreground">
                        {p.contactName ? `${p.contactName} · ` : ""}
                        {p.contactEmail}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.niche ?? "–"}</TableCell>
                    <TableCell className="tabular-nums">{formatWhen(p.nextActionAt)}</TableCell>
                    <TableCell>
                      <Badge variant={chip.variant}>{chip.label}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {selected && (
          <ProspectPanel
            key={selected.id}
            prospect={selected}
            messages={overview.messages.filter((m) => m.prospectId === selected.id)}
            replies={overview.replies.filter((r) => r.prospectId === selected.id)}
            events={overview.events.filter((e) => e.prospectId === selected.id)}
            onClose={() => setParam("prospect", null)}
          />
        )}
      </div>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
