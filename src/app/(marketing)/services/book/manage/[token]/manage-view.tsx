"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpRight } from "lucide-react";
import { cancelClientMeetingByTokenAction } from "@/actions/client-meeting-public";
import type { ManagedClientMeeting } from "@/lib/data/client-meeting-public";
import { formatTime12h } from "@/lib/coffee-chat";
import { formatDateLong } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { ClientMeetingAddToCalendarButtons } from "../../add-to-calendar";

export function ManageView({
  token,
  meeting,
}: {
  token: string;
  meeting: ManagedClientMeeting | null;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (!meeting) {
    return (
      <p className="text-center text-foreground/70">
        We can&apos;t find a booking for that link. If you think this is a
        mistake, reach out to us directly.
      </p>
    );
  }

  if (meeting.status === "completed" || meeting.status === "cancelled") {
    return (
      <div className="text-center">
        <p className="text-foreground/70">
          {meeting.status === "completed"
            ? "This intro call has already taken place."
            : "This booking has been cancelled."}
        </p>
        {meeting.canReschedule && (
          <Button
            nativeButton={false}
            render={<a href="/services/book" />}
            className="mt-6 gap-1.5"
          >
            Book a new time
            <ArrowUpRight className="size-4" />
          </Button>
        )}
      </div>
    );
  }

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelClientMeetingByTokenAction(token);
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
    if (!meeting) return;
    startTransition(async () => {
      const result = await cancelClientMeetingByTokenAction(token, {
        reschedule: true,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      // Carry details over to the picker (kept out of the URL). Needs text isn't loaded here, so it is retyped.
      try {
        sessionStorage.setItem(
          "clientMeetingReschedule",
          JSON.stringify({
            contactName: meeting.contactName,
            businessName: meeting.businessName,
            email: meeting.email,
            phone: meeting.phone ?? "",
            needs: "",
            token,
          }),
        );
      } catch {
        // Private mode: they just retype it.
      }
      router.push("/services/book");
    });
  }

  return (
    <div className="text-center">
      <p className="text-lg font-semibold">{formatDateLong(meeting.date)}</p>
      <p className="mt-1 text-foreground/70">
        {formatTime12h(meeting.startTime)} to {formatTime12h(meeting.endTime)}
      </p>
      <p className="mt-3 font-semibold">{meeting.businessName}</p>
      <p className="text-foreground/70">{meeting.contactName}</p>
      <p className="mt-3 text-foreground/70">
        {meeting.meetingUrl ? (
          <a
            href={meeting.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-deep underline underline-offset-[3px]"
          >
            Join the video call
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          "We'll email you the video link before the meeting."
        )}
      </p>
      <ClientMeetingAddToCalendarButtons
        booking={{
          businessName: meeting.businessName,
          contactName: meeting.contactName,
          date: meeting.date,
          startTime: meeting.startTime,
          endTime: meeting.endTime,
          manageToken: token,
          meetingUrl: meeting.meetingUrl,
          audience: "client",
        }}
      />
      {meeting.canSelfCancel ? (
        <>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isPending}
            >
              Cancel booking
            </Button>
            <Button
              onClick={handleReschedule}
              disabled={isPending || !meeting.canReschedule}
            >
              Reschedule
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {meeting.canReschedule
              ? '"Reschedule" cancels this booking and takes you back to pick a new time. '
              : "Rescheduling isn't available right now (no other times are open), so your booking is safe. You can still cancel, or contact us. "}
            Changes close 12 hours before the call.
          </p>
        </>
      ) : (
        <p className="mt-8 text-sm text-foreground/70">
          Changes close 12 hours before the call. Please contact us and
          we&apos;ll help.
        </p>
      )}
    </div>
  );
}
