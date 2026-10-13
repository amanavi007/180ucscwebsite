"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CircleCheck } from "lucide-react";
import { clearBookingMarkAction, markBookingAction } from "@/actions/recruit";
import type { AttendanceData, AttendanceItem } from "@/lib/data/recruit-import";
import type { AttendanceStatus } from "@/lib/recruit-attendance";
import { formatTime12h } from "@/lib/coffee-chat";
import { formatDateLong } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Segmented } from "./segmented";
import { StatusChip, type StatusTone } from "./status-chip";

type Pick = { applicantId: string; name: string; email: string | null; score: number };

const STATUS_LABEL: Record<AttendanceStatus, string> = { attended: "Attended", no_show: "No-show", excused: "Excused" };
const KIND_LABEL = { coffee_chat: "Coffee chat", interview: "Interview" } as const;
const ROW = "grid grid-cols-[5.5rem_minmax(0,1fr)_7.5rem_auto] items-center gap-4";

function markedChip(item: AttendanceItem): { tone: StatusTone; text: string } {
  const coffee = item.kind === "coffee_chat";
  if (item.markStatus === "attended") return { tone: "ok", text: coffee ? "Attended +1" : "Attended" };
  if (item.markStatus === "no_show") return { tone: "bad", text: coffee ? "No-show −1" : "No-show" };
  return { tone: "neutral", text: "Excused" };
}

