"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpRight } from "lucide-react";
import { cancelInterviewBookingByTokenAction } from "@/actions/interview-public";
import type { ManagedInterviewBooking } from "@/lib/data/interview-public";
import { formatTime12h } from "@/lib/coffee-chat";
import { INTERVIEW_LOCATION } from "@/lib/interview";
import { formatDateLong } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { InterviewAddToCalendarButtons } from "../../interview-add-to-calendar";

export function ManageView({ token, booking }: { token: string; booking: ManagedInterviewBooking | null }) {
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
        <Button nativeButton={false} render={<a href="/apply/interview" />} className="mt-6 gap-1.5">
          Book a new time
          <ArrowUpRight className="size-4" />
        </Button>
      </div>
    );
  }

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelInterviewBookingByTokenAction(token);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Booking cancelled.");
      router.refresh();
    });
  }

  // Navigation waits for the cancel to resolve so the old slot is actually freed.
  function handleReschedule() {
    startTransition(async () => {
      const result = await cancelInterviewBookingByTokenAction(token);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.push("/apply/interview");
    });
  }

  return (
    <div className="text-center">
      <p className="text-lg font-semibold">{formatDateLong(booking.date)}</p>
      <p className="mt-1 text-foreground/70">
        {formatTime12h(booking.startTime)} to {formatTime12h(booking.endTime)}
      </p>
      <p className="mt-1 text-foreground/70">{INTERVIEW_LOCATION}</p>
      <InterviewAddToCalendarButtons
        booking={{
          applicantName: booking.applicantName,
          date: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
          manageToken: token,
        }}
      />
      {booking.canSelfCancel ? (
        <>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button variant="outline" onClick={handleCancel} disabled={isPending}>
              Cancel booking
            </Button>
            <Button onClick={handleReschedule} disabled={isPending}>
              Reschedule
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            &quot;Reschedule&quot; cancels this booking and takes you back to pick a new time. Changes close 24 hours before your interview.
          </p>
        </>
      ) : (
        <p className="mt-8 text-sm text-foreground/70">
          Your interview is less than 24 hours away, so it can no longer be changed online. Please contact us and we&apos;ll help.
        </p>
      )}
    </div>
  );
}
