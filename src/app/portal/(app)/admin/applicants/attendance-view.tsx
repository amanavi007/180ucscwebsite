"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleCheck } from "lucide-react";
import { clearBookingMarkAction, markBookingAction } from "@/actions/recruit";
import type { AttendanceData, AttendanceItem } from "@/lib/data/recruit-import";
import type { AttendanceStatus } from "@/lib/recruit-attendance";
import { formatTime12h } from "@/lib/coffee-chat";
import { formatDateLong } from "@/lib/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Pick = { applicantId: string; name: string; email: string | null; score: number };

const STATUS_LABEL: Record<AttendanceStatus, string> = { attended: "Attended", no_show: "No-show", excused: "Excused" };
const KIND_LABEL = { coffee_chat: "Coffee chat", interview: "Interview" } as const;

function BookingRow({
  item,
  quarterId,
  applicantNames,
}: {
  item: AttendanceItem;
  quarterId: string;
  applicantNames: Record<string, string>;
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

  return (
    <li className="space-y-2 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium">
            {item.applicantName} <span className="font-normal text-muted-foreground">· {item.applicantEmail}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {KIND_LABEL[item.kind]} · {formatDateLong(item.date)} · {formatTime12h(item.startTime)}
            {item.markStatus && item.applicantId ? ` · ${applicantNames[item.applicantId] ?? "Applicant"}` : ""}
          </div>
        </div>
        {item.status === "cancelled" ? (
          <Badge variant="outline">Cancelled — excused</Badge>
        ) : item.markStatus ? (
          <div className="flex items-center gap-2">
            <Badge variant={item.markStatus === "no_show" ? "destructive" : "secondary"}>{STATUS_LABEL[item.markStatus]}</Badge>
            <Button size="sm" variant="ghost" disabled={isPending} onClick={clear}>
              Clear
            </Button>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <Button size="sm" disabled={isPending} onClick={() => mark("attended")}>
              Attended
            </Button>
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => mark("excused")}>
              Excused
            </Button>
            <Button size="sm" variant="destructive" disabled={isPending} onClick={() => mark("no_show")}>
              No-show{item.kind === "coffee_chat" ? " (−1)" : ""}
            </Button>
          </div>
        )}
      </div>

      {picks && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 dark:border-amber-500/40 dark:bg-amber-500/10">
          <p className="mb-1.5 text-xs font-medium">Is {item.applicantName} one of these applicants?</p>
          <div className="flex flex-wrap gap-2">
            {picks.options.slice(0, 3).map((o) => (
              <Button key={o.applicantId} size="sm" variant="outline" disabled={isPending} onClick={() => mark(picks.status, { applicantId: o.applicantId })}>
                Yes, {o.name}
              </Button>
            ))}
            <Button size="sm" disabled={isPending} onClick={() => mark(picks.status, { createNew: true })}>
              No, add as a new person
            </Button>
          </div>
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
    <section className="rounded-xl border">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <h3 className="text-sm font-medium">{formatDateLong(date)}</h3>
        {canMarkAll && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => onMarkAll(items)}>
            Mark everyone attended
          </Button>
        )}
      </div>
      <ul className="divide-y">
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
  const router = useRouter();

  const byDate = new Map<string, AttendanceItem[]>();
  for (const item of data.toMark) byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);

  function markAll(items: AttendanceItem[]) {
    startTransition(async () => {
      let skipped = 0;
      for (const item of items) {
        const result = await markBookingAction({ quarterId, kind: item.kind, bookingId: item.bookingId, status: "attended" });
        if (result.error || result.needsPick) skipped++;
      }
      if (skipped > 0) toast.warning(`${skipped} need you to confirm who they are — mark those one by one.`);
      else toast.success("Everyone marked attended.");
      router.refresh();
    });
  }

  return (
    <div className="mt-4 space-y-5">
      {data.toMark.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <CircleCheck className="size-8 text-emerald-600" />
            <p className="font-medium">Nothing to mark right now</p>
            <p className="text-sm text-muted-foreground">
              Coffee chats and interviews show up here once they&apos;ve happened.
              {data.upcoming > 0 ? ` ${data.upcoming} more are coming up.` : ""}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Mark who showed up. Coffee chat points are given automatically (attended +1, no-show −1, excused 0); interviews only
            record attendance. Applicants are created for you if they aren&apos;t in the list yet.
          </p>
          {[...byDate.entries()].map(([date, items]) => (
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
          ))}
        </>
      )}

      {data.cancelled.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Cancelled by the applicant (counted as excused, no points)</h3>
          <ul className="divide-y rounded-xl border">
            {data.cancelled.map((item) => (
              <BookingRow key={`${item.kind}:${item.bookingId}`} item={item} quarterId={quarterId} applicantNames={applicantNames} />
            ))}
          </ul>
        </section>
      )}

      {data.marked.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Already marked</h3>
          <ul className="divide-y rounded-xl border">
            {data.marked.map((item) => (
              <BookingRow key={`${item.kind}:${item.bookingId}`} item={item} quarterId={quarterId} applicantNames={applicantNames} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
