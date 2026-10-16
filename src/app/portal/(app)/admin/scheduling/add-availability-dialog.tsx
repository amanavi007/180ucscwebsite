"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { addAvailabilityEntryAction } from "@/actions/coffee-chat";
import { addInterviewAvailabilityAction } from "@/actions/interview";
import { addClientMeetingAvailabilityAction } from "@/actions/client-meeting";
import { expandAvailabilityEntry } from "@/lib/coffee-chat";
import { expandRecurringAvailability } from "@/lib/recurring-availability";
import { toDateString } from "@/lib/date";
import { availabilityKey, groupByBlocks } from "@/lib/availability-groups";
import { FilterChip } from "@/components/filter-chip";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { describeInterviewWindow, isInInterviewWindow, type InterviewWindow } from "@/lib/interview";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AvailabilityKind } from "./availability-panel";

const KINDS: { kind: AvailabilityKind; label: string }[] = [
  { kind: "coffee", label: "Coffee chats" },
  { kind: "interview", label: "Interviews" },
  { kind: "client", label: "Client calls" },
];

// Monday first, like a school week. Values match Date.getDay().
const WEEKDAYS = [
  { day: 1, label: "Mon" },
  { day: 2, label: "Tue" },
  { day: 3, label: "Wed" },
  { day: 4, label: "Thu" },
  { day: 5, label: "Fri" },
  { day: 6, label: "Sat" },
  { day: 0, label: "Sun" },
];

interface BlockDraft {
  id: number;
  startTime: string;
  endTime: string;
}

type ExistingKeys = Record<AvailabilityKind, Set<string>>;

/**
 * One form for all three kinds of slot. Pick which kinds it applies to, then either specific days or a weekly pattern
 * over a date range, then the times. Slots are made and published by the existing per-kind actions.
 */
