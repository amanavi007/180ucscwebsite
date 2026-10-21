"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Eye, EyeOff, Trash2, XCircle } from "lucide-react";
import { cancelBookingAsAdminAction, deleteSlotAction, publishSlotAction } from "@/actions/coffee-chat";
import { cancelInterviewBookingAsAdminAction, deleteInterviewSlotAction, publishInterviewSlotAction } from "@/actions/interview";
import {
  cancelClientMeetingAsAdminAction,
  deleteClientMeetingSlotAction,
  publishClientMeetingSlotAction,
} from "@/actions/client-meeting";
import { formatDateLong } from "@/lib/date";
import { formatTimeRange } from "@/lib/coffee-chat";
import { AGENDA_KIND_LABEL, type AgendaItem } from "@/lib/scheduling-agenda";
import { useConfirm } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SwapControl } from "../coffee-chats/schedule-view";
import { PanelControl } from "../interviews/schedule-view";
import { UrlEditor } from "../client-meetings/bookings-view";
import { RescheduleDialog } from "./reschedule-dialog";
import type { SchedulingData } from "./scheduling-workspace";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3 border-t py-2.5 text-sm first:border-t-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium break-words">{children}</dd>
    </div>
  );
}

/** Everything you can do to one slot, in the panel beside the agenda. Keyed by slot so it resets when you pick another. */
export function SlotPanel({ item, data, onClose }: { item: AgendaItem; data: SchedulingData; onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  const [moving, setMoving] = useState(false);

  function run(action: () => Promise<{ error?: string }>, success: string, closeAfter = false) {
    startTransition(async () => {
      const result = await action();
      if (result.error) toast.error(result.error);
      else {
        toast.success(success);
        if (closeAfter) onClose();
      }
      router.refresh();
    });
  }

  const published = item.state !== "hidden";
  let body: React.ReactNode = null;
  let publish: () => void = () => {};
  let cancel: (() => void) | null = null;
  let remove: () => void = () => {};
  let hasBooking = false;
  let moveDialog: React.ReactNode = null;

  if (item.kind === "coffee") {
    const slot = data.coffee.slots.find((s) => s.id === item.slotId);
    const booking = data.coffee.bookings.find((b) => b.slotId === item.slotId && b.status === "confirmed");
    if (!slot) return null;
    hasBooking = !!booking;
    body = (
      <>
        <section className="space-y-2">
          <h3 className="text-sm font-bold">Hosts</h3>
          <div className="grid grid-cols-2 gap-2">
            <SwapControl slot={slot} position="exec_id_1" router={router} />
            <SwapControl slot={slot} position="exec_id_2" router={router} />
          </div>
        </section>
        {booking ? (
          <dl>
            <Fact label="Applicant">{booking.applicantName}</Fact>
            <Fact label="Email">{booking.applicantEmail}</Fact>
            {booking.location && <Fact label="Where">{booking.location}</Fact>}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Nobody has booked this slot yet.</p>
        )}
      </>
    );
    publish = () => run(() => publishSlotAction(slot.id, !slot.published), slot.published ? "Hidden from applicants." : "Published.");
    if (booking) {
      cancel = async () => {
        const ok = await confirm({
          title: `Cancel ${booking.applicantName}'s coffee chat?`,
          description: "The applicant and execs will be notified.",
          confirmLabel: "Cancel the chat",
        });
        if (ok) run(() => cancelBookingAsAdminAction(booking.id), "Booking cancelled.", true);
      };
    }
    remove = () => run(() => deleteSlotAction(slot.id), "Slot deleted.", true);
  }

  if (item.kind === "interview") {
    const slot = data.interviews.slots.find((s) => s.id === item.slotId);
    if (!slot) return null;
    hasBooking = !!slot.bookingId;
    body = (
      <>
        <section className="space-y-2">
          <h3 className="text-sm font-bold">Panel</h3>
          <PanelControl slot={slot} router={router} />
        </section>
        {slot.bookingId ? (
          <dl>
            <Fact label="Applicant">{slot.applicantName}</Fact>
            {slot.applicantEmail && <Fact label="Email">{slot.applicantEmail}</Fact>}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Nobody has booked this slot yet.</p>
        )}
      </>
    );
    publish = () =>
      run(() => publishInterviewSlotAction(slot.id, !slot.published), slot.published ? "Hidden from applicants." : "Published.");
    if (slot.bookingId) {
      const bookingId = slot.bookingId;
      cancel = async () => {
        const ok = await confirm({
          title: `Cancel ${slot.applicantName}'s interview?`,
          description: "The applicant and the panel will be emailed.",
          confirmLabel: "Cancel the interview",
        });
        if (ok) run(() => cancelInterviewBookingAsAdminAction(bookingId), "Booking cancelled.", true);
      };
    }
    remove = () => run(() => deleteInterviewSlotAction(slot.id), "Slot deleted.", true);
  }

  if (item.kind === "client") {
    const slot = data.clients.slots.find((s) => s.id === item.slotId);
    const booking = data.clients.bookings.find((b) => b.slotId === item.slotId && b.status === "confirmed");
    if (!slot) return null;
    hasBooking = !!booking;
    body = booking ? (
      <>
        <dl>
          <Fact label="Business">{booking.businessName}</Fact>
          <Fact label="Contact">{booking.contactName}</Fact>
          <Fact label="Email">{booking.email}</Fact>
          {booking.phone && <Fact label="Phone">{booking.phone}</Fact>}
          <Fact label="Panel">{booking.panelNames.join(", ")}</Fact>
          <Fact label="What they need">{booking.needs}</Fact>
        </dl>
        <section className="space-y-2">
          <h3 className="text-sm font-bold">Meeting link</h3>
          <UrlEditor booking={booking} />
        </section>
      </>
    ) : (
      <p className="text-sm text-muted-foreground">Nobody has booked this slot yet. The panel is set under Booking and setup.</p>
    );
    publish = () =>
      run(() => publishClientMeetingSlotAction(slot.id, !slot.published), slot.published ? "Hidden from clients." : "Published.");
    if (booking) {
      moveDialog = moving ? (
        <RescheduleDialog
          bookingId={booking.id}
          businessName={booking.businessName}
          date={booking.date}
          startTime={booking.startTime}
          onClose={() => setMoving(false)}
        />
      ) : null;
      cancel = async () => {
        const ok = await confirm({
          title: `Cancel ${booking.businessName}'s meeting?`,
          description: "The client and the panel will be emailed.",
          confirmLabel: "Cancel the meeting",
        });
        if (ok) run(() => cancelClientMeetingAsAdminAction(booking.id), "Booking cancelled.", true);
      };
    }
    remove = () => run(() => deleteClientMeetingSlotAction(slot.id), "Slot deleted.", true);
  }

  return (
    <section aria-label={`${AGENDA_KIND_LABEL[item.kind]} details`} className="space-y-5 rounded-[22px] border bg-card p-6">
      {confirmDialog}
      {moveDialog}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase">{AGENDA_KIND_LABEL[item.kind]}</p>
          <h2 className="mt-1 truncate text-xl">{item.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDateLong(item.date)} · {formatTimeRange(item.startTime, item.endTime)}
          </p>
          <div className="mt-2 flex gap-2">
            <Badge variant={item.state === "booked" ? "ok" : item.state === "open" ? "warn" : "muted"}>
              {item.state === "booked" ? "Booked" : item.state === "open" ? "Open" : "Hidden"}
            </Badge>
            {item.mine && <Badge variant="info">You</Badge>}
          </div>
        </div>
        <Button variant="outline" size="icon-sm" onClick={onClose} aria-label="Close panel">
          ✕
        </Button>
      </div>

      {body}

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button variant="outline" disabled={isPending} onClick={publish}>
          {published ? <EyeOff /> : <Eye />}
          {published ? "Hide from signups" : "Publish"}
        </Button>
        {item.kind === "client" && hasBooking && (
          <Button variant="outline" disabled={isPending} onClick={() => setMoving(true)}>
            <CalendarClock />
            Move to another time
          </Button>
        )}
        {hasBooking && cancel ? (
          <Button variant="destructive" disabled={isPending} onClick={cancel}>
            <XCircle />
            Cancel booking
          </Button>
        ) : (
          <Button variant="destructive" disabled={isPending} onClick={remove}>
            <Trash2 />
            Delete slot
          </Button>
        )}
      </div>
    </section>
  );
}
