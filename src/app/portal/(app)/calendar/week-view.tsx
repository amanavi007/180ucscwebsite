"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/data/calendar";
import { layoutDay, parseEventTime, type ParsedTime } from "@/lib/calendar-layout";

const HOUR_PX = 56;

function hourLabel(h: number) {
  if (h === 0 || h === 24) return "12 am";
  if (h === 12) return "12 pm";
  return h < 12 ? `${h} am` : `${h - 12} pm`;
}

/**
 * One or seven days as columns, hours down the side. Items with a clock time sit on the grid at that time;
 * everything else (meeting days, deadlines) sits in the all-day strip above it. `renderEvent` draws the content
 * of one item (a button that opens its details), so this component stays about layout only.
 */
export function TimeGrid({
  days,
  today,
  eventsByDate,
  chipClass,
  renderEvent,
  onPickDay,
}: {
  days: Date[];
  today: string;
  eventsByDate: Map<string, CalendarEvent[]>;
  chipClass: (type: CalendarEvent["type"]) => string;
  renderEvent: (event: CalendarEvent, variant: "block" | "strip") => React.ReactNode;
  onPickDay: (dateStr: string) => void;
}) {
  const columns = useMemo(
    () =>
      days.map((d) => {
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const all = eventsByDate.get(dateStr) ?? [];
        const timed: { item: CalendarEvent; time: ParsedTime }[] = [];
        const allDay: CalendarEvent[] = [];
        for (const e of all) {
          const time = parseEventTime(e.time);
          if (time) timed.push({ item: e, time });
          else allDay.push(e);
        }
        return { d, dateStr, allDay, placed: layoutDay(timed) };
      }),
    [days, eventsByDate],
  );

  // Show at least 8 am to 9 pm, and stretch to fit anything earlier or later.
  const placedAll = columns.flatMap((c) => c.placed);
  const startHour = Math.min(8, ...placedAll.map((p) => Math.floor(p.start / 60)));
  const endHour = Math.max(21, ...placedAll.map((p) => Math.ceil(p.end / 60)));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const gridTemplate = `3.5rem repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="flex flex-col overflow-hidden rounded-[22px] border bg-card xl:min-h-0 xl:flex-1">
      <div className="grid border-b" style={{ gridTemplateColumns: gridTemplate }}>
        <span />
        {columns.map(({ d, dateStr }) => {
          const isToday = dateStr === today;
          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => onPickDay(dateStr)}
              className="py-2.5 text-center outline-none hover:bg-muted/40 focus-visible:bg-muted/60"
              aria-label={`${d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}, add something`}
            >
              <span className="block text-xs font-bold tracking-wider text-muted-foreground uppercase">
                {d.toLocaleDateString("en-US", { weekday: "short" })}
              </span>
              <span
                className={cn(
                  "mt-0.5 inline-block rounded-full px-2.5 font-heading text-2xl leading-tight font-extrabold",
                  isToday && "bg-primary text-primary-foreground",
                )}
              >
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {columns.some((c) => c.allDay.length > 0) && (
        <div className="grid border-b bg-muted/30" style={{ gridTemplateColumns: gridTemplate }}>
          <span className="px-2 py-2 text-right text-xs font-semibold text-muted-foreground">All day</span>
          {columns.map(({ dateStr, allDay }) => (
            <div key={dateStr} className="min-w-0 space-y-1 border-l p-1.5">
              {allDay.map((e) => (
                <div key={e.id} className={cn("rounded-lg", chipClass(e.type))}>
                  {renderEvent(e, "strip")}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="max-h-[34rem] overflow-y-auto xl:max-h-none xl:min-h-0 xl:flex-1">
        <div className="relative grid" style={{ gridTemplateColumns: gridTemplate }}>
          <div>
            {hours.map((h) => (
              <div key={h} className="pr-2 text-right text-xs font-semibold text-muted-foreground" style={{ height: HOUR_PX }}>
                <span className="relative -top-2">{hours[0] === h ? "" : hourLabel(h)}</span>
              </div>
            ))}
          </div>
          {columns.map(({ dateStr, placed }) => (
            <div key={dateStr} className="relative border-l">
              {hours.map((h) => (
                <div key={h} className="border-t border-border/60" style={{ height: HOUR_PX }} />
              ))}
              {placed.map((p) => {
                const top = ((p.start - startHour * 60) / 60) * HOUR_PX;
                const height = Math.max(26, ((p.end - p.start) / 60) * HOUR_PX - 2);
                return (
                  <div
                    key={p.item.id}
                    className={cn("absolute overflow-hidden rounded-xl", chipClass(p.item.type))}
                    style={{
                      top,
                      height,
                      left: `calc(${(p.column / p.columns) * 100}% + 3px)`,
                      width: `calc(${100 / p.columns}% - 6px)`,
                    }}
                  >
                    {renderEvent(p.item, "block")}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
