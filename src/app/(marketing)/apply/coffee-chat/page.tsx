import type { Metadata } from "next";
import { getOpenSlots } from "@/lib/data/coffee-chat-public";
import { BookingForm } from "./booking-form";

export const metadata: Metadata = { title: "Book a Coffee Chat" };

// Slot availability depends on the current time (minimum lead time) and on
// bookings made by other visitors, so never serve this page statically.
export const dynamic = "force-dynamic";

export default async function CoffeeChatPage() {
  const slots = await getOpenSlots();

  return (
    <BookingForm
      slots={slots}
      turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
      intro={
        <>
          <p className="text-sm font-bold tracking-wide text-primary uppercase">Recruitment</p>
          <h1 className="font-brand mt-3 text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-5xl">
            Book a coffee chat
          </h1>
          <p className="mt-5 max-w-xl text-lg text-foreground/70 text-pretty">
            A casual chat with two of our execs. Pick a time and show up.
          </p>
        </>
      }
    />
  );
}
