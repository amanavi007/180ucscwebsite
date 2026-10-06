"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownUp, CalendarPlus, CircleHelp, Eye, EyeOff, MoreHorizontal, Plus, RefreshCw, Trash2, X, XCircle } from "lucide-react";
import {
  addExecToInterviewSlotAction,
  cancelInterviewBookingAsAdminAction,
  deleteInterviewSlotAction,
  generateInterviewSlotsAction,
  getInterviewExecOptionsAction,
  publishAllInterviewSlotsAction,
  publishInterviewSlotAction,
  removeExecFromInterviewSlotAction,
  swapInterviewExecAction,
} from "@/actions/interview";
import { formatTime12h } from "@/lib/coffee-chat";
import { canAddToPanel, canRemoveFromPanel } from "@/lib/interview";
import { formatDateLong, getOrgTodayDateString } from "@/lib/date";
import type { InterviewBookingRow, InterviewExecOptions, InterviewSlotRow } from "@/lib/data/interview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarHelp, Pill } from "../coffee-chats/schedule-view";

type Router = ReturnType<typeof useRouter>;

function ExecPicker({
  slot,
  placeholder,
  onPick,
  currentName,
  router,
}: {
  slot: InterviewSlotRow;
  placeholder: string;
  currentName?: string;
  onPick: (execId: string) => Promise<{ error?: string }>;
  router: Router;
}) {
  const [isPending, startTransition] = useTransition();
  const [options, setOptions] = useState<InterviewExecOptions | null>(null);

  async function loadOptions() {
    if (options) return;
    const result = await getInterviewExecOptionsAction(slot.date, slot.startTime, slot.endTime);
    if (result.error || !result.options) {
      toast.error(result.error ?? "Couldn't load execs.");
      return;
    }
    setOptions(result.options);
  }

  function handlePick(execId: string | null) {
    if (!execId) return;
    startTransition(async () => {
      const result = await onPick(execId);
      if (result.error) toast.error(result.error);
      else toast.success("Updated.");
      router.refresh();
    });
  }

  const onSlot = new Set(slot.execs.map((e) => e.id));
  const available = (options?.available ?? []).filter((o) => !onSlot.has(o.id));
  const others = (options?.others ?? []).filter((o) => !onSlot.has(o.id));

  return (
    <Select onOpenChange={(open) => open && loadOptions()} onValueChange={handlePick} disabled={isPending}>
      <SelectTrigger className="h-8 w-full min-w-32 text-xs">
        <SelectValue placeholder={placeholder}>{currentName ?? placeholder}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {available.length > 0 && (
          <SelectGroup>
            <SelectLabel>People who are available</SelectLabel>
            {available.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {others.length > 0 && (
          <SelectGroup>
            <SelectLabel>All execs</SelectLabel>
            {others.map((o) => (
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

/** The 2-3 execs on a slot: each can be swapped or removed (down to 2), and a third can be added. */
function PanelControl({ slot, router }: { slot: InterviewSlotRow; router: Router }) {
  const [isPending, startTransition] = useTransition();

  function remove(execId: string) {
    startTransition(async () => {
      const result = await removeExecFromInterviewSlotAction(slot.id, execId);
      if (result.error) toast.error(result.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-1.5">
      {slot.execs.map((exec) => (
        <div key={exec.id} className="flex items-center gap-1">
          <ExecPicker
            slot={slot}
            placeholder={exec.name}
            currentName={exec.name}
            onPick={(newId) => swapInterviewExecAction(slot.id, exec.id, newId)}
            router={router}
          />
          {canRemoveFromPanel(slot.execs.length) && (
            <Button variant="ghost" size="icon-sm" aria-label={`Remove ${exec.name} from panel`} disabled={isPending} onClick={() => remove(exec.id)}>
              <X className="size-4" />
            </Button>
          )}
        </div>
      ))}
      {canAddToPanel(slot.execs.length) && (
        <div className="flex items-center gap-1">
          <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <ExecPicker slot={slot} placeholder="Add a third exec" onPick={(id) => addExecToInterviewSlotAction(slot.id, id)} router={router} />
        </div>
      )}
    </div>
  );
}

type Filter = "all" | "booked" | "open" | "hidden";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "booked", label: "Booked" },
  { value: "open", label: "Open" },
  { value: "hidden", label: "Not published" },
];

function matches(slot: InterviewSlotRow, filter: Filter): boolean {
  if (filter === "booked") return slot.bookingStatus === "booked";
  if (filter === "open") return slot.bookingStatus === "open";
  if (filter === "hidden") return !slot.published;
  return true;
}

export function ScheduleView({
  slots,
  bookings,
  currentExecId,
  feedUrl,
}: {
  slots: InterviewSlotRow[];
  bookings: InterviewBookingRow[];
  currentExecId: string;
  feedUrl: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [mineOnly, setMineOnly] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [showPast, setShowPast] = useState(false);
  const [newestFirst, setNewestFirst] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const router = useRouter();

  const isMine = (execIds: string[]) => execIds.includes(currentExecId);

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
      const result = await generateInterviewSlotsAction();
      if (result.error) toast.error(result.error);
      else toast.success(`Generated ${result.createdCount ?? 0} new slot(s) and published them.`);
      router.refresh();
    });
  }

  function handlePublishAll() {
    startTransition(async () => {
      const result = await publishAllInterviewSlotsAction();
      if (result.error) toast.error(result.error);
      else toast.success(`Published ${result.publishedCount ?? 0} slot(s).`);
      router.refresh();
    });
  }

  function handleCancel(slot: InterviewSlotRow) {
    if (!slot.bookingId) return;
    if (!window.confirm(`Cancel ${slot.applicantName}'s interview? The applicant and the panel will be emailed.`)) return;
    run(() => cancelInterviewBookingAsAdminAction(slot.bookingId!), "Booking cancelled.");
  }

  async function handleCopyFeed() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      toast.success('Link copied. Click "How to add" to finish setting it up.');
    } catch {
      toast.error("Couldn't copy the link.");
    }
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
      (s) => (showPast || s.date >= today) && (!mineOnly || isMine(s.execs.map((e) => e.id))) && matches(s, filter),
    );
    const byDate = new Map<string, InterviewSlotRow[]>();
    for (const slot of scoped) {
      if (!byDate.has(slot.date)) byDate.set(slot.date, []);
      byDate.get(slot.date)!.push(slot);
    }
    const entries = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
    return newestFirst ? entries.reverse().map(([d, list]) => [d, [...list].reverse()] as const) : entries;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, showPast, today, mineOnly, currentExecId, filter, newestFirst]);

  const cancelled = useMemo(
    () =>
      bookings
        .filter((b) => b.status === "cancelled" && (!mineOnly || isMine(b.execIds)))
        .sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings, mineOnly, currentExecId],
  );

  return (
    <div className="mt-4 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{stats.total}</span> slots ·{" "}
          <span className="font-medium text-foreground">{stats.booked}</span> booked ·{" "}
          <span className={cn("font-medium", stats.hidden > 0 ? "text-amber-600" : "text-foreground")}>{stats.hidden}</span> not published
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-1.5" onClick={handleCopyFeed}>
            <CalendarPlus className="size-4" />
            Copy my calendar link
          </Button>
          <Button variant="ghost" className="gap-1.5" onClick={() => setHelpOpen(true)}>
            <CircleHelp className="size-4" />
            How to add
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" disabled={isPending} />}>
              Actions
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={handleGenerate}>
                <RefreshCw className="size-4" />
                Generate slots
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePublishAll} disabled={stats.hidden === 0}>
                <Eye className="size-4" />
                Publish all hidden
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Pill key={f.value} active={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.label}
          </Pill>
        ))}
        <span className="mx-1 h-5 w-px bg-border" />
        <Pill active={mineOnly} onClick={() => setMineOnly((v) => !v)}>
          Mine
        </Pill>
        <Pill active={showPast} onClick={() => setShowPast((v) => !v)}>
          Past
        </Pill>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setNewestFirst((v) => !v)}>
          <ArrowDownUp className="size-4" />
          {newestFirst ? "Latest first" : "Earliest first"}
        </Button>
      </div>

      {days.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {slots.length === 0
            ? 'No slots yet. Add availability, then use Actions → "Generate slots".'
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
                {daySlots.map((slot) => (
                  <li
                    key={slot.id}
                    className={cn(
                      "grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-2 p-3 sm:grid-cols-[7rem_minmax(0,16rem)_1fr_auto]",
                      !slot.published && "bg-amber-50/60 dark:bg-amber-950/20",
                    )}
                  >
                    <div>
                      <p className="font-medium tabular-nums">{formatTime12h(slot.startTime)}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">to {formatTime12h(slot.endTime)}</p>
                    </div>

                    <div className="col-span-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                      <PanelControl slot={slot} router={router} />
                    </div>

                    <div className="col-start-2 row-start-1 min-w-0 text-right sm:col-start-3 sm:text-left">
                      {slot.bookingStatus === "booked" ? (
                        <>
                          <p className="truncate text-sm font-medium">{slot.applicantName}</p>
                          <p className="truncate text-xs text-muted-foreground">{slot.applicantEmail}</p>
                        </>
                      ) : (
                        <Badge variant="secondary">Open</Badge>
                      )}
                      {!slot.published && (
                        <Badge variant="outline" className="mt-1 border-amber-500 text-amber-700 dark:text-amber-400">
                          Not published
                        </Badge>
                      )}
                    </div>

                    <div className="col-span-2 flex justify-end sm:col-span-1 sm:col-start-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Slot actions" disabled={isPending} />}>
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => run(() => publishInterviewSlotAction(slot.id, !slot.published))}>
                            {slot.published ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                            {slot.published ? "Hide from applicants" : "Publish to applicants"}
                          </DropdownMenuItem>
                          {slot.bookingStatus === "booked" ? (
                            <DropdownMenuItem variant="destructive" onClick={() => handleCancel(slot)}>
                              <XCircle className="size-4" />
                              Cancel booking
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem variant="destructive" onClick={() => run(() => deleteInterviewSlotAction(slot.id))}>
                              <Trash2 className="size-4" />
                              Delete slot
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {cancelled.length > 0 && (
        <details className="rounded-xl border p-3">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">Cancelled ({cancelled.length})</summary>
          <ul className="mt-3 divide-y text-sm">
            {cancelled.map((b) => (
              <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                <span className="font-medium">
                  {b.applicantName} <span className="font-normal text-muted-foreground">· {b.applicantEmail}</span>
                </span>
                <span className="text-muted-foreground">
                  {formatDateLong(b.date)} · {formatTime12h(b.startTime)} · {b.execNames.join(" & ")}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <CalendarHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
