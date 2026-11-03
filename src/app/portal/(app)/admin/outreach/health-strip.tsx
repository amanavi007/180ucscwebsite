import { Badge } from "@/components/ui/badge";
import type { OutreachOverview } from "@/lib/data/outreach";
import { HEARTBEAT_JOBS, type HeartbeatJob } from "@/lib/outreach/heartbeat";
import { senderState } from "@/lib/outreach/view";

const JOB_LABELS: Record<HeartbeatJob, string> = { discover: "Discovery", repair: "Repair", prepare: "Drafting", send: "Sending" };

function when(iso: string | null): string {
  if (!iso) return "never";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function percent(part: number, whole: number): string {
  if (whole === 0) return "0%";
  const p = (part / whole) * 100;
  return `${p < 10 ? p.toFixed(1) : Math.round(p)}%`;
}

/** Is the sender running, how much has gone out today, and are bounces or spam complaints creeping up. */
export function HealthStrip({ overview }: { overview: OutreachOverview }) {
  const { health, settings } = overview;
  const state = senderState({ settings, health, bookingOpen: overview.bookingOpen });
  return (
    <section aria-label="Sending health" className="grid gap-x-8 gap-y-5 rounded-[22px] border bg-card p-5 sm:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
      <div>
        <p className="text-sm text-muted-foreground">Sender</p>
        <Badge variant={state.variant} className="mt-1.5">
          {state.label}
        </Badge>
        <p className="mt-2 text-sm text-muted-foreground">{state.detail}</p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Sent today</p>
        <p className="mt-1 font-heading text-3xl tabular-nums">
          {overview.sentToday} <span className="text-lg text-muted-foreground">of {overview.cap}</span>
        </p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Bounced, last 7 days</p>
        <p className="mt-1 font-heading text-3xl tabular-nums">{percent(health.bounced, health.sent)}</p>
        <p className="text-sm text-muted-foreground tabular-nums">{health.bounced} of {health.sent} emails</p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Marked as spam, last 7 days</p>
        <p className="mt-1 font-heading text-3xl tabular-nums">{health.complained}</p>
        <p className="text-sm text-muted-foreground">Sending stops at the first complaint over the limit.</p>
      </div>
      <div className="border-t pt-4 text-sm sm:col-span-4">
        <p className="text-muted-foreground">Daily jobs</p>
        <ul className="mt-1.5 flex flex-wrap gap-x-6 gap-y-2">
          {HEARTBEAT_JOBS.map((job) => {
            const j = overview.jobs[job];
            return (
              <li key={job} className="flex items-center gap-2">
                <span className="font-semibold">{JOB_LABELS[job]}</span>
                {j.state === "ok" ? (
                  <span className="tabular-nums text-muted-foreground">
                    {j.lastRunAt ? `ran ${when(j.lastRunAt)}` : "hasn't run yet"}
                    {overview.jobSummaries[job] ? `: ${overview.jobSummaries[job]}` : ""}
                  </span>
                ) : (
                  <>
                    <Badge variant="bad">{j.state === "never_ran" ? "Never ran" : "Overdue"}</Badge>
                    <span className="tabular-nums text-muted-foreground">{j.lastRunAt ? `last ran ${when(j.lastRunAt)}` : "no run recorded"}</span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
