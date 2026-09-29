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
    <div className="mx-auto max-w-3xl px-4 pt-14 pb-24 sm:px-6">
      <p className="text-sm font-bold tracking-wide text-primary uppercase">Recruitment</p>
      <h1 className="font-brand mt-3 text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-5xl">
        Book a coffee chat
      </h1>
      <p className="mt-5 max-w-xl text-lg text-foreground/70 text-pretty">
        A casual chat with two of our execs. Pick a time and show up.
      </p>
      <ul className="mt-5 flex flex-wrap gap-2 text-sm font-medium">
        {["20 minutes", "In person", "No prep needed"].map((fact) => (
          <li key={fact} className="rounded-full bg-mint px-3 py-1 text-foreground/80">
            {fact}
          </li>
        ))}
      </ul>

      <div className="mint-panel mt-8 rounded-[2rem] p-5 sm:rounded-[2.5rem] sm:p-10">
        <BookingForm slots={slots} turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!} />
      </div>
    </div>
  );
}
