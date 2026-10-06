"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import Link from "next/link";
import { Check, ChevronRight, Mail, MapPin } from "lucide-react";
import { formatTimeRange, mapsSearchUrl } from "@/lib/coffee-chat";
import { INTERVIEW_LOCATION } from "@/lib/interview";
import { formatDateParts } from "@/lib/date";
import { DateTile } from "../coffee-chat/date-tile";
import { InterviewAddToCalendarButtons } from "./interview-add-to-calendar";

export interface ConfirmedInterview {
  manageToken: string;
  date: string;
  startTime: string;
  endTime: string;
}

// Spacing scales with viewport height so the whole screen fits without scrolling on a laptop.
const fitToScreen = {
  "--gap": "clamp(0.625rem, 2.2svh, 1.5rem)",
  "--badge": "clamp(3.75rem, 9svh, 5.5rem)",
} as CSSProperties;

/** Post-booking screen: fills the viewport under the nav and owns its own page shell. */
export function InterviewConfirmation({ booking, applicantName }: { booking: ConfirmedInterview; applicantName: string }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { weekday, month, day } = formatDateParts(booking.date);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div style={fitToScreen} className="flex min-h-svh items-center justify-center px-4 pt-24 pb-6 sm:px-6">
      <section className="mint-panel w-full max-w-3xl rounded-[2rem] px-5 py-[calc(var(--gap)*1.6)] text-center sm:rounded-[2.5rem] sm:px-10">
        <div className="mx-auto grid size-(--badge) place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_0_0_0.5rem_rgb(88_138_44/0.15),0_0_0_1rem_rgb(88_138_44/0.07)]">
          <Check className="size-[55%]" strokeWidth={2.5} />
        </div>

        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-brand mt-[calc(var(--gap)*1.5)] text-[clamp(2.25rem,6svh,3rem)] leading-none font-extrabold tracking-[0.02em] text-deep uppercase outline-none"
        >
          You&apos;re all set!
        </h1>
        <p className="mt-2 text-[1.0625rem] text-foreground/70">Your interview is booked.</p>

        <div className="mx-auto mt-(--gap) max-w-[26rem] overflow-hidden rounded-3xl bg-white text-left shadow-[0_1px_2px_rgb(0_0_0/0.05),0_8px_24px_rgb(47_74_23/0.1)]">
          <div className="flex items-center gap-[1.125rem] px-6 py-4">
            <DateTile month={month} day={day} />
            <div>
              <p className="text-[0.8125rem] font-semibold tracking-[0.08em] text-primary uppercase">{weekday}</p>
              <p className="text-[1.625rem] leading-[1.15] font-bold tracking-tight tabular-nums">
                {formatTimeRange(booking.startTime, booking.endTime)}
              </p>
              <p className="text-sm text-muted-foreground">1 hour · In person</p>
            </div>
          </div>
          <a
            href={mapsSearchUrl(INTERVIEW_LOCATION)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 border-t border-dashed border-border px-6 py-3 font-semibold transition-colors hover:bg-mint/45"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-mint text-deep">
              <MapPin className="size-3.5" />
            </span>
            <span className="flex-1">{INTERVIEW_LOCATION}</span>
            <span className="inline-flex shrink-0 items-center gap-1 text-[0.8125rem] font-semibold text-primary">
              Open in Maps
              <span className="sr-only">(opens in a new tab)</span>
            </span>
          </a>
        </div>

        <InterviewAddToCalendarButtons
          variant="confirmation"
          booking={{
            applicantName,
            date: booking.date,
            startTime: booking.startTime,
            endTime: booking.endTime,
            manageToken: booking.manageToken,
          }}
        />

        <div className="mx-auto mt-(--gap) grid max-w-[26rem] justify-items-center gap-2 border-t border-deep/15 pt-[calc(var(--gap)*0.8)] text-sm text-foreground/60">
          <p className="flex items-center gap-2 text-left">
            <Mail className="size-4 shrink-0" />
            We&apos;ve emailed you a confirmation with these calendar links.
          </p>
          <Link
            href={`/apply/interview/manage/${booking.manageToken}`}
            className="inline-flex items-center gap-1 font-semibold text-deep underline underline-offset-[3px]"
          >
            Need to change plans? Reschedule or cancel
            <ChevronRight className="size-3.5" />
          </Link>
        </div>
      </section>
    </div>
  );
}
