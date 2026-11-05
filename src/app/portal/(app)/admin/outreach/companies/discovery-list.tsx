"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { addCandidateEmailAction, notDuplicateAction } from "@/actions/outreach";
import { Pager } from "@/components/pager";
import { ListSearch } from "@/components/list-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DiscoveryOverview } from "@/lib/data/outreach-discovery";
import { PAGE_SIZES } from "@/lib/paging";
import { outcomeChip, type CandidateView } from "@/lib/outreach/discovery/view";
import { companiesHref } from "@/lib/outreach/links";
import { formatWhen } from "@/lib/outreach/view";
import { cn } from "@/lib/utils";


function lastRun(iso: string | null): string {
  if (!iso) return "Not yet";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** What discovery is doing today, the companies it has looked at, and why each was or wasn't added. */
export function DiscoveryList({ overview, stage }: { overview: DiscoveryOverview; stage: "found" | "skipped" }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [navPending, startNav] = useTransition();
  const { settings, summary } = overview;

  const selectedId = params.get("candidate");

  /** Changes address-bar settings. Anything that changes which companies are listed also goes back to page 1. */
  function setParams(changes: Record<string, string | null>, keepPage = false) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value && value !== "all") next.set(key, value);
      else next.delete(key);
    }
    if (!keepPage && !("page" in changes)) next.delete("page");
    const query = next.toString();
    startNav(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }
  const setParam = (key: string, value: string | null) => setParams({ [key]: value }, key === "candidate");

  // The server searches and pages, so the browser only ever holds one page of rows.
  const [query, setQuery] = useState(overview.search);
  useEffect(() => {
    if (query.trim() === overview.search) return;
    const id = setTimeout(() => setParams({ q: query.trim() || null }), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  const visible = overview.candidates;
  const selected = overview.selected;

  const full = overview.backlog > overview.backlogLimit;
  const state = !settings.discoveryEnabled
    ? { label: "Off", variant: "muted" as const, detail: "Switched off. Turn it on in Settings, under Discovery." }
    : full
      ? { label: "Holding off", variant: "warn" as const, detail: `${overview.backlog} prospects are still waiting to be sent.` }
      : { label: "On", variant: "ok" as const, detail: "Runs every morning around 6am." };

  return (
    <div className="space-y-6">
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
          <p className="text-sm text-muted-foreground">Ready to add</p>
          <p className="mt-1 font-heading text-3xl tabular-nums">{overview.counts.ready ?? 0}</p>
          <p className="text-sm text-muted-foreground tabular-nums">{summary.addedWeek} added in the last 7 days</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Last run</p>
          <p className="mt-1 font-heading text-3xl tabular-nums">{summary.lastRunAt ? formatWhen(summary.lastRunAt) : "–"}</p>
          <p className="text-sm text-muted-foreground tabular-nums">{summary.lastRunAt ? lastRun(summary.lastRunAt) : "Nothing looked at yet."}</p>
        </div>
      </section>

      <div className={cn("grid items-start gap-6", selected && "xl:grid-cols-[minmax(0,1fr)_420px]")}>
        <div className={cn("min-w-0 space-y-4 transition-opacity", navPending && "opacity-60")} aria-busy={navPending}>
          <div className="flex flex-wrap items-center gap-3">
            <ListSearch value={query} onChange={setQuery} placeholder="Search company or email..." className="w-64" />
          </div>
          {stage === "skipped" && (
            <p className="text-sm text-muted-foreground">
              Companies discovery set aside. &quot;Retrying&quot; ones it is still working on by itself; &quot;Gave up&quot; ones had no working website or no public email. Nothing to do here. Open one to add an email yourself, or to overrule &quot;Already known&quot;.
            </p>
          )}

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
                    {overview.search
                      ? "No one matches that."
                      : stage === "found"
                        ? "No companies are waiting. Turn discovery on in Settings, press Find companies now, or add a list of companies."
                        : "Nothing has been set aside."}
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
                    <TableCell className="max-w-72 min-w-48 text-sm break-words whitespace-normal text-muted-foreground">{c.reason ?? c.email ?? "–"}</TableCell>
                    <TableCell className="pl-6 whitespace-nowrap tabular-nums">{formatWhen(c.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant={chip.variant}>{chip.label}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <Pager
            total={overview.total}
            page={overview.page}
            size={overview.size}
            pending={navPending}
            onChange={(c) => setParams(c.size !== undefined ? { size: c.size === PAGE_SIZES[0] ? null : String(c.size) } : { page: String(c.page) })}
          />
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

      {candidate.founders.length > 0 && (
        <section aria-labelledby="founders-heading" className="space-y-2">
          <h3 id="founders-heading" className="text-base">
            Founders
          </h3>
          <ul className="space-y-1.5 text-sm">
            {candidate.founders.map((f) => (
              <li key={f.name} className="min-w-0">
                <span className="font-semibold">{f.name}</span>
                {f.title && <span className="text-muted-foreground"> · {f.title}</span>}
                {f.linkedinUrl && (
                  <>
                    {" · "}
                    <a href={f.linkedinUrl} target="_blank" rel="noreferrer" className="text-link underline-offset-4 hover:underline">
                      LinkedIn
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {["no_email", "unreachable", "failed"].includes(candidate.outcome) && <AddEmailForm candidate={candidate} />}
      {candidate.outcome === "duplicate" && <NotDuplicate candidate={candidate} />}

      {candidate.prospectId && (
        <p className="text-sm">
          <Link href={companiesHref({ prospect: candidate.prospectId })} className="text-link underline-offset-4 hover:underline">
            Open this prospect in Companies
          </Link>
          <span className="text-muted-foreground"> to see the facts the email will be based on.</span>
        </p>
      )}
    </aside>
  );
}

/** For a company wrongly flagged as already known: look at its website again and put it back in the pool. */
function NotDuplicate({ candidate }: { candidate: CandidateView }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  function onClick() {
    startTransition(async () => {
      const result = await notDuplicateAction(candidate.id);
      if (result.error) return void toast.error(result.error);
      toast.success(`${candidate.company} is back in the pool.`);
      router.refresh();
    });
  }
  return (
    <section aria-labelledby="not-dup-heading" className="space-y-3 rounded-2xl border p-4">
      <h3 id="not-dup-heading" className="text-base">
        Not actually known?
      </h3>
      <p className="text-sm text-muted-foreground">
        If this is a different company, or one nobody has contacted, read its website again and put it back in line. Addresses on the do-not-contact list stay blocked.
      </p>
      <Button variant="outline" onClick={onClick} disabled={isPending}>
        {isPending ? "Checking..." : "It's not known, add it"}
      </Button>
    </section>
  );
}

/** For a company with no published email: a person finds one (team page, LinkedIn) and adds it. */
function AddEmailForm({ candidate }: { candidate: CandidateView }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const search = `https://www.google.com/search?q=${encodeURIComponent(`${candidate.company} founder contact email`)}`;
  const directory = candidate.sourceRef ? `https://www.ycombinator.com/companies/${candidate.sourceRef}` : null;

  function onAdd() {
    startTransition(async () => {
      const result = await addCandidateEmailAction(candidate.id, email);
      if (result.error) return void toast.error(result.error);
      toast.success(`${candidate.company} added with ${email.trim().toLowerCase()}.`);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="add-email-heading" className="space-y-3 rounded-2xl border p-4">
      <h3 id="add-email-heading" className="text-base">
        Add an email yourself
      </h3>
      <p className="text-sm text-muted-foreground">
        Found a founder&apos;s address on their team page or LinkedIn? Add it and this company joins the pipeline with the same sourced facts.
      </p>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <a href={search} target="_blank" rel="noreferrer" className="text-link underline-offset-4 hover:underline">
          Search the web for a contact
        </a>
        {directory && (
          <a href={directory} target="_blank" rel="noreferrer" className="text-link underline-offset-4 hover:underline">
            See the founders on Y Combinator
          </a>
        )}
      </p>
      <Field>
        <FieldLabel htmlFor="candidate-email">Email address</FieldLabel>
        <Input id="candidate-email" type="email" value={email} placeholder="name@company.com" onChange={(e) => setEmail(e.target.value)} />
        <FieldDescription>It is checked like any other prospect before anything is sent.</FieldDescription>
      </Field>
      <Button variant="outline" onClick={onAdd} disabled={isPending || email.trim() === ""}>
        {isPending ? "Adding..." : "Add as a prospect"}
      </Button>
    </section>
  );
}
