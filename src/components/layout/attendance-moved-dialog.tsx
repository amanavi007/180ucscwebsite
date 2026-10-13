"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dismissAttendanceNotice } from "@/actions/onboarding";

/** One-time notice after the UI refresh: attendance is now the Check in button on Home. */
export function AttendanceMovedDialog({ show }: { show: boolean }) {
  const [dismissed, setDismissed] = useState(false);

  function close() {
    setDismissed(true);
    dismissAttendanceNotice();
  }

  return (
    <Dialog open={show && !dismissed} onOpenChange={(open) => !open && close()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Attendance has moved</DialogTitle>
          <DialogDescription>
            To check in for a meeting, use the Check in button on your Home page. Your attendance rate and your team&apos;s
            status are still on the Attendance page.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={close}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
