import { Apple } from "lucide-react";
import { buildGoogleCalendarUrl, type CoffeeChatBookingForInvite } from "@/lib/calendar-invite";
import { Button } from "@/components/ui/button";

export function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3a7.2 7.2 0 0 1-10.7-3.78H1.34v3.09A12 12 0 0 0 12 24z"
      />
      <path fill="#FBBC05" d="M5.36 14.31a7.2 7.2 0 0 1 0-4.62V6.6H1.34a12 12 0 0 0 0 10.8l4.02-3.09z" />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.6 4.58 1.79l3.43-3.43A12 12 0 0 0 1.34 6.6l4.02 3.09A7.16 7.16 0 0 1 12 4.75z"
      />
    </svg>
  );
}

/**
 * "Add to your calendar" buttons for a confirmed booking: Google Calendar link and an .ics file for Apple / Outlook.
 * `variant="confirmation"` is the full-width two-up layout used on the post-booking screen; the default centred
 * pills are what the manage page shows.
 */
export function AddToCalendarButtons({
  booking,
  variant = "default",
}: {
  booking: CoffeeChatBookingForInvite;
  variant?: "default" | "confirmation";
}) {
  const googleUrl = buildGoogleCalendarUrl(booking);
  const icsUrl = `/api/coffee-chat/${booking.manageToken}/calendar.ics`;
  const compact = variant === "confirmation";

  return (
    <div className={compact ? "mx-auto mt-(--gap) grid max-w-[26rem] gap-2" : "mt-6"}>
      <p className={compact ? "text-xs font-bold tracking-widest text-deep/75 uppercase" : "text-sm font-semibold"}>
        Add to your calendar
      </p>
      <div className={compact ? "grid grid-cols-2 gap-2.5" : "mt-3 flex flex-wrap justify-center gap-3"}>
        <Button
          nativeButton={false}
          variant="outline"
          className={compact ? "h-11 gap-2 rounded-full bg-white text-sm font-semibold" : "gap-2 rounded-full"}
          render={<a href={googleUrl} target="_blank" rel="noopener noreferrer" />}
        >
          <GoogleIcon />
          {compact ? "Google" : "Google Calendar"}
        </Button>
        <Button
          nativeButton={false}
          variant="outline"
          className={compact ? "h-11 gap-2 rounded-full bg-white text-sm font-semibold" : "gap-2 rounded-full"}
          render={<a href={icsUrl} download="coffee-chat.ics" />}
        >
          <Apple className="size-4" />
          Apple / Outlook
        </Button>
      </div>
    </div>
  );
}
