"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { createBookingAction } from "@/actions/coffee-chat-public";
import type { PublicSlot } from "@/lib/data/coffee-chat-public";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: { sitekey: string; callback: (token: string) => void }) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

function groupByDate(slots: PublicSlot[]): Map<string, PublicSlot[]> {
  const map = new Map<string, PublicSlot[]>();
  for (const slot of slots) {
    if (!map.has(slot.date)) map.set(slot.date, []);
    map.get(slot.date)!.push(slot);
  }
  return map;
}

export function BookingForm({ slots, turnstileSiteKey }: { slots: PublicSlot[]; turnstileSiteKey: string }) {
  const [isPending, startTransition] = useTransition();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileScriptReady, setTurnstileScriptReady] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ date: string; startTime: string; endTime: string; location: string; manageToken: string } | null>(null);
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const router = useRouter();

  const byDate = useMemo(() => groupByDate(slots), [slots]);
  const dates = useMemo(() => [...byDate.keys()].sort(), [byDate]);
  const timesForSelectedDate = selectedDate ? (byDate.get(selectedDate) ?? []) : [];

  // Renders the widget once both the Turnstile script has loaded AND its
  // container div exists (the div only mounts once step 3 appears) --
  // whichever of those two happens second is what triggers the render.
  useEffect(() => {
    if (!turnstileScriptReady || !turnstileContainerRef.current || !window.turnstile) return;
    if (turnstileContainerRef.current.childElementCount > 0) return;
    turnstileWidgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
      sitekey: turnstileSiteKey,
      callback: setTurnstileToken,
    });
  }, [turnstileScriptReady, selectedSlotId, turnstileSiteKey]);

  function handleSubmit() {
    setFieldError(null);
    if (!selectedSlotId) {
      setFieldError("Pick a time first.");
      return;
    }
    if (!turnstileToken) {
      setFieldError("Please complete the verification check.");
      return;
    }

    startTransition(async () => {
      const result = await createBookingAction({ slotId: selectedSlotId, name, email, turnstileToken });
      if (result.error) {
        toast.error(result.error);
        // Turnstile tokens are single-use and the server has spent this one:
        // get a fresh challenge so retrying (e.g. a different slot) works,
        // and refresh so a slot someone else just took drops off the list.
        setTurnstileToken("");
        window.turnstile?.reset(turnstileWidgetIdRef.current ?? undefined);
        setSelectedSlotId(null);
        router.refresh();
        return;
      }
      if (result.booking) setConfirmed(result.booking);
    });
  }

  if (confirmed) {
    return (
      <div className="text-center">
        <CheckCircle2 className="mx-auto size-12 text-primary" />
        <h2 className="font-brand mt-4 text-2xl font-bold tracking-wide uppercase">You&apos;re all set!</h2>
        <p className="mt-2 text-foreground/70">
          {confirmed.date} at {confirmed.startTime}–{confirmed.endTime}, {confirmed.location}
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          We&apos;ve also emailed you a confirmation with calendar-add links and a way to cancel or reschedule.
        </p>
        <Button
          nativeButton={false}
          render={<a href={`/apply/coffee-chat/manage/${confirmed.manageToken}`} />}
          variant="outline"
          className="mt-6 gap-1.5"
        >
          Manage this booking
          <ArrowUpRight className="size-4" />
        </Button>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <p className="text-center text-foreground/70">
        No coffee chat slots are open right now -- check back soon, or follow our socials for updates.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="lazyOnload"
        onReady={() => setTurnstileScriptReady(true)}
      />

      <div>
        <h2 className="font-semibold">1. Pick a date</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {dates.map((date) => (
            <button
              key={date}
              type="button"
              onClick={() => {
                setSelectedDate(date);
                setSelectedSlotId(null);
              }}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                selectedDate === date ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"
              }`}
            >
              {date}
            </button>
          ))}
        </div>
      </div>

      {selectedDate && (
        <div>
          <h2 className="font-semibold">2. Pick a time</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {timesForSelectedDate.map((slot) => (
              <button
                key={slot.id}
                type="button"
                onClick={() => setSelectedSlotId(slot.id)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  selectedSlotId === slot.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"
                }`}
              >
                {slot.startTime}–{slot.endTime} · {slot.location}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedSlotId && (
        <div>
          <h2 className="font-semibold">3. Your details</h2>
          <FieldGroup className="mt-3 space-y-4">
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">UCSC email</FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder="you@ucsc.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </Field>
            <div ref={turnstileContainerRef} />
            <FieldError errors={fieldError ? [{ message: fieldError }] : []} />
            <Button onClick={handleSubmit} disabled={isPending} size="lg" className="w-full">
              {isPending ? "Booking..." : "Book this time"}
            </Button>
          </FieldGroup>
        </div>
      )}
    </div>
  );
}
