"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { regenerateDraftsAction, runDiscoveryNowAction, runPrepareNowAction } from "@/actions/outreach";
import { ListSearch } from "@/components/list-search";
import { PageHeader } from "@/components/page-header";
import { Pager } from "@/components/pager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { OutreachOverview, ProspectView } from "@/lib/data/outreach";
import type { DiscoveryOverview } from "@/lib/data/outreach-discovery";
import { pageRows, parsePage, parsePageSize, PAGE_SIZES } from "@/lib/paging";
import { useFilteredList } from "@/lib/use-filtered-list";
import { filterByStage, formatWhen, isDiscoveryStage, nicheOptions, stageChip } from "@/lib/outreach/view";
import { cn } from "@/lib/utils";
import { ImportDialog } from "../import-dialog";
import { CompanyListDialog } from "./company-list-dialog";
import { DiscoveryList } from "./discovery-list";
import { ProspectPanel } from "./prospect-panel";
import { StageBar } from "./stage-bar";

const SEARCH_FIELDS: ((p: ProspectView) => string)[] = [(p) => p.company, (p) => p.contactName ?? "", (p) => p.contactEmail];

const SKIPPED_MESSAGES: Record<string, string> = {
  target_met: "Today's target is already met.",
  backlog_full: "Too many prospects are still waiting to be sent, so discovery is holding off.",
  disabled: "Discovery is switched off.",
};

/** An unsent first email: the only kind that can be rewritten. */
const canRewrite = (p: ProspectView) => p.step === 0 && ["drafted", "needs_attention"].includes(p.status);

/** Every company in one place: stage chips on top, the list below, and the panel beside it. Found and Skipped show Discovery's candidates. */
export function CompaniesWorkspace({ overview, discovery, stage, counts }: { overview: OutreachOverview; discovery: DiscoveryOverview | null; stage: string; counts: Record<string, number> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [importOpen, setImportOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [niche, setNiche] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const selectedId = params.get("prospect");

  /** Changes address-bar settings. Anything that changes which companies are listed also goes back to page 1. */
  function setParams(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value && value !== "all") next.set(key, value);
      else next.delete(key);
    }
    if (!("page" in changes) && !("prospect" in changes)) next.delete("page");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }
  const setParam = (key: string, value: string | null) => setParams({ [key]: value });

  const { query, setQuery: setQueryRaw, filtered: searched } = useFilteredList<ProspectView>(overview.prospects, SEARCH_FIELDS);
  const setQuery = (value: string) => {
    setQueryRaw(value);
    if (params.get("page")) setParams({ page: null });
  };
  const niches = useMemo(() => nicheOptions(overview.prospects), [overview.prospects]);
  const visible = useMemo(
    () => filterByStage(searched, stage).filter((p) => !niche || p.niche === niche),
    [searched, stage, niche],
  );

  // Only one page of rows is ever drawn: 700 rows at once makes the page slow.
  const size = parsePageSize(params.get("size"));
  const page = parsePage(params.get("page"), visible.length, size);
  const shown = useMemo(() => pageRows(visible, page, size), [visible, page, size]);

  const rewritable = useMemo(() => shown.filter(canRewrite).map((p) => p.id), [shown]);
  const checkedIds = [...checked].filter((id) => overview.prospects.some((p) => p.id === id && canRewrite(p)));
  const allChecked = rewritable.length > 0 && rewritable.every((id) => checked.has(id));

  function toggle(id: string, on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function onRewriteChecked() {
    startTransition(async () => {
      const reset = await regenerateDraftsAction(checkedIds);
      if (reset.error) return void toast.error(reset.error);
      setChecked(new Set());
      const result = await runPrepareNowAction();
      if (result.error) toast.error(result.error);
      else if (result.result) {
        const r = result.result;
        toast.success(`Rewrote ${reset.rewritten}. ${r.drafted} drafted, ${r.needsAttention} need a look.`);
      }
      router.refresh();
    });
  }

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

  function onFindNow() {
    startTransition(async () => {
      const result = await runDiscoveryNowAction();
      if (result.error) return void toast.error(result.error);
      const r = result.result;
      if (r?.skipped) toast.message(SKIPPED_MESSAGES[r.skipped] ?? "Nothing to do right now.");
      else if (r) toast.success(`Looked at ${r.evaluated} companies and added ${r.added}.`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Companies"
        description="Every company, from found to booked. Replies are forwarded to all execs."
        actions={
          <>
            <Button variant="outline" size="lg" onClick={onGenerate} disabled={isPending || overview.settings.mode === "off"}>
              Generate drafts
            </Button>
            <Button variant="outline" size="lg" onClick={onFindNow} disabled={isPending}>
              Find companies now
            </Button>
            <Button variant="outline" size="lg" onClick={() => setImportOpen(true)}>
              Import a CSV
            </Button>
            <Button size="lg" onClick={() => setListOpen(true)}>
              Add companies
            </Button>
          </>
        }
      />
      {overview.settings.mode === "off" && (
        <p className="text-sm text-muted-foreground">Generate drafts is disabled while outreach is off. Change the mode in Settings.</p>
      )}

      <StageBar stage={stage} counts={counts} />

      {isDiscoveryStage(stage) ? (
        discovery ? (
          <DiscoveryList key={stage} overview={discovery} stage={stage} />
        ) : (
          <p className="rounded-[22px] border bg-card p-6 text-muted-foreground">
            Discovery&apos;s list didn&apos;t load. Refresh the page. If it keeps happening, run the latest database migrations (20261103000001, 20261103000002 and 20261103000004).
          </p>
        )
      ) : (
      <div className={cn("grid items-start gap-6", selected && "xl:grid-cols-[minmax(0,1fr)_420px]")}>
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <ListSearch value={query} onChange={setQuery} placeholder="Search company or contact..." className="w-64" />
            {niches.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Niche
                <select
                  value={niche}
                  onChange={(e) => {
                    setNiche(e.target.value);
                    if (params.get("page")) setParams({ page: null });
                  }}
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

          {checkedIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-[10px] border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium">{checkedIds.length} selected</span>
              <Button variant="outline" size="sm" onClick={onRewriteChecked} disabled={isPending}>
                Rewrite selected
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setChecked(new Set())} disabled={isPending}>
                Clear
              </Button>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allChecked}
                    disabled={rewritable.length === 0}
                    onCheckedChange={(on) => setChecked(on === true ? new Set([...checked, ...rewritable]) : new Set([...checked].filter((id) => !rewritable.includes(id))))}
                    aria-label="Select all drafts that can be rewritten"
                  />
                </TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Niche</TableHead>
                <TableHead>Next step</TableHead>
                <TableHead>Stage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    {overview.prospects.length === 0
                      ? "No prospects yet. Import the CSV from the research prompt to fill this list."
                      : "No one matches that."}
                  </TableCell>
                </TableRow>
              )}
              {shown.map((p) => {
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
                    <TableCell onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      {canRewrite(p) && (
                        <Checkbox checked={checked.has(p.id)} onCheckedChange={(on) => toggle(p.id, on === true)} aria-label={`Select ${p.company}`} />
                      )}
                    </TableCell>
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

          <Pager
            total={visible.length}
            page={page}
            size={size}
            onChange={(c) => setParams(c.size !== undefined ? { size: c.size === PAGE_SIZES[0] ? null : String(c.size) } : { page: String(c.page) })}
          />
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

      )}

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <CompanyListDialog open={listOpen} onOpenChange={setListOpen} />
    </div>
  );
}
