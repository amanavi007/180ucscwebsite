"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { companiesHref } from "@/lib/outreach/links";
import type { ChipVariant, NeedsYouItem } from "@/lib/outreach/view";
import { cn } from "@/lib/utils";
import { CompanyListDialog } from "../companies/company-list-dialog";

export interface JobLine {
  key: string;
  label: string;
  ok: boolean;
  problem: string;
  text: string;
}

interface Send {
  prospectId: string;
  company: string;
  step: string;
  time: string | null;
  state: "sent" | "scheduled" | "planned";
  senderName: string | null;
}

const KIND_CHIP: Record<NeedsYouItem["kind"], { label: string; variant: ChipVariant }> = {
  reply: { label: "Reply", variant: "warn" },
  stuck: { label: "Stuck", variant: "bad" },
  bounced: { label: "Bounced", variant: "bad" },
};

const SEND_CHIP: Record<Send["state"], { label: string; variant: ChipVariant }> = {
  sent: { label: "Sent", variant: "ok" },
  scheduled: { label: "Scheduled", variant: "info" },
  planned: { label: "Planned", variant: "muted" },
};

/** Today: what needs a person, what goes out today, and where every company stands. */
export function TodayView(props: {
  state: { label: string; variant: ChipVariant; detail: string };
  sentToday: number;
  cap: number;
  bounceRate: string;
  bounceDetail: string;
  complained: number;
  jobs: JobLine[];
  needsYou: NeedsYouItem[];
  windowLabel: string;
  left: number;
  tomorrow: number;
  sends: Send[];
  funnel: { key: string; label: string; count: number; href: string }[];
  repliesToAnswer: number;
  live: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const problems = props.jobs.filter((j) => !j.ok).length;
  const meter = props.cap > 0 ? Math.min(100, Math.round((props.sentToday / props.cap) * 100)) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Outreach"
        description="Finds companies, writes the emails, sends them, and catches the replies."
        actions={
          <Button size="lg" onClick={() => setAddOpen(true)}>
            Add companies
          </Button>
        }
      />

      <section aria-label="Sending status" className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-[22px] border bg-card px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Badge variant={props.state.variant}>{props.state.label}</Badge>
          <span className="text-sm text-muted-foreground">{props.state.detail}</span>
        </div>
        <div className="flex items-center gap-2.5 text-sm">
          <span>
            <b className="tabular-nums">{props.sentToday} of {props.cap}</b> <span className="text-muted-foreground">sent today</span>
          </span>
          <span className="h-2 w-24 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span className="block h-full bg-foreground" style={{ width: `${meter}%` }} />
          </span>
        </div>
        <p className="text-sm">
          <b className="tabular-nums">{props.bounceRate}</b> <span className="text-muted-foreground">bounced this week</span>
        </p>
        <p className="text-sm">
          <b className="tabular-nums">{props.complained}</b> <span className="text-muted-foreground">spam complaints</span>
        </p>
        <div className="flex items-center gap-2.5 sm:ml-auto">
          <Badge variant={problems === 0 ? "ok" : "bad"}>{problems === 0 ? "All daily jobs ran" : `${problems} job${problems === 1 ? "" : "s"} need a look`}</Badge>
          <Button variant="ghost" size="sm" onClick={() => setDetailsOpen(true)}>
            Details
          </Button>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section aria-labelledby="needs-you-heading" className="rounded-[22px] border bg-card p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="needs-you-heading" className="text-xl">Needs you</h2>
            {props.needsYou.length > 0 && <Badge variant="warn">{props.needsYou.length} {props.needsYou.length === 1 ? "thing" : "things"}</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Only what a person has to decide. Empty means you are done.</p>
          {props.needsYou.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-muted p-4 text-sm">Nothing needs you.</p>
          ) : (
            <ul className="mt-3 divide-y">
              {props.needsYou.map((item) => (
                <li key={`${item.kind}-${item.prospectId}`} className="flex items-center gap-3 py-3">
                  <Badge variant={KIND_CHIP[item.kind].variant}>{KIND_CHIP[item.kind].label}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{item.company}</p>
                    <p className="truncate text-sm text-muted-foreground">{item.reason}</p>
                  </div>
                  <Link href={companiesHref({ prospect: item.prospectId })} className="shrink-0 text-sm font-semibold text-link underline-offset-4 hover:underline">
                    {item.actionLabel}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="going-out-heading" className="rounded-[22px] border bg-card p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="going-out-heading" className="text-xl">Going out today</h2>
            <span className="text-sm text-muted-foreground">{props.windowLabel} Pacific</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {props.live ? `${props.left} left to send.` : "Test mode: nothing here reaches a company until you switch to Live."}
          </p>
          {props.sends.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-muted p-4 text-sm">Nothing is scheduled for today.</p>
          ) : (
            <ul className="mt-3 divide-y">
              {props.sends.slice(0, 8).map((s) => (
                <li key={`${s.prospectId}-${s.step}`} className="flex items-center gap-3 py-3">
                  <span className="w-16 shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">{s.time ?? "–"}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={companiesHref({ prospect: s.prospectId })} className="block truncate font-semibold underline-offset-4 hover:underline">
                      {s.company}
                    </Link>
                    <p className="truncate text-sm text-muted-foreground">{s.step}{s.senderName ? `, from ${s.senderName}` : ""}</p>
                  </div>
                  <Badge variant={SEND_CHIP[s.state].variant}>{SEND_CHIP[s.state].label}</Badge>
                </li>
              ))}
            </ul>
          )}
          {props.sends.length > 8 && <p className="mt-2 text-sm text-muted-foreground">and {props.sends.length - 8} more</p>}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
            <span className="text-muted-foreground">Tomorrow: {props.tomorrow} planned</span>
            <Link href="/portal/admin/outreach/schedule" className="font-semibold text-link underline-offset-4 hover:underline">
              See next days
            </Link>
          </div>
        </section>
      </div>

      <section aria-labelledby="pipeline-heading" className="rounded-[22px] border bg-card p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="pipeline-heading" className="text-xl">The whole pipeline</h2>
          <span className="text-sm text-muted-foreground">Click a step to see those companies</span>
        </div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {props.funnel.map((f) => {
            const hot = f.key === "replied" && props.repliesToAnswer > 0;
            return (
              <li key={f.key}>
                <Link
                  href={f.href}
                  className={cn(
                    "block rounded-2xl border p-4 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    hot ? "border-transparent bg-status-warn text-status-warn-foreground" : "bg-card hover:bg-accent",
                  )}
                >
                  <span className="text-xs font-semibold tracking-wide uppercase">{f.label}</span>
                  <span className="mt-1 block font-heading text-3xl tabular-nums">{f.count.toLocaleString("en-US")}</span>
                  {hot && <span className="text-sm">{props.repliesToAnswer} need an answer</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <CompanyListDialog open={addOpen} onOpenChange={setAddOpen} />

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-6 sm:max-w-md">
          <SheetHeader className="p-0">
            <SheetTitle className="text-xl">Daily jobs</SheetTitle>
            <SheetDescription>Each morning job, when it last ran, and what it did.</SheetDescription>
          </SheetHeader>
          <ul className="space-y-4">
            {props.jobs.map((j) => (
              <li key={j.key} className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{j.label}</span>
                  {!j.ok && <Badge variant="bad">{j.problem}</Badge>}
                </div>
                <p className="text-sm text-muted-foreground tabular-nums">{j.text}</p>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </div>
  );
}
