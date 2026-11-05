import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOutreachOverview } from "@/lib/data/outreach";
import { getDiscoveryOverview } from "@/lib/data/outreach-discovery";
import { PageHeader } from "@/components/page-header";
import { HEARTBEAT_JOBS } from "@/lib/outreach/heartbeat";
import { legacyOutreachRedirect } from "@/lib/outreach/links";
import { buildSchedule } from "@/lib/outreach/schedule";
import { funnelCounts, needsYouItems, senderState, stepLabel, todaySends } from "@/lib/outreach/view";
import { ORG_TIME_ZONE } from "@/lib/date";
import { TodayView, type JobLine } from "./today/today-view";

export const metadata: Metadata = { title: "Admin · Outreach" };

// Replies, bounces and sends change this all day.
export const dynamic = "force-dynamic";
// "Add companies" reads a few dozen websites in one request.
export const maxDuration = 60;

const JOB_LABELS = { discover: "Discovery", repair: "Repair", prepare: "Drafting", send: "Sending", agent: "Research agent" } as const;
const clock = new Intl.DateTimeFormat("en-US", { timeZone: ORG_TIME_ZONE, hour: "numeric", minute: "2-digit" });
const day = new Intl.DateTimeFormat("en-US", { timeZone: ORG_TIME_ZONE, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const percent = (part: number, whole: number) => {
  if (whole === 0) return "0%";
  const p = (part / whole) * 100;
  return `${p < 10 ? p.toFixed(1) : Math.round(p)}%`;
};

export default async function AdminOutreachPage({ searchParams }: { searchParams: Promise<{ stage?: string; prospect?: string; candidate?: string; outcome?: string }> }) {
  const legacy = legacyOutreachRedirect(await searchParams);
  if (legacy) redirect(legacy);

  let overview;
  try {
    overview = await getOutreachOverview();
  } catch (error) {
    console.error("Outreach overview failed:", error);
    return (
      <div className="space-y-6">
        <PageHeader title="Outreach" description="What needs you, what goes out today, and where every company stands." />
        <p className="rounded-[22px] border bg-card p-6 text-muted-foreground">
          The outreach page didn&apos;t load. Refresh the page. If it keeps happening, the outreach database tables may not be set up yet (see docs/outreach-setup.md).
        </p>
      </div>
    );
  }
  // Today must still open if Discovery's tables are missing.
  const found = await getDiscoveryOverview({ filter: "ready", size: "50" }).then((d) => d.counts.ready ?? 0).catch(() => 0);

  const { settings, health } = overview;
  const state = senderState({ settings, health, bookingOpen: overview.bookingOpen });
  const schedule = buildSchedule({ prospects: overview.prospects, messages: overview.messages, settings, now: new Date() });
  const fallbackName = settings.senderName || null;
  const bySender = new Map(settings.senders.map((s) => [s.id, s.name]));
  const senderOf = new Map(overview.prospects.map((p) => [p.id, p.senderId]));
  const today = todaySends(schedule, (id) => (settings.senders.length > 0 ? bySender.get(senderOf.get(id) ?? "") ?? null : fallbackName), settings);

  const jobs: JobLine[] = HEARTBEAT_JOBS.filter((job) => job !== "agent" || settings.agentEnabled).map((job) => {
    const j = overview.jobs[job];
    const summary = overview.jobSummaries[job];
    return {
      key: job,
      label: JOB_LABELS[job],
      ok: j.state === "ok",
      problem: j.state === "never_ran" ? "Never ran" : "Overdue",
      text: j.lastRunAt ? `${j.state === "ok" ? "ran" : "last ran"} ${day.format(new Date(j.lastRunAt))}${j.state === "ok" && summary ? `: ${summary}` : ""}` : j.state === "ok" ? "hasn't run yet" : "no run recorded",
    };
  });

  return (
    <TodayView
      state={{ label: state.label, variant: state.variant, detail: state.detail }}
      sentToday={overview.sentToday}
      cap={overview.cap}
      bounceRate={percent(health.bounced, health.sent)}
      bounceDetail={`${health.bounced} of ${health.sent} emails`}
      complained={health.complained}
      jobs={jobs}
      needsYou={needsYouItems(overview.prospects, overview.replies)}
      windowLabel={today.windowLabel}
      left={today.left}
      tomorrow={today.tomorrow}
      sends={today.items.map((i) => ({ prospectId: i.prospectId, company: i.company, step: stepLabel(i.step), time: i.at ? clock.format(new Date(i.at)) : null, state: i.state, senderName: i.senderName }))}
      funnel={funnelCounts(overview.prospects, found)}
      repliesToAnswer={overview.prospects.filter((p) => p.status === "replied").length}
      live={settings.mode === "live"}
    />
  );
}
