"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { Check, CircleAlert } from "lucide-react";
import { createBookingAction } from "@/actions/coffee-chat-public";
import type { PublicSlot } from "@/lib/data/coffee-chat-public";
import { formatTime12h, isValidUcscEmail, locationGroupsForSlot, openUntilLabel } from "@/lib/coffee-chat";
import { formatDateParts, parseLocalDate, toDateString } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookingConfirmation, type ConfirmedBooking } from "./booking-confirmation";

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: { sitekey: string; callback: (token: string) => void }) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

const DEFAULT_LOCATION_TAB = "On campus";
// A day with more times than this is split into morning and afternoon.
const SPLIT_TIMES_AFTER = 6;

function groupByDate(slots: PublicSlot[]): Map<string, PublicSlot[]> {
  const map = new Map<string, PublicSlot[]>();
  for (const slot of slots) {
    if (!map.has(slot.date)) map.set(slot.date, []);
    map.get(slot.date)!.push(slot);
  }
  return map;
}

/** Page chrome for the booking step: the server-rendered intro above the mint panel. The confirmation screen replaces all of it. */
function BookingShell({ intro, children }: { intro: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-28 pb-24 sm:px-6">
      {intro}
      {/* The brand green is 4.1:1 against white, under the 4.5:1 that small text needs, so this page's filled controls use a darker shade. */}
      <div className="mint-panel mt-8 rounded-[2rem] p-5 [--primary:#4b7a22] sm:rounded-[2.5rem] sm:p-10">{children}</div>
    </div>
  );
}

/** A radio that looks like a button: the native input stays (hidden) so arrow keys, Tab and screen readers work as they do for any radio group. */
function ChoiceRadio({
  name,
  value,
  checked,
  onSelect,
  className,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className="relative block cursor-pointer">
      <input type="radio" name={name} value={value} checked={checked} onChange={onSelect} className="peer sr-only" />
      <span
        className={cn(
          "flex border border-border bg-white transition-colors hover:bg-muted peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-foreground",
          className,
        )}
      >
        {children}
      </span>
    </label>
  );
}

function TimeChips({ slots, selectedSlotId, onSelect }: { slots: PublicSlot[]; selectedSlotId: string | null; onSelect: (id: string) => void }) {
  const chip = (slot: PublicSlot) => {
    const checked = selectedSlotId === slot.id;
    return (
      <ChoiceRadio
        key={slot.id}
        name="slot"
        value={slot.id}
        checked={checked}
        onSelect={() => onSelect(slot.id)}
        className={cn(
          "h-11 items-center justify-center gap-1.5 rounded-xl text-sm tabular-nums",
          checked && "border-primary bg-primary font-bold text-primary-foreground hover:bg-primary",
        )}
      >
        {checked && <Check className="size-4" strokeWidth={3} aria-hidden />}
        {formatTime12h(slot.startTime)}
      </ChoiceRadio>
    );
  };

  if (slots.length <= SPLIT_TIMES_AFTER) {
    return <div className="grid grid-cols-3 gap-1.5">{slots.map(chip)}</div>;
  }
  const morning = slots.filter((s) => s.startTime < "12:00");
  const afternoon = slots.filter((s) => s.startTime >= "12:00");
  // A day that is all one half needs no heading.
  if (morning.length === 0 || afternoon.length === 0) {
    return <div className="grid grid-cols-3 gap-1.5">{slots.map(chip)}</div>;
  }
  return (
    <div className="space-y-3">
      {[
        ["Morning", morning],
        ["Afternoon", afternoon],
      ].map(
        ([label, group]) =>
          (group as PublicSlot[]).length > 0 && (
            <div key={label as string}>
              <p className="mb-1.5 text-xs text-muted-foreground">{label as string}</p>
              <div className="grid grid-cols-3 gap-1.5">{(group as PublicSlot[]).map(chip)}</div>
            </div>
          ),
      )}
    </div>
  );
}

