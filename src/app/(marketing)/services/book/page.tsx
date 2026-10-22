import type { Metadata } from "next";
import { getPublicClientMeetingState } from "@/lib/data/client-meeting-public";
import { ClientMeetingBookingForm } from "./booking-form";

export const metadata: Metadata = { title: "Book an Intro Call" };

// Availability depends on the clock (24h lead time) and other clients' bookings, so never serve statically.
export const dynamic = "force-dynamic";

export default async function BookIntroCallPage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const { lead } = await searchParams;
  const { bookingOpen, slots } = await getPublicClientMeetingState();

  return (
    <ClientMeetingBookingForm
      bookingOpen={bookingOpen}
      slots={slots}
      turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
      leadToken={typeof lead === "string" ? lead : undefined}
      intro={
        <>
          <h1 className="font-brand text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-5xl">
            Book an intro call
          </h1>
          <p className="mt-5 max-w-xl text-lg text-foreground/70 text-pretty">
            Pick a time for a 30-minute video call with our exec team. We&apos;ll
            learn about your organization and talk through how a student
            consulting team could help. It&apos;s free.
          </p>
        </>
      }
    />
  );
}
