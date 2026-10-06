import { Apple } from "lucide-react";
import {
  buildInterviewGoogleCalendarUrl,
  type InterviewInviteInput,
} from "@/lib/interview-invite";
import { Button } from "@/components/ui/button";
import { GoogleIcon } from "../coffee-chat/add-to-calendar";

/** Google Calendar link and an .ics download for a confirmed interview. */
export function InterviewAddToCalendarButtons({
  booking,
  variant = "default",
}: {
  booking: InterviewInviteInput;
  variant?: "default" | "confirmation";
}) {
  const googleUrl = buildInterviewGoogleCalendarUrl(booking);
  const icsUrl = `/api/interview/${booking.manageToken}/calendar.ics`;
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
          render={<a href={icsUrl} download="interview.ics" />}
        >
          <Apple className="size-4" />
          Apple / Outlook
        </Button>
      </div>
    </div>
  );
}
