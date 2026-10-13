"use client";

import { useState } from "react";
import { PANEL_SIZE } from "@/lib/client-meeting";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookingToggle as InterviewBookingToggle } from "../interviews/booking-toggle";
import { BookingToggle as ClientBookingToggle } from "../client-meetings/booking-toggle";
import { InviteesView } from "../interviews/invitees-view";
import { PanelView } from "../client-meetings/panel-view";
import type { SchedulingData } from "./scheduling-workspace";

/** The switches and lists that are not slots: booking open or closed, who is invited, who is on the client panel. */
export function SetupCard({ interviews, clients }: { interviews: SchedulingData["interviews"]; clients: SchedulingData["clients"] }) {
  const [open, setOpen] = useState<"invitees" | "panel" | null>(null);
  const openInterviewSlots = interviews.slots.filter((s) => s.published && s.bookingStatus === "open").length;
  const panelReady = clients.panelExecIds.length === PANEL_SIZE;

  return (
    <section aria-labelledby="setup-heading" className="rounded-[22px] border bg-card p-5">
      <h2 id="setup-heading" className="text-lg">
        Booking and setup
      </h2>

      <div className="mt-4 space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-bold">Interviews</p>
          <InterviewBookingToggle open={interviews.bookingOpen} />
          <Button variant="outline" size="sm" onClick={() => setOpen("invitees")}>
            Invitees ({interviews.invitees.length})
          </Button>
        </div>

        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-bold">Client calls</p>
          <ClientBookingToggle open={clients.bookingOpen} />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen("panel")}>
              Pick the panel
            </Button>
            <Badge variant={panelReady ? "ok" : "warn"}>
              {panelReady ? `Panel of ${PANEL_SIZE} set` : `Pick exactly ${PANEL_SIZE} execs`}
            </Badge>
          </div>
        </div>
      </div>

      <Dialog open={open === "invitees"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Interview invitees</DialogTitle>
            <DialogDescription>Applicants who can book an interview slot.</DialogDescription>
          </DialogHeader>
          <InviteesView invitees={interviews.invitees} openSlotCount={openInterviewSlots} />
        </DialogContent>
      </Dialog>

      <Dialog open={open === "panel"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Client call panel</DialogTitle>
            <DialogDescription>The {PANEL_SIZE} execs who take every client call.</DialogDescription>
          </DialogHeader>
          <PanelView execOptions={clients.execOptions} panelExecIds={clients.panelExecIds} />
        </DialogContent>
      </Dialog>
    </section>
  );
}
