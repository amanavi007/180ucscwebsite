import { Apple } from "lucide-react";
import {
  buildClientMeetingGoogleCalendarUrl,
  type ClientMeetingInviteInput,
} from "@/lib/client-meeting-invite";
import { Button } from "@/components/ui/button";
import { GoogleIcon } from "../../apply/coffee-chat/add-to-calendar";

/** Google Calendar link and an .ics download for a confirmed client meeting. */
export function ClientMeetingAddToCalendarButtons({
  booking,
  variant = "default",
}: {
  booking: ClientMeetingInviteInput;
  variant?: "default" | "confirmation";
}) {
  const googleUrl = buildClientMeetingGoogleCalendarUrl({
    ...booking,
    audience: "client",
  });
  const icsUrl = `/api/client-meeting/${booking.manageToken}/calendar.ics`;
  const compact = variant === "confirmation";

  return (
    <div
      className={
        compact ? "mx-auto mt-(--gap) grid max-w-[26rem] gap-2" : "mt-6"
      }
    >
      <p
        className={
          compact
            ? "text-xs font-bold tracking-widest text-deep/75 uppercase"
            : "text-sm font-semibold"
        }
      >
        Add to your calendar
      </p>
      <div
        className={
          compact
            ? "grid grid-cols-2 gap-2.5"
            : "mt-3 flex flex-wrap justify-center gap-3"
        }
      >
        <Button
          nativeButton={false}
          variant="outline"
          className={
            compact
              ? "h-11 gap-2 rounded-full bg-white text-sm font-semibold"
              : "gap-2 rounded-full"
          }
          render={
            <a href={googleUrl} target="_blank" rel="noopener noreferrer" />
          }
        >
          <GoogleIcon />
          {compact ? "Google" : "Google Calendar"}
        </Button>
        <Button
          nativeButton={false}
          variant="outline"
          className={
            compact
              ? "h-11 gap-2 rounded-full bg-white text-sm font-semibold"
              : "gap-2 rounded-full"
          }
          render={<a href={icsUrl} download="intro-call.ics" />}
        >
          <Apple className="size-4" />
          Apple / Outlook
        </Button>
      </div>
    </div>
  );
}
