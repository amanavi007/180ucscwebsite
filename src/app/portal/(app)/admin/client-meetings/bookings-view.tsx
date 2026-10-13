"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { XCircle } from "lucide-react";
import { cancelClientMeetingAsAdminAction, setClientMeetingUrlAction } from "@/actions/client-meeting";
import { formatTime12h } from "@/lib/coffee-chat";
import { formatDateLong, getOrgTodayDateString } from "@/lib/date";
import type { ClientMeetingBookingRow } from "@/lib/data/client-meeting";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

function UrlEditor({ booking }: { booking: ClientMeetingBookingRow }) {
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(booking.meetingUrl ?? "");
  const router = useRouter();

  function save() {
    startTransition(async () => {
      const result = await setClientMeetingUrlAction(booking.id, value);
      if (result.error) toast.error(result.error);
      else toast.success("Meeting link saved.");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        type="url"
        aria-label={`Meeting link for ${booking.businessName}`}
        placeholder="https://meet.google.com/…"
        className="h-8 w-56"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button size="sm" variant="outline" onClick={save} disabled={isPending}>
        Save
      </Button>
    </div>
  );
}

function rank(b: ClientMeetingBookingRow, today: string): number {
  if (b.status === "confirmed") return b.date >= today ? 0 : 1;
  return 2;
}

export function BookingsView({ bookings }: { bookings: ClientMeetingBookingRow[] }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const today = getOrgTodayDateString();

  const sorted = [...bookings].sort((a, b) => {
    const ra = rank(a, today);
    const rb = rank(b, today);
    if (ra !== rb) return ra - rb;
    const cmp = `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`);
    return ra === 0 ? cmp : -cmp;
  });

  async function handleCancel(b: ClientMeetingBookingRow) {
    const ok = await confirm({
      title: `Cancel ${b.businessName}'s meeting?`,
      description: "The client and the panel will be emailed.",
      confirmLabel: "Cancel the meeting",
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await cancelClientMeetingAsAdminAction(b.id);
      if (result.error) toast.error(result.error);
      else toast.success("Booking cancelled.");
      router.refresh();
    });
  }

  if (sorted.length === 0) {
    return (
      <p className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        No client bookings yet.
      </p>
    );
  }

  return (
    <div className="mt-4">
      {confirmDialog}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Business</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Needs</TableHead>
            <TableHead>When</TableHead>
            <TableHead>Panel</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Meeting link</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((b) => {
            const confirmed = b.status === "confirmed";
            const needsLink = confirmed && !b.meetingUrl;
            return (
              <TableRow key={b.id} className={cn(needsLink && "bg-status-warn/60")}>
                <TableCell className="font-medium">{b.businessName}</TableCell>
                <TableCell>
                  <p>{b.contactName}</p>
                  <p className="text-xs text-muted-foreground">{b.email}</p>
                  {b.phone && <p className="text-xs text-muted-foreground">{b.phone}</p>}
                </TableCell>
                <TableCell className="max-w-xs">
                  <details>
                    <summary className="cursor-pointer truncate text-sm" title={b.needs}>
                      {b.needs.length > 40 ? `${b.needs.slice(0, 40)}…` : b.needs}
                    </summary>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{b.needs}</p>
                  </details>
                </TableCell>
                <TableCell>
                  <p>{formatDateLong(b.date)}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatTime12h(b.startTime)} to {formatTime12h(b.endTime)}
                  </p>
                </TableCell>
                <TableCell className="text-sm">{b.panelNames.join(", ")}</TableCell>
                <TableCell>
                  <Badge variant={confirmed ? "default" : "secondary"} className="capitalize">
                    {b.status}
                  </Badge>
                  {needsLink && (
                    <Badge variant="outline" className="ml-1 border-status-warn-foreground/50 text-status-warn-foreground">
                      Link needed
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{confirmed ? <UrlEditor key={b.meetingUrl ?? ""} booking={b} /> : null}</TableCell>
                <TableCell>
                  {confirmed && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Cancel ${b.businessName}'s meeting`}
                      disabled={isPending}
                      onClick={() => handleCancel(b)}
                    >
                      <XCircle className="size-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
