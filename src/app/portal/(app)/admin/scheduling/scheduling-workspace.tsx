"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, CalendarPlus, ChevronDown, CircleHelp, Eye, RefreshCw } from "lucide-react";
import { generateSlotsAction, publishAllSlotsAction } from "@/actions/coffee-chat";
import { generateInterviewSlotsAction, publishAllInterviewSlotsAction } from "@/actions/interview";
import { generateClientMeetingSlotsAction, publishAllClientMeetingSlotsAction } from "@/actions/client-meeting";
import type { AvailabilityRow, BookingRow, SlotRow } from "@/lib/data/coffee-chat";
import type {
  InterviewAvailabilityRow,
  InterviewBookingRow,
  InterviewSlotRow,
  InviteeRow,
} from "@/lib/data/interview";
import type {
  ClientMeetingAvailabilityRow,
  ClientMeetingBookingRow,
  ClientMeetingSlotRow,
} from "@/lib/data/client-meeting";
import { formatTimeRange } from "@/lib/coffee-chat";
import {
  AGENDA_KIND_LABEL,
  buildAgenda,
  groupByDate,
  type AgendaItem,
  type AgendaKind,
  type AgendaState,
} from "@/lib/scheduling-agenda";
import { PageHeader } from "@/components/page-header";
import { FilterChip } from "@/components/filter-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CalendarHelp } from "../coffee-chats/schedule-view";
import { SlotPanel } from "./slot-panel";
import { AvailabilityPanel } from "./availability-panel";
import { SetupCard } from "./setup-card";

export interface SchedulingData {
  coffee: { slots: SlotRow[]; bookings: BookingRow[]; availability: AvailabilityRow[] };
  interviews: {
    slots: InterviewSlotRow[];
    bookings: InterviewBookingRow[];
    availability: InterviewAvailabilityRow[];
    invitees: InviteeRow[];
    bookingOpen: boolean;
  };
  clients: {
    slots: ClientMeetingSlotRow[];
    bookings: ClientMeetingBookingRow[];
    availability: ClientMeetingAvailabilityRow[];
    bookingOpen: boolean;
    panelExecIds: string[];
    execOptions: { id: string; name: string }[];
  };
}

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

