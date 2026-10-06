import type { Metadata } from "next";
import { getPublicInterviewState } from "@/lib/data/interview-public";
import { InterviewBookingForm } from "./interview-booking-form";

export const metadata: Metadata = { title: "Book Your Interview" };

// Availability depends on the clock (12h lead time) and other applicants' bookings, so never serve statically.
export const dynamic = "force-dynamic";

export default async function InterviewPage() {
  const { bookingOpen, slots } = await getPublicInterviewState();

  return (
    <InterviewBookingForm
      bookingOpen={bookingOpen}
      slots={slots}
      turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
      intro={
        <>
          <h1 className="font-brand text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-5xl">
            Book your interview
          </h1>
          <p className="mt-5 max-w-xl text-lg text-foreground/70 text-pretty">
            This page is for applicants we&apos;ve invited to interview. Pick a time and use the UCSC email we contacted
            you at.
          </p>
        </>
      }
    />
  );
}
