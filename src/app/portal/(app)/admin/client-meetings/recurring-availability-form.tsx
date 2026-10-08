"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Plus, X } from "lucide-react";
import { addRecurringClientMeetingAvailabilityAction } from "@/actions/client-meeting";
import { MAX_RECURRING_DAYS, expandRecurringAvailability } from "@/lib/recurring-availability";
import { toDateString } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

interface BlockDraft {
  id: number;
  startTime: string;
  endTime: string;
}

interface DayDraft {
  weekday: number; // 0 = Sunday ... 6 = Saturday
  label: string;
  enabled: boolean;
  blocks: BlockDraft[];
}

// Monday first, because that's how the week reads for a school schedule.
const WEEK: { weekday: number; label: string }[] = [
  { weekday: 1, label: "Monday" },
  { weekday: 2, label: "Tuesday" },
  { weekday: 3, label: "Wednesday" },
  { weekday: 4, label: "Thursday" },
  { weekday: 5, label: "Friday" },
  { weekday: 6, label: "Saturday" },
  { weekday: 0, label: "Sunday" },
];

function initialDays(): DayDraft[] {
  return WEEK.map(({ weekday, label }, index) => ({
    weekday,
    label,
    enabled: index < 5, // Mon-Fri on by default
    blocks: [{ id: index * 100 + 1, startTime: "", endTime: "" }],
  }));
}

function plusDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function RecurringAvailabilityForm() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [startDate, setStartDate] = useState(() => toDateString(new Date()));
  const [endDate, setEndDate] = useState(() => toDateString(plusDays(new Date(), 28)));
  const [days, setDays] = useState<DayDraft[]>(initialDays);
  const [nextBlockId, setNextBlockId] = useState(1000);

  function patchDay(weekday: number, patch: Partial<DayDraft>) {
    setDays((current) => current.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));
  }

  function patchBlock(weekday: number, blockId: number, patch: Partial<BlockDraft>) {
    setDays((current) =>
      current.map((d) =>
        d.weekday === weekday ? { ...d, blocks: d.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)) } : d,
      ),
    );
  }

  function addBlock(weekday: number) {
    const id = nextBlockId;
    setNextBlockId((n) => n + 1);
    setDays((current) =>
      current.map((d) => (d.weekday === weekday ? { ...d, blocks: [...d.blocks, { id, startTime: "", endTime: "" }] } : d)),
    );
  }

  function removeBlock(weekday: number, blockId: number) {
    setDays((current) =>
      current.map((d) =>
        d.weekday === weekday && d.blocks.length > 1 ? { ...d, blocks: d.blocks.filter((b) => b.id !== blockId) } : d,
      ),
    );
  }

  /** Copies the first enabled day's times onto every other enabled day. */
  function copyFirstToAll() {
    const source = days.find((d) => d.enabled);
    if (!source) return;
    let id = nextBlockId;
    setDays((current) =>
      current.map((d) =>
        d.enabled && d.weekday !== source.weekday
          ? { ...d, blocks: source.blocks.map((b) => ({ id: id++, startTime: b.startTime, endTime: b.endTime })) }
          : d,
      ),
    );
    setNextBlockId(id);
  }

  const schedules = useMemo(
    () =>
      days
        .filter((d) => d.enabled)
        .map((d) => ({ weekday: d.weekday, blocks: d.blocks.map(({ startTime, endTime }) => ({ startTime, endTime })) })),
    [days],
  );
  const everyBlockFilled = schedules.every((s) => s.blocks.every((b) => b.startTime && b.endTime));
  const preview = useMemo(
    () => (everyBlockFilled ? expandRecurringAvailability({ startDate, endDate, schedules }) : null),
    [everyBlockFilled, startDate, endDate, schedules],
  );

  function handleAdd() {
    startTransition(async () => {
      const result = await addRecurringClientMeetingAvailabilityAction({ startDate, endDate, schedules });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const skipped = result.skippedCount ? ` ${result.skippedCount} already-added or past block(s) were skipped.` : "";
      toast.success(
        `Added ${result.addedCount ?? 0} availability block(s).${skipped} ${result.createdCount ?? 0} new slot(s) generated and published.`,
      );
      if (result.generateError) toast.error(`Couldn't generate slots: ${result.generateError}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium">1. Pick the date range</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            type="date"
            aria-label="Start date"
            className="w-44"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label="End date"
            className="w-44"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Up to {MAX_RECURRING_DAYS} days at a time. Both dates are included.</p>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">2. Set your times for each weekday</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Untick the days you&apos;re never free. Client meetings are 30 minutes and start on the hour or half hour, so give
              blocks of at least 30 minutes.
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={copyFirstToAll} disabled={isPending}>
            <Copy className="size-4" />
            Copy first day&apos;s times to all
          </Button>
        </div>

        <div className="mt-3 divide-y divide-border rounded-2xl border border-border">
          {days.map((day) => (
            <div key={day.weekday} className="flex flex-wrap items-start gap-x-4 gap-y-2 p-3">
              <label className="flex w-36 items-center gap-2 pt-1.5 text-sm font-medium">
                <Checkbox
                  checked={day.enabled}
                  onCheckedChange={(checked) => patchDay(day.weekday, { enabled: checked === true })}
                  aria-label={`${day.label} available`}
                />
                {day.label}
              </label>
              {day.enabled ? (
                <div className="space-y-2">
                  {day.blocks.map((block) => (
                    <div key={block.id} className="flex flex-wrap items-center gap-2">
                      <Input
                        type="time"
                        aria-label={`${day.label} start time`}
                        className="w-36"
                        value={block.startTime}
                        onChange={(e) => patchBlock(day.weekday, block.id, { startTime: e.target.value })}
                      />
                      <span className="text-sm text-muted-foreground">to</span>
                      <Input
                        type="time"
                        aria-label={`${day.label} end time`}
                        className="w-36"
                        value={block.endTime}
                        onChange={(e) => patchBlock(day.weekday, block.id, { endTime: e.target.value })}
                      />
                      {day.blocks.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${day.label} time block`}
                          onClick={() => removeBlock(day.weekday, block.id)}
                        >
                          <X className="size-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => addBlock(day.weekday)}>
                    <Plus className="size-4" />
                    Add another block
                  </Button>
                </div>
              ) : (
                <p className="pt-1.5 text-sm text-muted-foreground">Not available</p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={handleAdd} disabled={isPending || (preview !== null && "error" in preview)}>
          Add recurring availability
        </Button>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {preview === null
            ? "Fill in the times for each day you're free."
            : "error" in preview
              ? preview.error
              : `Adds ${preview.rows.length} block${preview.rows.length === 1 ? "" : "s"} across ${preview.dayCount} day${preview.dayCount === 1 ? "" : "s"}.`}
        </p>
      </div>
    </div>
  );
}
