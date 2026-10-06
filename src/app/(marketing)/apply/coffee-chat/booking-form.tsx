"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { Check, MapPin } from "lucide-react";
import { createBookingAction } from "@/actions/coffee-chat-public";
import type { PublicSlot } from "@/lib/data/coffee-chat-public";
import { formatTime12h, locationGroupsForSlot } from "@/lib/coffee-chat";
import { formatDateLong, parseLocalDate, toDateString } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { BookingConfirmation, type ConfirmedBooking } from "./booking-confirmation";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

function StepHeader({ step, title, done }: { step: number; title: string; done?: boolean }) {
  return (
    <h2 className="flex items-center gap-2.5 font-semibold">
      <span
        className={`flex size-6 items-center justify-center rounded-full text-xs font-bold ${
          done ? "bg-primary text-primary-foreground" : "border border-primary/40 text-primary"
        }`}
      >
        {done ? <Check className="size-3.5" /> : step}
      </span>
      {title}
    </h2>
  );
}

/** Page chrome for the booking step: the server-rendered intro above the mint panel. The confirmation screen replaces all of it. */
function BookingShell({ intro, children }: { intro: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-28 pb-24 sm:px-6">
      {intro}
      <div className="mint-panel mt-8 rounded-[2rem] p-5 sm:rounded-[2.5rem] sm:p-10">{children}</div>
    </div>
  );
}

