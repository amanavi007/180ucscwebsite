"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, CircleHelp, Eye, EyeOff, RefreshCw, Trash2 } from "lucide-react";
import {
  deleteClientMeetingSlotAction,
  generateClientMeetingSlotsAction,
  publishAllClientMeetingSlotsAction,
  publishClientMeetingSlotAction,
} from "@/actions/client-meeting";
import { formatTime12h } from "@/lib/coffee-chat";
import { formatDateLong } from "@/lib/date";
import type { ClientMeetingSlotRow } from "@/lib/data/client-meeting";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarHelp } from "../coffee-chats/schedule-view";

export function SlotsView({ slots, feedUrl }: { slots: ClientMeetingSlotRow[]; feedUrl: string }) {
  const [isPending, startTransition] = useTransition();
  const [helpOpen, setHelpOpen] = useState(false);
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
      const result = await generateClientMeetingSlotsAction();
      if (result.error) toast.error(result.error);
      else toast.success(`Generated ${result.createdCount ?? 0} new slot(s).`);
      router.refresh();
    });
  }

  function handlePublishAll() {
    startTransition(async () => {
      const result = await publishAllClientMeetingSlotsAction();
      if (result.error) toast.error(result.error);
      else toast.success(`Published ${result.publishedCount ?? 0} slot(s).`);
      router.refresh();
    });
  }

  async function handleCopyFeed() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      toast.success('Link copied. Click "How to add" to finish setting it up.');
    } catch {
      toast.error("Couldn't copy the link.");
    }
  }

  const booked = slots.filter((s) => s.bookingStatus === "booked").length;
  const hidden = slots.filter((s) => !s.published).length;

  return (
    <div className="mt-4 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{slots.length}</span> slots ·{" "}
          <span className="font-medium text-foreground">{booked}</span> booked ·{" "}
          <span className="font-medium text-foreground">{hidden}</span> not published
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
          <Button variant="outline" className="gap-1.5" onClick={handleGenerate} disabled={isPending}>
            <RefreshCw className="size-4" />
            Generate slots
          </Button>
          <Button className="gap-1.5" onClick={handlePublishAll} disabled={isPending || hidden === 0}>
            <Eye className="size-4" />
            Publish all
          </Button>
        </div>
      </div>

      {slots.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No slots yet. Add availability, then click &quot;Generate slots&quot;.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Visibility</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slots.map((slot) => (
              <TableRow key={slot.id}>
                <TableCell>{formatDateLong(slot.date)}</TableCell>
                <TableCell className="tabular-nums">
                  {formatTime12h(slot.startTime)} to {formatTime12h(slot.endTime)}
                </TableCell>
                <TableCell>
                  {slot.bookingStatus === "booked" ? (
                    <span className="font-medium">{slot.businessName}</span>
                  ) : (
                    <Badge variant="secondary">Open</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {slot.published ? (
                    <Badge>Published</Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
                      Not published
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      disabled={isPending}
                      onClick={() => run(() => publishClientMeetingSlotAction(slot.id, !slot.published))}
                    >
                      {slot.published ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      {slot.published ? "Unpublish" : "Publish"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete slot"
                      disabled={isPending || slot.bookingStatus === "booked"}
                      onClick={() => run(() => deleteClientMeetingSlotAction(slot.id))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <CalendarHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
