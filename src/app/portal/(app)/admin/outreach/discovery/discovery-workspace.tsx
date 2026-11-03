"use client";

import { useMemo, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { runDiscoveryNowAction } from "@/actions/outreach";
import { FilterChip } from "@/components/filter-chip";
import { ListSearch } from "@/components/list-search";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DiscoveryOverview } from "@/lib/data/outreach-discovery";
import { OUTCOME_FILTERS, filterByOutcome, outcomeChip, type CandidateView } from "@/lib/outreach/discovery/view";
import { formatWhen } from "@/lib/outreach/view";
import { useFilteredList } from "@/lib/use-filtered-list";
import { cn } from "@/lib/utils";

const SEARCH_FIELDS: ((c: CandidateView) => string)[] = [(c) => c.company, (c) => c.domain, (c) => c.email ?? ""];

const PIPELINE_PATH = "/portal/admin/outreach";

const SKIPPED_MESSAGES: Record<string, string> = {
  target_met: "Today's target is already met.",
  backlog_full: "Too many prospects are still waiting to be sent, so discovery is holding off.",
  disabled: "Discovery is switched off.",
};

function lastRun(iso: string | null): string {
  if (!iso) return "Not yet";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** What discovery is doing today, the companies it has looked at, and why each was or wasn't added. */
export function DiscoveryWorkspace({ overview }: { overview: DiscoveryOverview }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const { settings, summary } = overview;

  const outcome = params.get("outcome") ?? "all";
  const selectedId = params.get("candidate");

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const { query, setQuery, filtered: searched } = useFilteredList<CandidateView>(overview.candidates, SEARCH_FIELDS);
  const counts = useMemo(
    () => Object.fromEntries(OUTCOME_FILTERS.map((f) => [f.key, filterByOutcome(overview.candidates, f.key).length])),
    [overview.candidates],
  );
  const visible = useMemo(() => filterByOutcome(searched, outcome), [searched, outcome]);
  const selected = overview.candidates.find((c) => c.id === selectedId) ?? null;

  const full = overview.backlog > overview.backlogLimit;
  const state = !settings.discoveryEnabled
    ? { label: "Off", variant: "muted" as const, detail: "Switched off. Turn it on in Settings, under Discovery." }
    : full
      ? { label: "Holding off", variant: "warn" as const, detail: `${overview.backlog} prospects are still waiting to be sent.` }
      : { label: "On", variant: "ok" as const, detail: "Runs every morning around 6am." };

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
        title="Discovery"
        description="Finds companies that fit, reads their own websites, and adds the ones that publish an email. Nothing here sends an email."
        actions={
          <Button size="lg" onClick={onFindNow} disabled={isPending}>
            {isPending ? "Looking..." : "Find companies now"}
          </Button>
        }
      />

      <section aria-label="Discovery status" className="grid gap-x-8 gap-y-5 rounded-[22px] border bg-card p-5 sm:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
        <div>
          <p className="text-sm text-muted-foreground">Discovery</p>
          <Badge variant={state.variant} className="mt-1.5">
            {state.label}
          </Badge>
          <p className="mt-2 text-sm text-muted-foreground">{state.detail}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Added today</p>
          <p className="mt-1 font-heading text-3xl tabular-nums">
            {summary.addedToday} <span className="text-lg text-muted-foreground">of {settings.discoveryPerDay}</span>
          </p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Looked at, last 7 days</p>
          <p className="mt-1 font-heading text-3xl tabular-nums">{summary.lookedAtWeek}</p>
          <p className="text-sm text-muted-foreground tabular-nums">{summary.addedWeek} added</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Last run</p>
          <p className="mt-1 font-heading text-3xl tabular-nums">{summary.lastRunAt ? formatWhen(summary.lastRunAt) : "–"}</p>
          <p className="text-sm text-muted-foreground tabular-nums">{summary.lastRunAt ? lastRun(summary.lastRunAt) : "Nothing looked at yet."}</p>
        </div>
      </section>

      <div className={cn("grid items-start gap-6", selected && "xl:grid-cols-[minmax(0,1fr)_420px]")}>
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <ListSearch value={query} onChange={setQuery} placeholder="Search company or email..." className="w-64" />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by result">
              {OUTCOME_FILTERS.map((f) => (
                <FilterChip key={f.key} selected={outcome === f.key} onClick={() => setParam("outcome", f.key)} count={counts[f.key]}>
                  {f.label}
                </FilterChip>
              ))}
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Why</TableHead>
                <TableHead>Looked at</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    {overview.candidates.length === 0
                      ? "Nothing yet. Turn discovery on in Settings, or press Find companies now."
                      : "No one matches that."}
                  </TableCell>
                </TableRow>
              )}
              {visible.map((c) => {
                const chip = outcomeChip(c.outcome);
                const isSelected = c.id === selectedId;
                return (
                  <TableRow
                    key={c.id}
                    data-state={isSelected ? "selected" : undefined}
                    aria-selected={isSelected}
                    tabIndex={0}
                    onClick={() => setParam("candidate", c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setParam("candidate", c.id);
                      }
                    }}
                    className="cursor-pointer outline-none focus-visible:bg-muted/60"
                  >
                    <TableCell>
                      <span className="block font-semibold">{c.company}</span>
                      <span className="block text-sm text-muted-foreground">{c.domain}</span>
                    </TableCell>
                    <TableCell className="max-w-72 text-sm text-muted-foreground">{c.reason ?? c.email ?? "–"}</TableCell>
                    <TableCell className="tabular-nums">{formatWhen(c.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant={chip.variant}>{chip.label}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {selected && <CandidatePanel key={selected.id} candidate={selected} onClose={() => setParam("candidate", null)} />}
      </div>
    </div>
  );
}

function CandidatePanel({ candidate, onClose }: { candidate: CandidateView; onClose: () => void }) {
  const chip = outcomeChip(candidate.outcome);
  return (
    <aside aria-label={candidate.company} className="max-h-[calc(100dvh-4rem)] space-y-6 overflow-y-auto rounded-[22px] border bg-card p-6 xl:sticky xl:top-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-xl">{candidate.company}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge variant={chip.variant}>{chip.label}</Badge>
          </div>
        </div>
        <Button variant="outline" size="icon-sm" onClick={onClose} aria-label="Close panel">
          ✕
        </Button>
      </div>

      {candidate.reason && <p className="rounded-2xl bg-muted p-3 text-sm">{candidate.reason}</p>}

      <dl className="space-y-3 text-sm">
        {candidate.website && (
          <div className="min-w-0">
            <dt className="text-muted-foreground">Website</dt>
            <dd>
              <a href={candidate.website} target="_blank" rel="noreferrer" className="break-all text-link underline-offset-4 hover:underline">
                {candidate.website}
              </a>
            </dd>
          </div>
        )}
        {candidate.email && (
          <div className="min-w-0">
            <dt className="text-muted-foreground">Email we found</dt>
            <dd className="break-all font-semibold">{candidate.email}</dd>
            {candidate.emailSourceUrl && (
              <dd className="mt-0.5">
                <span className="text-muted-foreground">Published on </span>
                <a href={candidate.emailSourceUrl} target="_blank" rel="noreferrer" className="break-all text-link underline-offset-4 hover:underline">
                  {candidate.emailSourceUrl}
                </a>
              </dd>
            )}
          </div>
        )}
        <div>
          <dt className="text-muted-foreground">Looked at</dt>
          <dd className="tabular-nums">{lastRun(candidate.createdAt)}</dd>
        </div>
      </dl>

      {candidate.prospectId && (
        <p className="text-sm">
          <Link href={`${PIPELINE_PATH}?prospect=${candidate.prospectId}`} className="text-link underline-offset-4 hover:underline">
            Open this prospect in the pipeline
          </Link>
          <span className="text-muted-foreground"> to see the facts the email will be based on.</span>
        </p>
      )}
    </aside>
  );
}
