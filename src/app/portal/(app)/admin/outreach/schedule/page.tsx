import type { Metadata } from "next";
import Link from "next/link";
import { getOutreachOverview } from "@/lib/data/outreach";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buildSchedule } from "@/lib/outreach/schedule";
import { senderState } from "@/lib/outreach/view";
import { ScheduleDays } from "./schedule-days";
import { ORG_TIME_ZONE } from "@/lib/date";

export const metadata: Metadata = { title: "Admin · Outreach Schedule" };

// What is queued changes all day.
export const dynamic = "force-dynamic";

const time = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: ORG_TIME_ZONE, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const hour = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;

export default async function OutreachSchedulePage() {
  let overview;
  try {
    overview = await getOutreachOverview();
  } catch (error) {
    console.error("Outreach schedule failed:", error);
    return (
      <div className="space-y-6">
        <PageHeader title="Schedule" description="What goes out today and on the next working days." />
        <p className="rounded-[22px] border bg-card p-6 text-muted-foreground">The schedule didn&apos;t load. Refresh the page. If it keeps happening, check the outreach database tables (see docs/outreach-setup.md).</p>
      </div>
    );
  }
  const { settings } = overview;
  const schedule = buildSchedule({ prospects: overview.prospects, messages: overview.messages, settings, now: new Date() });
  const state = senderState({ settings, health: overview.health, bookingOpen: overview.bookingOpen });
  const window = `${hour(settings.windowStartHour)} to ${hour(settings.windowEndHour)}`;
  const live = settings.mode === "live";
  const timeLabels = Object.fromEntries(schedule.days.flatMap((d) => d.items.filter((i) => i.at).map((i) => [`${i.prospectId}-${i.step}`, time(i.at!)])));
  const shown = schedule.days.filter((d) => !d.weekend || d.items.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Schedule" description="What goes out today and on the next working days, in the order it will go." />

      <section aria-label="Sender status" className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[22px] border bg-card p-5">
        <div className="min-w-0 flex-1 basis-72">
          <Badge variant={state.variant}>{state.label}</Badge>
          <p className="mt-2 text-sm text-muted-foreground">
            {live
              ? `${state.detail} Each morning the sender picks a random time for every email inside the ${window} window (Pacific).`
              : `${state.detail} Nothing below goes to a company until you switch to Live in Settings. This is the plan for when you do.`}
          </p>
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Waiting for an email to be written</dt>
            <dd className="font-heading text-2xl tabular-nums">{schedule.notDrafted}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              Need you, <Link href="/portal/admin/outreach" className="text-link underline-offset-2 hover:underline">see Pipeline</Link>
            </dt>
            <dd className="font-heading text-2xl tabular-nums">{schedule.needsAttention}</dd>
          </div>
          {schedule.waitingBeyond > 0 && (
            <div>
              <dt className="text-muted-foreground">Written, past the days shown</dt>
              <dd className="font-heading text-2xl tabular-nums">{schedule.waitingBeyond}</dd>
            </div>
          )}
        </dl>
      </section>

      <ScheduleDays days={shown} window={window} timeLabels={timeLabels} />
      <p className="text-sm text-muted-foreground">
        Future days show the order and how many, not exact times. The sender draws the oldest written email first, sends at most one per company domain a day, skips weekends, and raises the daily limit as the sending domain builds a track record.
      </p>
    </div>
  );
}
