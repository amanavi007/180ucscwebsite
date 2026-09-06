"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { parseLocalDate } from "@/lib/date";

export function DateSelect({
  quarterId,
  dates,
  selectedDate,
  today,
}: {
  quarterId: string;
  dates: string[];
  selectedDate: string;
  today: string;
}) {
  const router = useRouter();
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [selectedDate]);

  return (
    <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1">
      {dates.map((d) => {
        const selected = d === selectedDate;
        const isToday = d === today;
        const parsed = parseLocalDate(d);
        return (
          <button
            key={d}
            ref={selected ? selectedRef : undefined}
            type="button"
            onClick={() => router.push(`/portal/admin/rooms?quarter=${quarterId}&date=${d}`)}
            className={cn(
              "flex shrink-0 flex-col items-center gap-0 rounded-lg border px-2.5 py-1 leading-tight transition-colors",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : isToday
                  ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
                  : "border-border bg-background hover:bg-muted",
            )}
          >
            <span
              className={cn(
                "text-[10px] font-medium uppercase",
                selected ? "text-primary-foreground/80" : "text-muted-foreground",
              )}
            >
              {format(parsed, "EEE")}
            </span>
            <span className="text-sm font-semibold">{format(parsed, "MMM d")}</span>
            {isToday && (
              <span
                className={cn(
                  "text-[9px] font-medium",
                  selected ? "text-primary-foreground/80" : "text-primary",
                )}
              >
                Today
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