function BookingRow({
  item,
  quarterId,
  applicantNames,
  showDate,
}: {
  item: AttendanceItem;
  quarterId: string;
  applicantNames: Record<string, string>;
  showDate?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [picks, setPicks] = useState<{ status: AttendanceStatus; options: Pick[] } | null>(null);
  const router = useRouter();

  function mark(status: AttendanceStatus, resolution?: { applicantId?: string; createNew?: boolean }) {
    startTransition(async () => {
      const result = await markBookingAction({
        quarterId,
        kind: item.kind,
        bookingId: item.bookingId,
        status,
        resolution,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.needsPick) {
        setPicks({ status, options: result.needsPick });
        return;
      }
      setPicks(null);
      toast.success(
        status === "no_show" && item.kind === "coffee_chat"
          ? `${item.applicantName} marked no-show (−1). You can void it from their profile.`
          : `${item.applicantName} marked ${STATUS_LABEL[status].toLowerCase()}.`,
      );
      router.refresh();
    });
  }

  function clear() {
    startTransition(async () => {
      const result = await clearBookingMarkAction(item.kind, item.bookingId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Mark cleared.");
      router.refresh();
    });
  }

  const chip = item.markStatus ? markedChip(item) : null;

  return (
    <li className="border-b px-5 py-3.5 last:border-b-0">
      <div className={ROW}>
        <span className="text-sm text-muted-foreground tabular-nums">
          {showDate ? formatDateLong(item.date) : formatTime12h(item.startTime)}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium">{item.applicantName}</div>
          <div className="truncate text-[13px] text-muted-foreground">
            {item.applicantEmail}
            {showDate ? ` · ${formatTime12h(item.startTime)}` : ""}
            {item.markStatus && item.applicantId ? ` · ${applicantNames[item.applicantId] ?? "Applicant"}` : ""}
          </div>
        </div>
        <span className="text-[13px] text-foreground/80">{KIND_LABEL[item.kind]}</span>
        <div>
          {item.status === "cancelled" ? (
            <span className="text-sm text-muted-foreground">Cancelled, counts as excused</span>
          ) : chip ? (
            <div className="flex items-center gap-3">
              <StatusChip tone={chip.tone}>
                {item.markStatus === "attended" && <Check className="size-3.5" />}
                {chip.text}
              </StatusChip>
              <button
                type="button"
                disabled={isPending}
                onClick={clear}
                className="text-[13px] text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
              >
                Change
              </button>
            </div>
          ) : (
            <div role="group" aria-label={`Mark ${item.applicantName}`} className="inline-flex overflow-hidden rounded-lg border bg-card">
              {(["attended", "excused", "no_show"] as const).map((status, i) => (
                <button
                  key={status}
                  type="button"
                  disabled={isPending}
                  onClick={() => mark(status)}
                  className={`h-9 px-4 text-sm font-medium transition-colors outline-none hover:bg-muted focus-visible:bg-muted disabled:opacity-50 ${i > 0 ? "border-l" : ""}`}
                >
                  {STATUS_LABEL[status]}
                  {status === "no_show" && item.kind === "coffee_chat" ? " (−1)" : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {picks && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-muted px-3.5 py-3 sm:ml-[6.5rem]">
          <span className="text-sm">Is {item.applicantName} one of these applicants?</span>
          {picks.options.slice(0, 3).map((o) => (
            <Button key={o.applicantId} size="sm" variant="outline" disabled={isPending} onClick={() => mark(picks.status, { applicantId: o.applicantId })}>
              Yes, {o.name}
            </Button>
          ))}
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => mark(picks.status, { createNew: true })}>
            No, add as a new person
          </Button>
        </div>
      )}
    </li>
  );
}

function DayGroup({
  date,
  items,
  quarterId,
  applicantNames,
  onMarkAll,
  canMarkAll,
  isPending,
}: {
  date: string;
  items: AttendanceItem[];
  quarterId: string;
  applicantNames: Record<string, string>;
  onMarkAll: (items: AttendanceItem[]) => void;
  canMarkAll: boolean;
  isPending: boolean;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-base font-semibold">
          {formatDateLong(date)}{" "}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {items.length} booking{items.length === 1 ? "" : "s"}
          </span>
        </h3>
        {canMarkAll && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => onMarkAll(items)}
            className="text-sm font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50"
          >
            Mark all attended
          </button>
        )}
      </div>
      <ul className="overflow-hidden rounded-xl border bg-card">
        {items.map((item) => (
          <BookingRow key={`${item.kind}:${item.bookingId}`} item={item} quarterId={quarterId} applicantNames={applicantNames} />
        ))}
      </ul>
    </section>
  );
}

export function AttendanceView({
  quarterId,
  data,
  applicantNames,
}: {
  quarterId: string;
  data: AttendanceData;
  applicantNames: Record<string, string>;
}) {
  const [isPending, startTransition] = useTransition();
  const [view, setView] = useState<"todo" | "done">("todo");
  const router = useRouter();

  const byDate = new Map<string, AttendanceItem[]>();
  for (const item of data.toMark) byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);
  const doneCount = data.marked.length + data.cancelled.length;

  function markAll(items: AttendanceItem[]) {
    startTransition(async () => {
      let skipped = 0;
      for (const item of items) {
        const result = await markBookingAction({ quarterId, kind: item.kind, bookingId: item.bookingId, status: "attended" });
        if (result.error || result.needsPick) skipped++;
      }
      if (skipped > 0) toast.warning(`${skipped} need you to confirm who they are. Mark those one by one.`);
      else toast.success("Everyone marked attended.");
      router.refresh();
    });
  }

  return (
    <div className="mt-6 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Segmented
          label="Show bookings"
          value={view}
          onChange={setView}
          options={[
            { value: "todo", label: `To mark · ${data.toMark.length}` },
            { value: "done", label: `Already marked · ${doneCount}` },
          ]}
        />
        <p className="text-sm text-muted-foreground">Coffee chats give +1 for attending and −1 for a no-show. Interviews give no points.</p>
      </div>

      {view === "todo" &&
        (data.toMark.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <CircleCheck className="size-8 text-primary" />
            <p className="font-medium">Nothing to mark right now</p>
            <p className="text-sm text-muted-foreground">
              Coffee chats and interviews show up here once they&apos;ve happened.
              {data.upcoming > 0 ? ` ${data.upcoming} more are coming up.` : ""}
            </p>
          </div>
        ) : (
          [...byDate.entries()].map(([date, items]) => (
            <DayGroup
              key={date}
              date={date}
              items={items}
              quarterId={quarterId}
              applicantNames={applicantNames}
              onMarkAll={markAll}
              canMarkAll={items.length > 1}
              isPending={isPending}
            />
          ))
        ))}

      {view === "done" &&
        (doneCount === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Nothing has been marked yet.</p>
        ) : (
          <>
            {data.marked.length > 0 && (
              <section className="space-y-2.5">
                <h3 className="text-base font-semibold">Marked</h3>
                <ul className="overflow-hidden rounded-xl border bg-card">
                  {data.marked.map((item) => (
                    <BookingRow key={`${item.kind}:${item.bookingId}`} item={item} quarterId={quarterId} applicantNames={applicantNames} showDate />
                  ))}
                </ul>
              </section>
            )}
            {data.cancelled.length > 0 && (
              <section className="space-y-2.5">
                <h3 className="text-base font-semibold">Cancelled by the applicant</h3>
                <p className="text-sm text-muted-foreground">These count as excused and give no points.</p>
                <ul className="overflow-hidden rounded-xl border bg-card">
                  {data.cancelled.map((item) => (
                    <BookingRow key={`${item.kind}:${item.bookingId}`} item={item} quarterId={quarterId} applicantNames={applicantNames} showDate />
                  ))}
                </ul>
              </section>
            )}
          </>
        ))}
    </div>
  );
}
