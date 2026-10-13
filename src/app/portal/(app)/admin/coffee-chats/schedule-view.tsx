"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownUp,
  CalendarPlus,
  CircleHelp,
  Eye,
  EyeOff,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  cancelBookingAsAdminAction,
  deleteSlotAction,
  generateSlotsAction,
  getExecOptionsForSlotAction,
  publishAllSlotsAction,
  publishSlotAction,
  swapSlotExecAction,
} from "@/actions/coffee-chat";
import { formatTime12h } from "@/lib/coffee-chat";
import { formatDateLong, getOrgTodayDateString } from "@/lib/date";
import type { BookingRow, ExecOptions, SlotRow } from "@/lib/data/coffee-chat";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function SwapControl({
  slot,
  position,
  router,
}: {
  slot: SlotRow;
  position: "exec_id_1" | "exec_id_2";
  router: ReturnType<typeof useRouter>;
}) {
  const [isPending, startTransition] = useTransition();
  const [options, setOptions] = useState<ExecOptions | null>(null);

  async function loadOptions() {
    if (options) return;
    const result = await getExecOptionsForSlotAction(slot.date, slot.startTime, slot.endTime);
    if (result.error || !result.options) {
      toast.error(result.error ?? "Couldn't load execs.");
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

export function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 rounded-full px-3.5 text-[0.8125rem] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-status-ok text-status-ok-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function CalendarHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add your coffee chats and interviews to your calendar</DialogTitle>
          <DialogDescription>
            Click <strong>Copy my calendar link</strong>, then follow the steps for your calendar. You only do this
            once: new bookings appear automatically and cancelled ones disappear. The link is personal to you, so
            don&apos;t share it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div>
            <h4 className="font-medium">Google Calendar (computer)</h4>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>
                Open <span className="font-mono">calendar.google.com</span>.
              </li>
              <li>
                Next to <strong>Other calendars</strong> in the left sidebar, click <strong>+</strong> →{" "}
                <strong>From URL</strong>.
              </li>
              <li>
                Paste the link and click <strong>Add calendar</strong>. Google refreshes it every few hours.
              </li>
            </ol>
          </div>
          <div>
            <h4 className="font-medium">Apple Calendar (Mac)</h4>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>
                In the menu bar choose <strong>File → New Calendar Subscription…</strong>
              </li>
              <li>
                Paste the link and click <strong>Subscribe</strong>.
              </li>
              <li>
                Set <strong>Auto-refresh</strong> to <strong>Every hour</strong> and click <strong>OK</strong>.
              </li>
            </ol>
          </div>
          <div>
            <h4 className="font-medium">Apple Calendar (iPhone)</h4>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>
                <strong>Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar</strong>.
              </li>
              <li>
                Paste the link, tap <strong>Next</strong>, then <strong>Save</strong>.
              </li>
            </ol>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ScheduleView({
  slots,
  bookings,
  currentExecId,
  feedUrl,
}: {
  slots: SlotRow[];
  bookings: BookingRow[];
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
  const [confirm, confirmDialog] = useConfirm();

  const isMine = (execId1: string | null, execId2: string | null) =>
    execId1 === currentExecId || execId2 === currentExecId;

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

  async function handleCancel(booking: BookingRow) {
    const ok = await confirm({
      title: `Cancel ${booking.applicantName}'s coffee chat?`,
      description: "The applicant and execs will be notified.",
      confirmLabel: "Cancel the chat",
    });
    if (!ok) return;
    run(() => cancelBookingAsAdminAction(booking.id), "Booking cancelled.");
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
  const confirmedBySlotId = useMemo(
    () => new Map(bookings.filter((b) => b.status === "confirmed").map((b) => [b.slotId, b])),
    [bookings],
  );

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
      (s) => (showPast || s.date >= today) && (!mineOnly || isMine(s.execId1, s.execId2)) && matches(s, filter),
    );
    const byDate = new Map<string, SlotRow[]>();
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
        .filter((b) => b.status === "cancelled" && (!mineOnly || isMine(b.exec1Id, b.exec2Id)))
        .sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings, mineOnly, currentExecId],
  );

  return (
    <div className="mt-4 space-y-5">
      {confirmDialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{stats.total}</span> slots ·{" "}
          <span className="font-medium text-foreground">{stats.booked}</span> booked ·{" "}
          <span className={cn("font-medium", stats.hidden > 0 ? "text-status-warn-foreground" : "text-foreground")}>
            {stats.hidden}
          </span>{" "}
          not published
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
                  const booking = confirmedBySlotId.get(slot.id);
                  return (
                    <li
                      key={slot.id}
                      className={cn(
                        "grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 p-3 sm:grid-cols-[7rem_1fr_minmax(0,14rem)_auto]",
                        !slot.published && "bg-status-warn/60",
                      )}
                    >
                      <div>
                        <p className="font-medium tabular-nums">{formatTime12h(slot.startTime)}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">to {formatTime12h(slot.endTime)}</p>
                      </div>

                      <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                        <SwapControl slot={slot} position="exec_id_1" router={router} />
                        <SwapControl slot={slot} position="exec_id_2" router={router} />
                      </div>

                      <div className="col-start-2 row-start-1 min-w-0 text-right sm:col-start-3 sm:text-left">
                        {booking ? (
                          <>
                            <p className="truncate text-sm font-medium">{booking.applicantName}</p>
                            <p className="truncate text-xs text-muted-foreground">{booking.applicantEmail}</p>
                            {booking.location && (
                              <p className="truncate text-xs text-muted-foreground">{booking.location}</p>
                            )}
                          </>
                        ) : (
                          <Badge variant="secondary">Open</Badge>
                        )}
                        {!slot.published && (
                          <Badge variant="outline" className="mt-1 border-status-warn-foreground/50 text-status-warn-foreground">
                            Not published
                          </Badge>
                        )}
                      </div>

                      <div className="col-span-2 flex justify-end sm:col-span-1 sm:col-start-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="ghost" size="icon-sm" aria-label="Slot actions" disabled={isPending} />
                            }
                          >
                            <MoreHorizontal className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => run(() => publishSlotAction(slot.id, !slot.published))}>
                              {slot.published ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                              {slot.published ? "Hide from applicants" : "Publish to applicants"}
                            </DropdownMenuItem>
                            {booking ? (
                              <DropdownMenuItem variant="destructive" onClick={() => handleCancel(booking)}>
                                <XCircle className="size-4" />
                                Cancel booking
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => run(() => deleteSlotAction(slot.id))}
                              >
                                <Trash2 className="size-4" />
                                Delete slot
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {cancelled.length > 0 && (
        <details className="rounded-xl border p-3">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
            Cancelled ({cancelled.length})
          </summary>
          <ul className="mt-3 divide-y text-sm">
            {cancelled.map((b) => (
              <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                <span className="font-medium">
                  {b.applicantName} <span className="font-normal text-muted-foreground">· {b.applicantEmail}</span>
                </span>
                <span className="text-muted-foreground">
                  {formatDateLong(b.date)} · {formatTime12h(b.startTime)} · {b.exec1Name}
                  {b.exec2Name ? ` & ${b.exec2Name}` : ""}
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
