import type { Metadata } from "next";
import Link from "next/link";
import { getOutreachOverview } from "@/lib/data/outreach";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buildSchedule, type ScheduleDay, type ScheduleItem } from "@/lib/outreach/schedule";
import { senderState, stepLabel } from "@/lib/outreach/view";
import { ORG_TIME_ZONE } from "@/lib/date";

export const metadata: Metadata = { title: "Admin · Outreach Schedule" };

// What is queued changes all day.
export const dynamic = "force-dynamic";

const time = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: ORG_TIME_ZONE, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const hour = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;

const STATE: Record<ScheduleItem["state"], { label: string; variant: "ok" | "info" | "muted" }> = {
  sent: { label: "Sent", variant: "ok" },
  scheduled: { label: "Scheduled", variant: "info" },
  planned: { label: "Planned", variant: "muted" },
};

function DayCard({ day, window }: { day: ScheduleDay; window: string }) {
  const planned = day.items.filter((i) => i.state === "planned").length;
  return (
    <section aria-labelledby={`day-${day.date}`} className="rounded-[22px] border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5">
        <h2 id={`day-${day.date}`} className="text-xl">
          {day.label}
        </h2>
        <p className="text-sm tabular-nums text-muted-foreground">
          {day.weekend ? "Weekend" : `${day.items.length} of up to ${day.cap}`}
          {planned > 0 && day.items.length > planned ? `, ${planned} still planned` : ""}
        </p>
      </div>
      {day.weekend ? (
        <p className="px-5 pb-5 pt-2 text-sm text-muted-foreground">No emails go out on weekends.</p>
      ) : day.items.length === 0 ? (
        <p className="px-5 pb-5 pt-2 text-sm text-muted-foreground">Nothing planned. Written emails fill this day once there are some.</p>
      ) : (
        <ul className="mt-2 divide-y">
          {day.items.map((it) => (
            <li key={`${it.prospectId}-${it.step}`} className="grid gap-x-4 gap-y-1 px-5 py-3.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_auto_auto] sm:items-center">
              <div className="min-w-0">
                <p className="truncate font-semibold">{it.company}</p>
                <p className="truncate text-sm text-muted-foreground">{it.contact}</p>
              </div>
              <div className="min-w-0 text-sm">
                <p className="truncate">{it.subject ?? "Written the morning it is due"}</p>
                <p className="text-muted-foreground">{stepLabel(it.step)}</p>
              </div>
              <Badge variant={STATE[it.state].variant} className="justify-self-start sm:justify-self-end">
                {STATE[it.state].label}
              </Badge>
              <p className="text-sm tabular-nums text-muted-foreground sm:w-36 sm:text-right">{it.at ? time(it.at) : window}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

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

      {shown.map((day) => (
        <DayCard key={day.date} day={day} window={window} />
      ))}
      <p className="text-sm text-muted-foreground">
        Future days show the order and how many, not exact times. The sender draws the oldest written email first, sends at most one per company domain a day, skips weekends, and raises the daily limit as the sending domain builds a track record.
      </p>
    </div>
  );
}
