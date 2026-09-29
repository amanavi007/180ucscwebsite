"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpRight } from "lucide-react";
import { cancelBookingByTokenAction } from "@/actions/coffee-chat-public";
import type { ManagedBooking } from "@/lib/data/coffee-chat-public";
import { formatTime12h } from "@/lib/coffee-chat";
import { formatDateLong } from "@/lib/date";
import { Button } from "@/components/ui/button";

export function ManageView({ token, booking }: { token: string; booking: ManagedBooking | null }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (!booking) {
    return (
      <p className="text-center text-foreground/70">
        We can&apos;t find a booking for that link. If you think this is a mistake, reach out to us directly.
      </p>
    );
  }

  if (booking.status === "cancelled") {
    return (
      <div className="text-center">
        <p className="text-foreground/70">This booking has been cancelled.</p>
        <Button nativeButton={false} render={<a href="/apply/coffee-chat" />} className="mt-6 gap-1.5">
          Book a new time
          <ArrowUpRight className="size-4" />
        </Button>
      </div>
    );
  }

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelBookingByTokenAction(token);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Booking cancelled.");
      router.refresh();
    });
  }

  // Deliberately not a plain `render={<a href=.../>}` Button: navigating
  // away has to wait until the cancel request actually resolves, or the
  // old slot can end up not freed if the page unloads mid-request.
  function handleReschedule() {
    startTransition(async () => {
      const result = await cancelBookingByTokenAction(token);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.push("/apply/coffee-chat");
    });
  }

  return (
    <div className="text-center">
      <p className="text-lg font-semibold">{formatDateLong(booking.date)}</p>
      <p className="mt-1 text-foreground/70">
        {formatTime12h(booking.startTime)} to {formatTime12h(booking.endTime)}
      </p>
      {booking.location.trim() !== "" && <p className="mt-1 text-foreground/70">{booking.location}</p>}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button variant="outline" onClick={handleCancel} disabled={isPending}>
          Cancel booking
        </Button>
        <Button onClick={handleReschedule} disabled={isPending}>
          Reschedule
        </Button>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        &quot;Reschedule&quot; cancels this booking and takes you back to pick a new time.
      </p>
    </div>
  );
}
