"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ScheduleDay, ScheduleItem } from "@/lib/outreach/schedule";
import { stepLabel } from "@/lib/outreach/view";

const STATE: Record<ScheduleItem["state"], { label: string; variant: "ok" | "info" | "muted" }> = {
  sent: { label: "Sent", variant: "ok" },
  scheduled: { label: "Scheduled", variant: "info" },
  planned: { label: "Planned", variant: "muted" },
};

const itemKey = (it: ScheduleItem) => `${it.prospectId}-${it.step}`;

/** The day-by-day list, with the chosen email opening in a panel beside it. */
export function ScheduleDays({ days, window, timeLabels }: { days: ScheduleDay[]; window: string; timeLabels: Record<string, string> }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const all = days.flatMap((d) => d.items.map((it) => ({ it, day: d })));
  const selected = all.find((x) => itemKey(x.it) === selectedKey) ?? null;

  return (
    <div className={selected ? "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]" : "grid gap-6"}>
      <div className="min-w-0 space-y-6">
        {days.map((day) => {
          const planned = day.items.filter((i) => i.state === "planned").length;
          return (
            <section key={day.date} aria-labelledby={`day-${day.date}`} className="rounded-[22px] border bg-card">
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
                    <li key={itemKey(it)}>
                      <button
                        type="button"
                        onClick={() => setSelectedKey(itemKey(it) === selectedKey ? null : itemKey(it))}
                        aria-pressed={itemKey(it) === selectedKey}
                        className="grid w-full gap-x-4 gap-y-1 px-5 py-3.5 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-accent sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_auto_auto] sm:items-center"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{it.company}</span>
                          <span className="block truncate text-sm text-muted-foreground">{it.contact}</span>
                        </span>
                        <span className="min-w-0 text-sm">
                          <span className="block truncate">{it.subject ?? "Written the morning it is due"}</span>
                          <span className="block text-muted-foreground">{stepLabel(it.step)}</span>
                        </span>
                        <Badge variant={STATE[it.state].variant} className="justify-self-start sm:justify-self-end">
                          {STATE[it.state].label}
                        </Badge>
                        <span className="text-sm tabular-nums text-muted-foreground sm:w-36 sm:text-right">{timeLabels[itemKey(it)] ?? window}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {selected && (
        <aside aria-label="Email draft" className="order-first rounded-[22px] border bg-card p-5 lg:sticky lg:top-4 lg:order-none lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="break-words text-xl">{selected.it.company}</h2>
              <p className="mt-0.5 break-words text-sm text-muted-foreground">{selected.it.contact}</p>
            </div>
            <Button variant="ghost" size="sm" aria-label="Close the draft" onClick={() => setSelectedKey(null)}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant={STATE[selected.it.state].variant}>{STATE[selected.it.state].label}</Badge>
            <Badge variant="muted">{stepLabel(selected.it.step)}</Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {selected.day.label}, {timeLabels[itemKey(selected.it)] ?? window}
          </p>
          {selected.it.body ? (
            <>
              <p className="mt-4 text-sm text-muted-foreground">Subject</p>
              <p className="break-words font-semibold">{selected.it.subject}</p>
              <p className="mt-4 text-sm text-muted-foreground">Email</p>
              <p className="mt-1 max-h-[50dvh] overflow-y-auto whitespace-pre-wrap break-words text-[15px] leading-relaxed">{selected.it.body}</p>
              <p className="mt-4 text-sm text-muted-foreground">The booking link, signature and unsubscribe line are added when it is sent.</p>
            </>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">This follow-up is not written yet. It is drafted the morning it is due, using the same rules as the first email.</p>
          )}
        </aside>
      )}
    </div>
  );
}