export function AddAvailabilityDialog({
  open,
  onOpenChange,
  today,
  onClientPanel,
  existing,
  interviewWindow,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
  /** Only the client call panel can add client call availability. */
  onClientPanel: boolean;
  /** What you already have, so repeating a weekly schedule doesn't double it up. */
  existing: ExistingKeys;
  /** Interviews only run inside this date range; other kinds ignore it. */
  interviewWindow: InterviewWindow;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [kinds, setKinds] = useState<AvailabilityKind[]>(onClientPanel ? ["coffee", "interview", "client"] : ["coffee", "interview"]);
  const [mode, setMode] = useState<"days" | "weekly">("weekly");
  const [days, setDays] = useState<Date[]>([]);
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(() => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() + 27);
    return toDateString(d);
  });
  const [blocks, setBlocks] = useState<BlockDraft[]>([{ id: 1, startTime: "", endTime: "" }]);
  const [nextId, setNextId] = useState(2);
  const [todayDate] = useState(() => {
    const d = new Date(`${today}T00:00:00`);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const updateBlock = (id: number, patch: Partial<BlockDraft>) =>
    setBlocks((current) => current.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  function submit() {
    if (kinds.length === 0) {
      toast.error("Pick at least one kind of slot.");
      return;
    }
    const cleanBlocks = blocks.map(({ startTime, endTime }) => ({ startTime, endTime }));
    const expanded =
      mode === "days"
        ? expandAvailabilityEntry(days.map(toDateString), cleanBlocks)
        : expandRecurringAvailability({
            startDate,
            endDate,
            schedules: weekdays.map((weekday) => ({ weekday, blocks: cleanBlocks })),
          });
    if ("error" in expanded) {
      toast.error(expanded.error);
      return;
    }
    const upcoming = expanded.rows.filter((r) => r.date >= today);
    if (upcoming.length === 0) {
      toast.error("Every day you picked has already passed.");
      return;
    }

    startTransition(async () => {
      let added = 0;
      let made = 0;
      for (const kind of kinds) {
        const fresh = upcoming.filter(
          (r) => !existing[kind].has(availabilityKey(r)) && (kind !== "interview" || isInInterviewWindow(r.date, interviewWindow)),
        );
        for (const group of groupByBlocks(fresh)) {
          const result =
            kind === "coffee"
              ? await addAvailabilityEntryAction(group.dates, group.blocks)
              : kind === "interview"
                ? await addInterviewAvailabilityAction(group.dates, group.blocks)
                : await addClientMeetingAvailabilityAction(group.dates, group.blocks);
          if (result.error) {
            toast.error(`${KINDS.find((k) => k.kind === kind)?.label}: ${result.error}`);
            router.refresh();
            return;
          }
          added += result.addedCount ?? 0;
          made += result.createdCount ?? 0;
        }
      }
      toast.success(
        added === 0
          ? "You already had all of those times."
          : `Added ${added} block${added === 1 ? "" : "s"} and made ${made} slot${made === 1 ? "" : "s"}.`,
      );
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add your availability</DialogTitle>
          <DialogDescription>
            Say when you&apos;re free once. Slots are made and published for every kind you tick.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-sm font-bold">1. What is it for?</h3>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {KINDS.map(({ kind, label }) => {
              const disabled = kind === "client" && !onClientPanel;
              return (
                <label key={kind} className={`flex items-center gap-2 text-sm font-semibold ${disabled ? "opacity-50" : ""}`}>
                  <Checkbox
                    checked={kinds.includes(kind)}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      setKinds((current) => (checked === true ? [...current, kind] : current.filter((k) => k !== kind)))
                    }
                  />
                  {label}
                  {disabled && <span className="text-xs font-normal text-muted-foreground">(panel members only)</span>}
                </label>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-bold">2. Which days?</h3>
          {kinds.includes("interview") && (interviewWindow.windowStart || interviewWindow.windowEnd) && (
            <p className="text-sm text-muted-foreground">
              Interviews only run {describeInterviewWindow(interviewWindow)}. Days outside that are skipped for interviews.
            </p>
          )}
          <Tabs value={mode} onValueChange={(v) => v && setMode(v as typeof mode)}>
            <TabsList>
              <TabsTrigger value="weekly">Every week</TabsTrigger>
              <TabsTrigger value="days">Specific days</TabsTrigger>
            </TabsList>
          </Tabs>

          {mode === "weekly" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days of the week">
                {WEEKDAYS.map(({ day, label }) => (
                  <FilterChip
                    key={day}
                    selected={weekdays.includes(day)}
                    onClick={() => setWeekdays((cur) => (cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day]))}
                  >
                    {label}
                  </FilterChip>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-2 font-semibold">
                  From
                  <Input type="date" className="w-40" value={startDate} min={today} onChange={(e) => setStartDate(e.target.value)} />
                </label>
                <label className="flex items-center gap-2 font-semibold">
                  to
                  <Input type="date" className="w-40" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
                </label>
                <span className="text-muted-foreground">Up to 120 days at a time.</span>
              </div>
            </div>
          ) : (
            <div>
              <Calendar
                mode="multiple"
                selected={days}
                onSelect={(selected) => setDays(selected ?? [])}
                disabled={{ before: todayDate }}
                showOutsideDays={false}
                className="rounded-2xl border border-border [--cell-size:--spacing(10)]"
              />
              {days.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {days.length} day{days.length === 1 ? "" : "s"} selected
                </p>
              )}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-bold">3. What times?</h3>
          <div className="space-y-2">
            {blocks.map((block) => (
              <div key={block.id} className="flex flex-wrap items-center gap-2">
                <Input type="time" aria-label="Start time" className="w-36" value={block.startTime} onChange={(e) => updateBlock(block.id, { startTime: e.target.value })} />
                <span className="text-sm text-muted-foreground">to</span>
                <Input type="time" aria-label="End time" className="w-36" value={block.endTime} onChange={(e) => updateBlock(block.id, { endTime: e.target.value })} />
                {blocks.length > 1 && (
                  <Button variant="ghost" size="icon-sm" aria-label="Remove time block" onClick={() => setBlocks((cur) => cur.filter((b) => b.id !== block.id))}>
                    <X />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setBlocks((cur) => [...cur, { id: nextId, startTime: "", endTime: "" }]);
              setNextId((n) => n + 1);
            }}
          >
            <Plus />
            Add another time block
          </Button>
        </section>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button size="lg" onClick={submit} disabled={isPending}>
            Add availability
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
