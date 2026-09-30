"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cancelBookingAsAdminAction } from "@/actions/coffee-chat";
import { buildIcsCalendar } from "@/lib/calendar-invite";
import type { BookingRow } from "@/lib/data/coffee-chat";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function BookingsView({
  bookings,
  currentExecId,
  feedUrl,
}: {
  bookings: BookingRow[];
  currentExecId: string;
  feedUrl: string;
}) {
  const [onlyMine, setOnlyMine] = useState(false);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleCancel(bookingId: string) {
    startTransition(async () => {
      const result = await cancelBookingAsAdminAction(bookingId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Booking cancelled.");
      router.refresh();
    });
  }

  const visible = useMemo(() => {
    const filtered = onlyMine
      ? bookings.filter((b) => b.exec1Id === currentExecId || b.exec2Id === currentExecId)
      : bookings;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => dir * `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
  }, [bookings, onlyMine, sortDir, currentExecId]);

  async function handleCopyFeed() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      toast.success("Link copied. In Google Calendar: Other calendars (+) → From URL → paste.");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  }

  function handleExport() {
    const confirmed = visible.filter((b) => b.status === "confirmed");
    if (confirmed.length === 0) {
      toast.error("No confirmed bookings to export.");
      return;
    }
    const ics = buildIcsCalendar(
      confirmed.map((b) => ({
        ...b,
        manageToken: b.id,
        otherExecName:
          b.exec1Id === currentExecId
            ? b.exec2Name
            : b.exec2Id === currentExecId
              ? b.exec1Name
              : [b.exec1Name, b.exec2Name].filter(Boolean).join(" & "),
      })),
    );
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "coffee-chats.ics";
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderTable(rows: BookingRow[]) {
    return (
      <Table className="mt-4">
        <TableHeader>
          <TableRow>
            <TableHead>Applicant</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>With</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((b) => (
            <TableRow key={b.id}>
              <TableCell>{b.applicantName}</TableCell>
              <TableCell>{b.applicantEmail}</TableCell>
              <TableCell>{b.date}</TableCell>
              <TableCell>{b.startTime}</TableCell>
              <TableCell>{b.location || "—"}</TableCell>
              <TableCell>
                {b.exec1Name}
                {b.exec2Name ? ` & ${b.exec2Name}` : ""}
              </TableCell>
              <TableCell>
                <Badge variant={b.status === "confirmed" ? "default" : "secondary"}>{b.status}</Badge>
              </TableCell>
              <TableCell>
                {b.status === "confirmed" && (
                  <Button variant="outline" size="sm" onClick={() => handleCancel(b.id)} disabled={isPending}>
                    Cancel
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  const active = visible.filter((b) => b.status === "confirmed");
  const cancelled = visible.filter((b) => b.status !== "confirmed");

  if (bookings.length === 0) {
    return <p className="mt-4 text-sm text-muted-foreground">No bookings yet.</p>;
  }

  return (
    <>
      <div className="mt-4 flex items-center gap-2">
        <Button variant={onlyMine ? "default" : "outline"} size="sm" onClick={() => setOnlyMine((v) => !v)}>
          My bookings
        </Button>
        <Button variant="outline" size="sm" onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}>
          Date &amp; time {sortDir === "asc" ? "↑ earliest first" : "↓ latest first"}
        </Button>
        <Button variant="outline" size="sm" onClick={handleCopyFeed}>
          Copy calendar link
        </Button>
        <Button variant="outline" size="sm" onClick={handleExport}>
          Download .ics
        </Button>
      </div>
      <details className="mt-3 rounded-md border p-3 text-sm">
        <summary className="cursor-pointer font-medium">How to add your coffee chats to your calendar</summary>
        <p className="mt-3 text-muted-foreground">
          Click <strong>Copy calendar link</strong> above, then follow the steps for your calendar. You only do this
          once — new bookings appear automatically and cancelled ones disappear. Don&apos;t share the link; it&apos;s
          personal to you.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <h4 className="font-medium">Google Calendar (on a computer)</h4>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>
                Open <span className="font-mono">calendar.google.com</span>.
              </li>
              <li>
                In the left sidebar, next to <strong>Other calendars</strong>, click <strong>+</strong>.
              </li>
              <li>
                Choose <strong>From URL</strong>.
              </li>
              <li>
                Paste the link and click <strong>Add calendar</strong>.
              </li>
              <li>
                It shows up under Other calendars as &ldquo;180DC Coffee Chats&rdquo;. It can take a few minutes to
                appear, and Google refreshes it every few hours.
              </li>
            </ol>
          </div>
          <div>
            <h4 className="font-medium">Apple Calendar (Mac)</h4>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>Open the Calendar app.</li>
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
            <h4 className="mt-3 font-medium">Apple Calendar (iPhone)</h4>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>
                Go to <strong>Settings → Calendar → Accounts → Add Account → Other</strong>.
              </li>
              <li>
                Tap <strong>Add Subscribed Calendar</strong>, paste the link, and tap <strong>Next</strong>, then{" "}
                <strong>Save</strong>.
              </li>
            </ol>
          </div>
        </div>
      </details>
      {active.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No active bookings.</p>
      ) : (
        renderTable(active)
      )}
      {cancelled.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
            Cancelled ({cancelled.length})
          </summary>
          {renderTable(cancelled)}
        </details>
      )}
    </>
  );
}