function FieldMessage({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-red-700">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

// dark:bg-white because the marketing site is always light but the app-wide .dark class can still be on <html>.
const inputClass = "h-11 border-neutral-500 bg-white px-3 text-base md:text-base dark:bg-white";

type Errors = { slot?: string; location?: string; name?: string; email?: string; verification?: string };

export function BookingForm({ slots, turnstileSiteKey, intro }: { slots: PublicSlot[]; turnstileSiteKey: string; intro: ReactNode }) {
  const [isPending, startTransition] = useTransition();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [chosenSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [chosenLocation, setLocation] = useState("");
  const [locationTab, setLocationTab] = useState(DEFAULT_LOCATION_TAB);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileScriptReady, setTurnstileScriptReady] = useState(false);
  // Field errors show once a field has been left, or once the applicant has tried to submit.
  const [touched, setTouched] = useState<{ name?: boolean; email?: boolean }>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  // Problems from the server (a slot taken, a duplicate booking). Shown at the top, since the form below may no longer exist.
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedBooking | null>(null);
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const noticeRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  // If the slot list refreshes and the chosen time is gone (someone else took
  // it), treat it as unselected instead of keeping a stale choice.
  const selectedSlotId = chosenSlotId && slots.some((s) => s.id === chosenSlotId) ? chosenSlotId : null;

  const selectedSlot = selectedSlotId ? (slots.find((s) => s.id === selectedSlotId) ?? null) : null;

  // Only cafes that are open for the chosen slot; a previously picked place
  // that isn't open for a newly chosen time is treated as unselected.
  const locationGroups = useMemo(() => (selectedSlot ? locationGroupsForSlot(selectedSlot) : []), [selectedSlot]);
  const location = locationGroups.some((g) => g.locations.some((l) => l.name === chosenLocation)) ? chosenLocation : "";
  const activeTab = locationGroups.some((g) => g.tab === locationTab) ? locationTab : (locationGroups[0]?.tab ?? DEFAULT_LOCATION_TAB);

  const byDate = useMemo(() => groupByDate(slots), [slots]);
  const dates = useMemo(() => [...byDate.keys()].sort(), [byDate]);
  const availableDates = useMemo(() => new Set(dates), [dates]);
  const availableDayObjects = useMemo(() => dates.map(parseLocalDate), [dates]);
  // Different exec pairs can offer the same start time; the applicant only needs to see each time once.
  const timesForSelectedDate = useMemo(() => {
    const seen = new Set<string>();
    return (selectedDate ? (byDate.get(selectedDate) ?? []) : []).filter((s) => !seen.has(s.startTime) && seen.add(s.startTime));
  }, [selectedDate, byDate]);
  const selectedParts = selectedDate ? formatDateParts(selectedDate) : null;

  const errors: Errors = {};
  if (!selectedSlotId) errors.slot = "Pick a time.";
  if (!location) errors.location = "Pick where you'd like to meet.";
  if (!name.trim()) errors.name = "Enter your name.";
  if (!email.trim()) errors.email = "Enter your UCSC email.";
  else if (!isValidUcscEmail(email)) errors.email = "Use your @ucsc.edu address.";
  if (!turnstileToken) errors.verification = "Complete the verification check.";
  const showName = (touched.name || submitAttempted) && errors.name;
  const showEmail = (touched.email || submitAttempted) && errors.email;
  const showLocation = submitAttempted && errors.location;
  const showVerification = submitAttempted && errors.verification;

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

  function focusFirstProblem() {
    const target = errors.slot
      ? document.querySelector<HTMLElement>('input[name="slot"]')
      : errors.location
        ? document.querySelector<HTMLElement>('input[name="location"]')
        : errors.name
          ? document.getElementById("name")
          : errors.email
            ? document.getElementById("email")
            : turnstileContainerRef.current;
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    if (target instanceof HTMLInputElement) target.focus({ preventScroll: true });
  }

  function handleSubmit() {
    setSubmitAttempted(true);
    setServerError(null);
    if (Object.keys(errors).length > 0 || !selectedSlotId) {
      // The state update above hasn't rendered yet, but the messages exist by the time focus lands.
      focusFirstProblem();
      return;
    }

    startTransition(async () => {
      const result = await createBookingAction({ slotId: selectedSlotId, name, email, location, turnstileToken });
      if (result.error) {
        // Turnstile tokens are single-use and the server has spent this one:
        // get a fresh challenge so they can just fix the problem and resubmit.
        setTurnstileToken("");
        window.turnstile?.reset(turnstileWidgetIdRef.current ?? undefined);
        setServerError(result.error);
        // Re-fetch the slot list in place (no page reload) so a slot someone else
        // just took disappears; name, email and selections are kept.
        router.refresh();
        noticeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
      if (result.booking) setConfirmed(result.booking);
    });
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

  const bookLabel = selectedSlot && selectedParts ? `Book ${selectedParts.weekday.slice(0, 3)}, ${selectedParts.month} ${selectedParts.day} at ${formatTime12h(selectedSlot.startTime)}` : "Book this chat";

  return (
    <BookingShell intro={intro}>
      <div className="space-y-8">
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="lazyOnload"
          onReady={() => setTurnstileScriptReady(true)}
        />

        <div ref={noticeRef} role="alert" className={serverError ? "flex items-start gap-2.5 rounded-2xl border-2 border-red-700 bg-white p-4 text-red-800" : "hidden"}>
          {serverError && (
            <>
              <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
              <p className="font-medium">{serverError}</p>
            </>
          )}
        </div>

        <div className="grid gap-8 md:grid-cols-[19rem_1fr]">
          <div>
            <h2 className="sr-only">Pick a date and time</h2>
            <Calendar
              mode="single"
              selected={selectedDate ? parseLocalDate(selectedDate) : undefined}
              onSelect={(day) => {
                if (!day) return;
                setSelectedDate(toDateString(day));
                setSelectedSlotId(null);
                setServerError(null);
              }}
              defaultMonth={availableDayObjects[0]}
              disabled={(day) => !availableDates.has(toDateString(day))}
              modifiers={{ available: availableDayObjects }}
              classNames={{ today: "rounded-(--cell-radius)" }}
              components={{
                DayButton: (props) => (
                  <CalendarDayButton
                    {...props}
                    className={cn(
                      props.modifiers.available && "bg-primary/10 font-semibold text-deep",
                      props.modifiers.today && "ring-[1.5px] ring-deep ring-inset",
                      "group-data-[focused=true]/day:ring-foreground data-[selected-single=true]:hover:bg-primary data-[selected-single=true]:hover:text-primary-foreground",
                    )}
                  >
                    {props.children}
                    {props.modifiers.available && (
                      <i aria-hidden className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-primary opacity-100! group-data-[selected=true]/day:bg-white" />
                    )}
                  </CalendarDayButton>
                ),
              }}
              showOutsideDays={false}
              className="w-full rounded-2xl bg-white shadow-[0_1px_2px_rgb(0_0_0/0.05),0_6px_18px_rgb(47_74_23/0.08)] [--cell-size:--spacing(8)] min-[360px]:[--cell-size:--spacing(10)]"
            />
            <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <i aria-hidden className="size-3 rounded border border-primary/30 bg-primary/10" />
                Open times
              </span>
              <span className="flex items-center gap-1.5">
                <i aria-hidden className="size-3 rounded border border-border" />
                Nothing open
              </span>
            </p>
          </div>

          <div>
            <div>
              {!selectedDate || !selectedParts ? (
                <p className="px-1 text-sm text-muted-foreground">Pick a shaded day to see its times.</p>
              ) : (
                <fieldset>
                  <legend className="sr-only">
                    Times on {selectedParts.weekday}, {selectedParts.month} {selectedParts.day}
                  </legend>
                  <div className="mb-2 flex items-baseline justify-between px-1" aria-hidden>
                    <span className="font-bold">
                      {selectedParts.weekday}, {selectedParts.month} {selectedParts.day}
                    </span>
                    <span className="text-xs text-muted-foreground">Pacific Time</span>
                  </div>
                  <TimeChips
                    slots={timesForSelectedDate}
                    selectedSlotId={selectedSlotId}
                    onSelect={(id) => {
                      setSelectedSlotId(id);
                      setServerError(null);
                    }}
                  />
                </fieldset>
              )}
            </div>
          </div>
        </div>

        {selectedSlot && (
          <>
            <fieldset id="where" aria-describedby={showLocation ? "where-error" : undefined}>
              <legend className="text-base font-bold">Where should we meet?</legend>
              <p className="mt-0.5 mb-3 text-sm text-muted-foreground">Showing places open at {formatTime12h(selectedSlot.startTime)}.</p>
              <Tabs value={activeTab} onValueChange={(value) => setLocationTab(String(value))}>
                <TabsList className="h-auto w-full bg-white/70 sm:w-fit group-data-horizontal/tabs:h-auto">
                  {locationGroups.map((group) => {
                    const hasChoice = group.locations.some((l) => l.name === location);
                    return (
                      <TabsTrigger key={group.tab} value={group.tab} className="h-11 px-4 py-2 text-sm font-semibold dark:text-foreground/60 dark:data-active:border-transparent dark:data-active:bg-white dark:data-active:text-foreground">
                        {group.tab}
                        <span className="font-normal text-muted-foreground">{group.locations.length}</span>
                        {hasChoice && <Check className="size-3.5 text-primary" strokeWidth={3} aria-label="Contains your choice" />}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
                {locationGroups.map((group) => (
                  <TabsContent key={group.tab} value={group.tab} className="mt-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {group.locations.map((option) => {
                        const checked = location === option.name;
                        const hours = openUntilLabel(option, selectedSlot.date);
                        return (
                          <ChoiceRadio
                            key={option.name}
                            name="location"
                            value={option.name}
                            checked={checked}
                            onSelect={() => setLocation(option.name)}
                            className={cn("min-h-14 items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5", checked && "border-primary bg-primary/10 ring-1 ring-primary")}
                          >
                            <span>
                              <span className="block text-sm font-semibold">{option.name}</span>
                              {hours && <span className="block text-xs text-muted-foreground">{hours}</span>}
                            </span>
                            <span className={cn("grid size-5.5 shrink-0 place-items-center rounded-full border-[1.5px] border-neutral-400", checked && "border-primary bg-primary text-primary-foreground")} aria-hidden>
                              {checked && <Check className="size-3.5" strokeWidth={3} />}
                            </span>
                          </ChoiceRadio>
                        );
                      })}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
              {showLocation && <FieldMessage id="where-error">{errors.location}</FieldMessage>}
            </fieldset>

            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
            >
              <h2 className="text-base font-bold">Your details</h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="name" className="mb-1.5 block text-sm font-semibold">
                    Name
                  </label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                    autoComplete="name"
                    aria-invalid={showName ? true : undefined}
                    aria-describedby={showName ? "name-error" : undefined}
                    className={cn(inputClass, showName && "border-2 border-red-700")}
                  />
                  {showName && <FieldMessage id="name-error">{errors.name}</FieldMessage>}
                </div>
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-semibold">
                    UCSC email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    placeholder="you@ucsc.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                    autoComplete="email"
                    aria-invalid={showEmail ? true : undefined}
                    aria-describedby={showEmail ? "email-error" : undefined}
                    className={cn(inputClass, showEmail && "border-2 border-red-700")}
                  />
                  {showEmail && <FieldMessage id="email-error">{errors.email}</FieldMessage>}
                </div>
              </div>

              <div ref={turnstileContainerRef} className="mt-4 empty:hidden" />
              {showVerification && <FieldMessage id="verification-error">{errors.verification}</FieldMessage>}

              <Button type="submit" disabled={isPending} size="lg" className="mt-5 h-12 w-full rounded-2xl text-base font-bold">
                {isPending ? "Booking..." : bookLabel}
              </Button>
              <p className="mt-2.5 text-center text-sm text-muted-foreground">
                You&apos;ll get a confirmation email with a link to reschedule or cancel.
              </p>
            </form>
          </>
        )}
      </div>
    </BookingShell>
  );
}
