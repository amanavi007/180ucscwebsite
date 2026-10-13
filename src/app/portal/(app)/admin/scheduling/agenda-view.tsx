"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/filter-chip";
import { formatTimeRange } from "@/lib/coffee-chat";
import { AGENDA_KIND_LABEL, groupByDate, type AgendaItem, type AgendaKind, type AgendaState } from "@/lib/scheduling-agenda";

const STATE_CHIP: Record<AgendaState, { label: string; variant: "ok" | "warn" | "muted" }> = {
  booked: { label: "Booked", variant: "ok" },
  open: { label: "Open", variant: "warn" },
  hidden: { label: "Hidden", variant: "muted" },
};

const KIND_BAR: Record<AgendaKind, string> = {
  coffee: "bg-status-warn-foreground/60",
  interview: "bg-status-ok-foreground/60",
  client: "bg-status-info-foreground/60",
};

function dayLabel(date: string, today: string) {
  const d = new Date(`${date}T12:00:00`);
  const label = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  if (date === today) return { label, tag: "Today" };
  const tomorrow = new Date(`${today}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return { label, tag: "Tomorrow" };
  return { label, tag: null };
}

/** Everything with a time on it, day by day. Filters narrow the list; "Manage" opens the page for that kind. */
export function AgendaView({ items, today }: { items: AgendaItem[]; today: string }) {
  const [kind, setKind] = useState<AgendaKind | "all">("all");
  const [openOnly, setOpenOnly] = useState(false);

  const counts = useMemo(() => {
    const c: Record<AgendaKind, number> = { coffee: 0, interview: 0, client: 0 };
    for (const i of items) c[i.kind] += 1;
    return c;
  }, [items]);

  const visible = items.filter((i) => (kind === "all" || i.kind === kind) && (!openOnly || i.state === "open"));
  const groups = groupByDate(visible);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter the agenda">
        <FilterChip selected={kind === "all"} onClick={() => setKind("all")} count={items.length}>
          All
        </FilterChip>
        <FilterChip selected={kind === "coffee"} onClick={() => setKind("coffee")} count={counts.coffee}>
          Coffee chats
        </FilterChip>
        <FilterChip selected={kind === "interview"} onClick={() => setKind("interview")} count={counts.interview}>
          Interviews
        </FilterChip>
        <FilterChip selected={kind === "client"} onClick={() => setKind("client")} count={counts.client}>
          Client calls
        </FilterChip>
        <span className="flex-1" />
        <FilterChip selected={openOnly} onClick={() => setOpenOnly((v) => !v)}>
          Open slots only
        </FilterChip>
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[22px] border bg-card py-16 text-center">
          <CalendarDays className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-semibold">Nothing coming up{kind !== "all" || openOnly ? " that matches" : ""}</p>
          <p className="text-sm text-muted-foreground">
            {items.length === 0 ? "Add slots so people can book them." : "Try a different filter."}
          </p>
        </div>
      ) : (
        groups.map((g) => {
          const day = dayLabel(g.date, today);
          return (
            <section key={g.date} aria-label={day.label} className="space-y-2.5">
              <div className="flex items-baseline gap-3 pt-2">
                <h2 className="text-xl">{day.label}</h2>
                {day.tag && <Badge variant="info">{day.tag}</Badge>}
              </div>
              <ul className="space-y-2.5">
                {g.items.map((item) => {
                  const chip = STATE_CHIP[item.state];
                  return (
                    <li
                      key={item.id}
                      className="grid grid-cols-[7.5rem_0.5rem_minmax(0,1fr)_auto] items-center gap-x-4 rounded-[18px] border bg-card px-5 py-3.5"
                    >
                      <span className="text-[0.9375rem] font-bold tabular-nums">{formatTimeRange(item.startTime, item.endTime)}</span>
                      <span aria-hidden className={`h-9 rounded-full ${KIND_BAR[item.kind]}`} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="truncate text-[0.9375rem] font-semibold">{item.title}</span>
                          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                            {AGENDA_KIND_LABEL[item.kind]}
                          </span>
                        </div>
                        {item.detail && <div className="truncate text-sm text-muted-foreground">{item.detail}</div>}
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={chip.variant}>{chip.label}</Badge>
                        <Button size="sm" variant="outline" nativeButton={false} render={<Link href={item.href}>Manage</Link>} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