/** One page for everything with a time on it: the agenda, your availability, booking switches and setup. */
export function SchedulingWorkspace({
  today,
  currentExecId,
  feedUrl,
  coffee,
  interviews,
  clients,
}: { today: string; currentExecId: string; feedUrl: string } & SchedulingData) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [kind, setKind] = useState<AgendaKind | "all">("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [openOnly, setOpenOnly] = useState(false);
  const [hiddenOnly, setHiddenOnly] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const all = useMemo(
    () =>
      buildAgenda({
        coffee: coffee.slots,
        interviews: interviews.slots,
        clients: clients.slots,
        currentExecId,
        clientPanelExecIds: clients.panelExecIds,
      }),
    [coffee.slots, interviews.slots, clients.slots, currentExecId, clients.panelExecIds],
  );

  const scoped = all.filter((i) => showPast || i.date >= today);
  const counts: Record<AgendaKind, number> = { coffee: 0, interview: 0, client: 0 };
  for (const i of scoped) counts[i.kind] += 1;
  const hiddenCount = scoped.filter((i) => i.state === "hidden").length;

  const visible = scoped.filter(
    (i) =>
      (kind === "all" || i.kind === kind) &&
      (!mineOnly || i.mine) &&
      (!openOnly || i.state === "open") &&
      (!hiddenOnly || i.state === "hidden"),
  );
  const groups = groupByDate(visible);
  const selected = all.find((i) => i.id === selectedId) ?? null;

  function run<R extends { error?: string }>(action: () => Promise<R>, success: (r: R) => string) {
    startTransition(async () => {
      const result = await action();
      if (result.error) toast.error(result.error);
      else toast.success(success(result));
      router.refresh();
    });
  }

  async function copyFeed() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      toast.success('Link copied. Click "How to add" to finish setting it up.');
    } catch {
      toast.error("Couldn't copy the link.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scheduling"
        description="Coffee chats, interviews and client calls in one list. Click a slot to manage it."
        actions={
          <>
            <Button variant="outline" onClick={copyFeed}>
              <CalendarPlus />
              Copy my calendar link
            </Button>
            <Button variant="ghost" onClick={() => setHelpOpen(true)}>
              <CircleHelp />
              How to add
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button size="lg" disabled={isPending}>
                    Add slots
                    <ChevronDown />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuItem
                  onClick={() => run(generateSlotsAction, (r) => `Made ${r.createdCount ?? 0} coffee chat slot(s).`)}
                >
                  <RefreshCw />
                  Make coffee chat slots from availability
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => run(generateInterviewSlotsAction, (r) => `Made ${r.createdCount ?? 0} interview slot(s).`)}
                >
                  <RefreshCw />
                  Make interview slots from availability
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => run(generateClientMeetingSlotsAction, (r) => `Made ${r.createdCount ?? 0} client call slot(s).`)}
                >
                  <RefreshCw />
                  Make client call slots from availability
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={hiddenCount === 0}
                  onClick={() => {
                    startTransition(async () => {
                      const results = await Promise.all([publishAllSlotsAction(), publishAllInterviewSlotsAction(), publishAllClientMeetingSlotsAction()]);
                      const failed = results.find((r) => r.error);
                      if (failed?.error) toast.error(failed.error);
                      else toast.success("Published every hidden slot.");
                      router.refresh();
                    });
                  }}
                >
                  <Eye />
                  Publish all hidden slots{hiddenCount > 0 ? ` (${hiddenCount})` : ""}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter the agenda">
            <FilterChip selected={kind === "all"} onClick={() => setKind("all")} count={scoped.length}>
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
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            <FilterChip selected={mineOnly} onClick={() => setMineOnly((v) => !v)}>
              Mine only
            </FilterChip>
            <FilterChip selected={openOnly} onClick={() => setOpenOnly((v) => !v)}>
              Open
            </FilterChip>
            <FilterChip selected={hiddenOnly} onClick={() => setHiddenOnly((v) => !v)} count={hiddenCount || undefined}>
              Hidden
            </FilterChip>
            <FilterChip selected={showPast} onClick={() => setShowPast((v) => !v)}>
              Past
            </FilterChip>
          </div>

          {groups.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-[22px] border bg-card py-16 text-center">
              <CalendarDays className="size-8 text-muted-foreground" aria-hidden />
              <p className="font-semibold">Nothing {showPast ? "" : "coming up "}that matches</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {all.length === 0
                  ? "Add your availability on the right, then use Add slots to turn it into bookable times."
                  : "Try turning a filter off."}
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
                    {g.items.map((item) => (
                      <AgendaRow key={item.id} item={item} selected={item.id === selectedId} onSelect={() => setSelectedId(item.id)} />
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </div>

        <aside aria-label={selected ? "Slot details" : "Availability and setup"} className="min-w-0 space-y-5 xl:sticky xl:top-0">
          {selected ? (
            <SlotPanel
              key={selected.id}
              item={selected}
              data={{ coffee, interviews, clients }}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <>
              <AvailabilityPanel
                today={today}
                currentExecId={currentExecId}
                coffee={coffee.availability}
                interviews={interviews.availability}
                clients={clients.availability}
                clientPanelExecIds={clients.panelExecIds}
              />
              <SetupCard interviews={interviews} clients={clients} />
            </>
          )}
        </aside>
      </div>

      <CalendarHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}

function AgendaRow({ item, selected, onSelect }: { item: AgendaItem; selected: boolean; onSelect: () => void }) {
  const chip = STATE_CHIP[item.state];
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          "grid w-full grid-cols-[7.5rem_0.5rem_minmax(0,1fr)_auto] items-center gap-x-4 rounded-[18px] border bg-card px-5 py-3.5 text-left transition-colors outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring",
          selected && "border-foreground bg-accent",
        )}
      >
        <span className="text-[0.9375rem] font-bold tabular-nums">{formatTimeRange(item.startTime, item.endTime)}</span>
        <span aria-hidden className={cn("h-9 rounded-full", KIND_BAR[item.kind])} />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="truncate text-[0.9375rem] font-semibold">{item.title}</span>
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{AGENDA_KIND_LABEL[item.kind]}</span>
            {item.mine && <Badge variant="info">You</Badge>}
          </span>
          {item.detail && <span className="block truncate text-sm text-muted-foreground">{item.detail}</span>}
        </span>
        <Badge variant={chip.variant}>{chip.label}</Badge>
      </button>
    </li>
  );
}
