"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, RefreshCw, Trash2 } from "lucide-react";
import {
  deleteSlotAction,
  generateSlotsAction,
  getExecOptionsForSlotAction,
  publishAllSlotsAction,
  publishSlotAction,
  swapSlotExecAction,
} from "@/actions/coffee-chat";
import { formatTime12h } from "@/lib/coffee-chat";
import { formatDateLong, getOrgTodayDateString } from "@/lib/date";
import type { ExecOptions, SlotRow } from "@/lib/data/coffee-chat";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel, SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function SwapControl({ slot, position, router }: { slot: SlotRow; position: "exec_id_1" | "exec_id_2"; router: ReturnType<typeof useRouter> }) {
  const [isPending, startTransition] = useTransition();
  const [options, setOptions] = useState<ExecOptions | null>(null);

  async function loadOptions() {
    if (options) return;
    const result = await getExecOptionsForSlotAction(slot.date, slot.startTime, slot.endTime);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setOptions(result.options);
  }

  function handleSwap(newExecId: string | null) {
    if (!newExecId) return;
    startTransition(async () => {
      const result = await swapSlotExecAction(slot.id, position, newExecId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Swapped.");
      router.refresh();
    });
  }

  const currentName = position === "exec_id_1" ? slot.exec1Name : slot.exec2Name;

  return (
    <Select onOpenChange={(open) => open && loadOptions()} onValueChange={handleSwap} disabled={isPending}>
      <SelectTrigger className="h-8 w-full min-w-32 text-xs">
        <SelectValue placeholder={currentName ?? "Unassigned"}>{currentName ?? "Unassigned"}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options && options.available.length > 0 && (
          <SelectGroup>
            <SelectLabel>People who are available</SelectLabel>
            {options.available.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {options && options.others.length > 0 && (
          <SelectGroup>
            <SelectLabel>All execs</SelectLabel>
            {options.others.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}

type Filter = "all" | "booked" | "open" | "hidden";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "booked", label: "Booked" },
  { value: "open", label: "Open" },
  { value: "hidden", label: "Not published" },
];

function matches(slot: SlotRow, filter: Filter): boolean {
  if (filter === "booked") return slot.bookingStatus === "booked";
  if (filter === "open") return slot.bookingStatus === "open";
  if (filter === "hidden") return !slot.published;
  return true;
}

export function SlotsView({ slots, currentExecId }: { slots: SlotRow[]; currentExecId: string }) {
  const [isPending, startTransition] = useTransition();
  const [mineOnly, setMineOnly] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [showPast, setShowPast] = useState(false);
  const router = useRouter();

  function run(action: () => Promise<{ error?: string }>, successMessage?: string) {
    startTransition(async () => {
      const result = await action();
      if (result.error) toast.error(result.error);
      else if (successMessage) toast.success(successMessage);
      router.refresh();
    });
  }

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateSlotsAction();
      if (result.error) toast.error(result.error);
      else toast.success(`Generated ${result.createdCount ?? 0} new slot(s).`);
      router.refresh();
    });
  }

  function handlePublishAll() {
    startTransition(async () => {
      const result = await publishAllSlotsAction();
      if (result.error) toast.error(result.error);
      else toast.success(`Published ${result.publishedCount ?? 0} slot(s).`);
      router.refresh();
    });
  }

  const today = getOrgTodayDateString();
  const stats = useMemo(
    () => ({
      total: slots.length,
      booked: slots.filter((s) => s.bookingStatus === "booked").length,
      hidden: slots.filter((s) => !s.published).length,
    }),
    [slots],
  );

  const days = useMemo(() => {
    const scoped = slots.filter(
      (s) =>
        (showPast || s.date >= today) &&
        (!mineOnly || s.execId1 === currentExecId || s.execId2 === currentExecId) &&
        matches(s, filter),
    );
    const byDate = new Map<string, SlotRow[]>();
    for (const slot of scoped) {
      if (!byDate.has(slot.date)) byDate.set(slot.date, []);
      byDate.get(slot.date)!.push(slot);
    }
    return [...byDate.entries()];
  }, [slots, showPast, today, mineOnly, currentExecId, filter]);

  return (
    <div className="mt-4 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{stats.total}</span> slots ·{" "}
          <span className="font-medium text-foreground">{stats.booked}</span> booked ·{" "}
          <span className={cn("font-medium", stats.hidden > 0 ? "text-amber-600" : "text-foreground")}>{stats.hidden}</span>{" "}
          not published
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handlePublishAll} disabled={isPending || stats.hidden === 0}>
            Publish all
          </Button>
          <Button onClick={handleGenerate} disabled={isPending} className="gap-1.5">
            <RefreshCw className="size-4" />
            Generate slots
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              filter === f.value ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
            )}
          >
            {f.label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-border" />
        <button
          type="button"
          onClick={() => setMineOnly((v) => !v)}
          className={cn(
            "rounded-full border px-3 py-1 text-sm transition-colors",
            mineOnly ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
          )}
        >
          Mine
        </button>
        <button
          type="button"
          onClick={() => setShowPast((v) => !v)}
          className={cn(
            "rounded-full border px-3 py-1 text-sm transition-colors",
            showPast ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
          )}
        >
          Past
        </button>
      </div>

      {days.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {slots.length === 0
            ? "No slots yet. They're created automatically when execs add availability."
            : "No slots match these filters."}
        </p>
      ) : (
        <div className="space-y-6">
          {days.map(([date, daySlots]) => (
            <section key={date}>
              <div className="mb-2 flex items-baseline gap-2">
                <h3 className="font-semibold">{formatDateLong(date)}</h3>
                <span className="text-xs text-muted-foreground">
                  {daySlots.filter((s) => s.bookingStatus === "booked").length} of {daySlots.length} booked
                </span>
              </div>
              <ul className="divide-y overflow-hidden rounded-xl border">
                {daySlots.map((slot) => {
                  const booked = slot.bookingStatus === "booked";
                  return (
                    <li
                      key={slot.id}
                      className={cn(
                        "grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 p-3 sm:grid-cols-[9rem_1fr_1fr_auto_auto]",
                        !slot.published && "bg-amber-50/60 dark:bg-amber-950/20",
                      )}
                    >
                      <div>
                        <p className="font-medium tabular-nums">{formatTime12h(slot.startTime)}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">to {formatTime12h(slot.endTime)}</p>
                      </div>
                      <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-start-2 sm:row-start-1">
                        <SwapControl slot={slot} position="exec_id_1" router={router} />
                        <SwapControl slot={slot} position="exec_id_2" router={router} />
                      </div>
                      <div className="col-start-2 row-start-1 flex justify-end sm:col-start-4">
                        {booked ? (
                          <Badge className="max-w-40 truncate">{slot.applicantName}</Badge>
                        ) : (
                          <Badge variant="secondary">Open</Badge>
                        )}
                      </div>
                      <div className="col-span-2 flex items-center justify-end gap-1 sm:col-span-1 sm:col-start-5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn("gap-1.5", !slot.published && "text-amber-700 dark:text-amber-400")}
                          disabled={isPending}
                          onClick={() => run(() => publishSlotAction(slot.id, !slot.published))}
                          title={slot.published ? "Visible to applicants. Click to hide." : "Hidden from applicants. Click to publish."}
                        >
                          {slot.published ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                          {slot.published ? "Live" : "Hidden"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Delete slot"
                          onClick={() => run(() => deleteSlotAction(slot.id))}
                          disabled={isPending || booked}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