export function BookingForm({ slots, turnstileSiteKey, intro }: { slots: PublicSlot[]; turnstileSiteKey: string; intro: ReactNode }) {
  const [isPending, startTransition] = useTransition();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [chosenSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [chosenLocation, setLocation] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileScriptReady, setTurnstileScriptReady] = useState(false);
  // Shown in a dialog the applicant must dismiss; the form and their inputs stay as they are.
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshOnDismiss, setRefreshOnDismiss] = useState(false);
  const [confirmed, setConfirmed] = useState<ConfirmedBooking | null>(null);
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const router = useRouter();

  // If the slot list refreshes and the chosen time is gone (someone else took
  // it), treat it as unselected instead of keeping a stale choice.
  const selectedSlotId = chosenSlotId && slots.some((s) => s.id === chosenSlotId) ? chosenSlotId : null;

  const selectedSlot = selectedSlotId ? (slots.find((s) => s.id === selectedSlotId) ?? null) : null;

  // Only cafes that are open for the chosen slot; a previously picked place
  // that isn't open for a newly chosen time is treated as unselected.
  const locationGroups = useMemo(() => (selectedSlot ? locationGroupsForSlot(selectedSlot) : []), [selectedSlot]);
  const location = locationGroups.some((g) => g.locations.some((l) => l.name === chosenLocation)) ? chosenLocation : "";

  const byDate = useMemo(() => groupByDate(slots), [slots]);
  const dates = useMemo(() => [...byDate.keys()].sort(), [byDate]);
  const availableDates = useMemo(() => new Set(dates), [dates]);
  const availableDayObjects = useMemo(() => dates.map(parseLocalDate), [dates]);
  const timesForSelectedDate = selectedDate ? (byDate.get(selectedDate) ?? []) : [];

  // Renders the widget once both the Turnstile script has loaded AND its
  // container div exists (the div only mounts once the details step appears);
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
    if (!selectedSlotId) {
      setRefreshOnDismiss(false);
      setErrorMessage("Pick a time first.");
      return;
    }
    if (!location) {
      setRefreshOnDismiss(false);
      setErrorMessage("Pick where you'd like to meet.");
      return;
    }
    if (!turnstileToken) {
      setRefreshOnDismiss(false);
      setErrorMessage("Please complete the verification check.");
      return;
    }

    startTransition(async () => {
      const result = await createBookingAction({ slotId: selectedSlotId, name, email, location, turnstileToken });
      if (result.error) {
        // Turnstile tokens are single-use and the server has spent this one:
        // get a fresh challenge so they can just fix the problem and resubmit.
        setTurnstileToken("");
        window.turnstile?.reset(turnstileWidgetIdRef.current ?? undefined);
        setRefreshOnDismiss(true);
        setErrorMessage(result.error);
        return;
      }
      if (result.booking) setConfirmed(result.booking);
    });
  }

  function handleErrorDismissed() {
    setErrorMessage(null);
    // Re-fetch the slot list in place (no page reload) so a slot someone else
    // just took disappears; name, email and selections are kept.
    if (refreshOnDismiss) router.refresh();
  }

  if (confirmed) {
    return <BookingConfirmation booking={confirmed} applicantName={name} />;
  }

  if (slots.length === 0) {
    return (
      <BookingShell intro={intro}>
        <p className="text-center text-foreground/70">
          No coffee chat times are open right now. Check back soon, or follow our socials for updates.
        </p>
      </BookingShell>
    );
  }

  return (
    <BookingShell intro={intro}>
      <div className="space-y-8">
        <AlertDialog open={errorMessage !== null} onOpenChange={(open) => !open && handleErrorDismissed()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>We couldn&apos;t book that</AlertDialogTitle>
              <AlertDialogDescription>{errorMessage}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={handleErrorDismissed}>OK</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="lazyOnload"
          onReady={() => setTurnstileScriptReady(true)}
        />

        <div className="grid gap-8 md:grid-cols-[auto_1fr]">
          <div>
            <StepHeader step={1} title="Pick a date" done={!!selectedDate} />
            <Calendar
              mode="single"
              selected={selectedDate ? parseLocalDate(selectedDate) : undefined}
              onSelect={(day) => {
                if (!day) return;
                setSelectedDate(toDateString(day));
                setSelectedSlotId(null);
              }}
              defaultMonth={availableDayObjects[0]}
              disabled={(day) => !availableDates.has(toDateString(day))}
              modifiers={{ available: availableDayObjects }}
              modifiersClassNames={{ available: "font-bold text-primary" }}
              showOutsideDays={false}
              className="mt-2 rounded-2xl border border-border bg-background [--cell-size:--spacing(10)]"
            />
          </div>

          <div>
            <StepHeader step={2} title="Pick a time" done={!!selectedSlotId} />
            {!selectedDate ? (
              <p className="mt-3 text-sm text-muted-foreground">Pick a bold date first.</p>
            ) : (
              <div className="mt-3">
                <p className="text-sm text-foreground/70">{formatDateLong(selectedDate)}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {timesForSelectedDate.map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => setSelectedSlotId(slot.id)}
                      className={`rounded-xl border px-3 py-2.5 text-sm font-medium tabular-nums transition-colors ${
                        selectedSlotId === slot.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"
                      }`}
                    >
                      {formatTime12h(slot.startTime)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {selectedSlotId && (
          <div>
            <StepHeader step={3} title="Your details" />
            {selectedSlot && (
              <div className="mt-3 flex items-start gap-3 rounded-2xl border border-primary/30 bg-background p-4">
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="text-sm">
                  <p className="font-semibold">
                    {formatDateLong(selectedSlot.date)}, {formatTime12h(selectedSlot.startTime)} to {formatTime12h(selectedSlot.endTime)}
                  </p>
                  {location !== "" && <p className="text-foreground/70">{location}</p>}
                </div>
              </div>
            )}
            <FieldGroup className="mt-4 space-y-4">
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
              <Field>
                <FieldLabel>Where would you like to meet?</FieldLabel>
                <div className="space-y-3">
                  {locationGroups.map((group) => (
                    <div key={group.label}>
                      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group.label}</p>
                      <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                        {group.locations.map((option) => (
                          <button
                            key={option.name}
                            type="button"
                            onClick={() => setLocation(option.name)}
                            className={`rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                              location === option.name ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"
                            }`}
                          >
                            {option.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Field>
              <div ref={turnstileContainerRef} />
              <Button onClick={handleSubmit} disabled={isPending} size="lg" className="w-full">
                {isPending ? "Booking..." : "Book this time"}
              </Button>
            </FieldGroup>
          </div>
        )}
      </div>
    </BookingShell>
  );
}
