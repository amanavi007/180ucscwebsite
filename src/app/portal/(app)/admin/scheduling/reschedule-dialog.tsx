"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { rescheduleClientMeetingAsAdminAction } from "@/actions/client-meeting";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Move a client's booking to any date and time. Mount it only while open so each open starts fresh. */
export function RescheduleDialog({
  bookingId,
  businessName,
  date: initialDate,
  startTime: initialTime,
  onClose,
}: {
  bookingId: string;
  businessName: string;
  date: string;
  startTime: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(initialTime);

  function submit() {
    startTransition(async () => {
      const result = await rescheduleClientMeetingAsAdminAction(bookingId, date, startTime);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Meeting moved. The client and the panel were emailed.");
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move {businessName}&apos;s meeting</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="reschedule-date">New date</Label>
            <Input id="reschedule-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="reschedule-time">New start time</Label>
            <Input id="reschedule-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <p className="text-sm text-muted-foreground">Same length, same video link. The client and the panel will be emailed.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Keep current time
          </Button>
          <Button onClick={submit} disabled={isPending || !date || !startTime}>
            Move meeting
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
