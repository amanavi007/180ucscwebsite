"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { CircleAlert, Video } from "lucide-react";
import { createInterviewBookingAction } from "@/actions/interview-public";
import type { PublicInterviewSlot } from "@/lib/data/interview-public";
import { formatTime12h, isValidUcscEmail } from "@/lib/coffee-chat";
import { INTERVIEW_LOCATION } from "@/lib/interview";
import { formatDateParts, parseLocalDate, toDateString } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  BookingShell,
  FieldMessage,
  TimeChips,
  inputClass,
} from "../coffee-chat/booking-form";
import {
  InterviewConfirmation,
  type ConfirmedInterview,
} from "./interview-confirmation";

type Errors = {
  slot?: string;
  name?: string;
  email?: string;
  verification?: string;
};

export function InterviewBookingForm({
  bookingOpen,
  slots,
  turnstileSiteKey,
  intro,
}: {
  bookingOpen: boolean;
  slots: PublicInterviewSlot[];
  turnstileSiteKey: string;
  intro: ReactNode;
}) {
  const [isPending, startTransition] = useTransition();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [chosenSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileScriptReady, setTurnstileScriptReady] = useState(false);
  const [touched, setTouched] = useState<{ name?: boolean; email?: boolean }>(
    {},
  );
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedInterview | null>(null);
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const noticeRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  // Arriving from "Reschedule": the manage page stashed their details so they don't retype them.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("interview-prefill");
      if (!saved) return;
      sessionStorage.removeItem("interview-prefill");
      const parsed = JSON.parse(saved) as { name?: string; email?: string };
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time prefill from sessionStorage, which can't be read during render
      if (parsed.name) setName(parsed.name);
      if (parsed.email) setEmail(parsed.email);
    } catch {
      // Storage unavailable or corrupt: leave the fields empty.
    }
  }, []);

  // If the list refreshes and the chosen time is gone (someone took it), treat it as unselected.
  const selectedSlotId =
    chosenSlotId && slots.some((s) => s.id === chosenSlotId)
      ? chosenSlotId
      : null;
  const selectedSlot = selectedSlotId
    ? (slots.find((s) => s.id === selectedSlotId) ?? null)
    : null;

  const byDate = useMemo(() => {
    const map = new Map<string, PublicInterviewSlot[]>();
    for (const slot of slots) {
      if (!map.has(slot.date)) map.set(slot.date, []);
      map.get(slot.date)!.push(slot);
    }
    return map;
  }, [slots]);
  const dates = useMemo(() => [...byDate.keys()].sort(), [byDate]);
  const availableDates = useMemo(() => new Set(dates), [dates]);
  const availableDayObjects = useMemo(() => dates.map(parseLocalDate), [dates]);
  // Several panels can share a start time; the applicant only needs each time once (the server assigns the panel).
  const timesForSelectedDate = useMemo(() => {
    const seen = new Set<string>();
    return (selectedDate ? (byDate.get(selectedDate) ?? []) : []).filter(
      (s) => !seen.has(s.startTime) && seen.add(s.startTime),
    );
  }, [selectedDate, byDate]);
  const selectedParts = selectedDate ? formatDateParts(selectedDate) : null;

  const errors: Errors = {};
  if (!selectedSlotId) errors.slot = "Pick a time.";
  if (!name.trim()) errors.name = "Enter your name.";
  if (!email.trim()) errors.email = "Enter your UCSC email.";
  else if (!isValidUcscEmail(email))
    errors.email = "Use your @ucsc.edu address.";
  if (!turnstileToken) errors.verification = "Complete the verification check.";
  const showName = (touched.name || submitAttempted) && errors.name;
  const showEmail = (touched.email || submitAttempted) && errors.email;
  const showVerification = submitAttempted && errors.verification;

  // Render the Turnstile widget once both the script has loaded and its container exists.
  useEffect(() => {
    if (
      !turnstileScriptReady ||
      !turnstileContainerRef.current ||
      !window.turnstile
    )
      return;
    if (turnstileContainerRef.current.childElementCount > 0) return;
    turnstileWidgetIdRef.current = window.turnstile.render(
      turnstileContainerRef.current,
      {
        sitekey: turnstileSiteKey,
        callback: setTurnstileToken,
      },
    );
  }, [turnstileScriptReady, selectedSlotId, turnstileSiteKey]);

  function focusFirstProblem() {
    const target = errors.slot
      ? document.querySelector<HTMLElement>('input[name="slot"]')
      : errors.name
        ? document.getElementById("name")
        : errors.email
          ? document.getElementById("email")
          : turnstileContainerRef.current;
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    if (target instanceof HTMLInputElement)
      target.focus({ preventScroll: true });
  }

  function handleSubmit() {
    setSubmitAttempted(true);
    setServerError(null);
    if (Object.keys(errors).length > 0 || !selectedSlotId) {
      focusFirstProblem();
      return;
    }

    startTransition(async () => {
      const result = await createInterviewBookingAction({
        slotId: selectedSlotId,
        name,
        email,
        turnstileToken,
      });
      if (result.error) {
        // Turnstile tokens are single-use and the server has spent this one: get a fresh challenge.
        setTurnstileToken("");
        window.turnstile?.reset(turnstileWidgetIdRef.current ?? undefined);
        setServerError(result.error);
        router.refresh();
        noticeRef.current?.scrollIntoView({
          block: "center",
          behavior: "smooth",
        });
        return;
      }
      if (result.booking) setConfirmed(result.booking);
    });
  }

  if (confirmed)
    return <InterviewConfirmation booking={confirmed} applicantName={name} />;

  if (!bookingOpen || slots.length === 0) {
    return (
      <BookingShell intro={intro}>
        <p className="text-center text-foreground/70">
          {bookingOpen
            ? "No interview times are open right now. Check back soon, or reply to the email we sent you."
            : "Interview booking isn't open yet. We'll email you when it is."}
        </p>
      </BookingShell>
    );
  }

  const bookLabel =
    selectedSlot && selectedParts
      ? `Book ${selectedParts.weekday.slice(0, 3)}, ${selectedParts.month} ${selectedParts.day} at ${formatTime12h(selectedSlot.startTime)}`
      : "Book this interview";

  return (
    <BookingShell intro={intro}>
      <div className="space-y-8">
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="lazyOnload"
          onReady={() => setTurnstileScriptReady(true)}
        />

        <div
          ref={noticeRef}
          role="alert"
          className={
            serverError
              ? "flex items-start gap-2.5 rounded-2xl border-2 border-red-700 bg-white p-4 text-red-800"
              : "hidden"
          }
        >
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
                      props.modifiers.available &&
                        "bg-primary/10 font-semibold text-deep",
                      props.modifiers.today &&
                        "ring-[1.5px] ring-deep ring-inset",
                      "group-data-[focused=true]/day:ring-foreground data-[selected-single=true]:hover:bg-primary data-[selected-single=true]:hover:text-primary-foreground",
                    )}
                  >
                    {props.children}
                    {props.modifiers.available && (
                      <i
                        aria-hidden
                        className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-primary opacity-100! group-data-[selected=true]/day:bg-white"
                      />
                    )}
                  </CalendarDayButton>
                ),
              }}
              showOutsideDays={false}
              className="w-full rounded-2xl bg-white shadow-[0_1px_2px_rgb(0_0_0/0.05),0_6px_18px_rgb(47_74_23/0.08)] [--cell-size:--spacing(8)] min-[360px]:[--cell-size:--spacing(10)]"
            />
            <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <i
                  aria-hidden
                  className="size-3 rounded border border-primary/30 bg-primary/10"
                />
                Open times
              </span>
              <span className="flex items-center gap-1.5">
                <i
                  aria-hidden
                  className="size-3 rounded border border-border"
                />
                Nothing open
              </span>
            </p>
          </div>

          <div>
            {!selectedDate || !selectedParts ? (
              <p className="px-1 text-sm text-muted-foreground">
                Pick a shaded day to see its times.
              </p>
            ) : (
              <fieldset>
                <legend className="sr-only">
                  Times on {selectedParts.weekday}, {selectedParts.month}{" "}
                  {selectedParts.day}
                </legend>
                <div
                  className="mb-2 flex items-baseline justify-between px-1"
                  aria-hidden
                >
                  <span className="font-bold">
                    {selectedParts.weekday}, {selectedParts.month}{" "}
                    {selectedParts.day}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Pacific Time
                  </span>
                </div>
                <TimeChips
                  slots={timesForSelectedDate}
                  selectedSlotId={selectedSlotId}
                  onSelect={(id) => {
                    setSelectedSlotId(id);
                    setServerError(null);
                  }}
                />
                <p className="mt-3 flex items-center gap-1.5 px-1 text-sm text-muted-foreground">
                  <Video className="size-4" aria-hidden />
                  {INTERVIEW_LOCATION} · 1 hour
                </p>
              </fieldset>
            )}
          </div>
        </div>

        {selectedSlot && (
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
                <label
                  htmlFor="name"
                  className="mb-1.5 block text-sm font-semibold"
                >
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
                  className={cn(
                    inputClass,
                    showName && "border-2 border-red-700",
                  )}
                />
                {showName && (
                  <FieldMessage id="name-error">{errors.name}</FieldMessage>
                )}
              </div>
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-sm font-semibold"
                >
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
                  className={cn(
                    inputClass,
                    showEmail && "border-2 border-red-700",
                  )}
                />
                {showEmail && (
                  <FieldMessage id="email-error">{errors.email}</FieldMessage>
                )}
              </div>
            </div>

            <div ref={turnstileContainerRef} className="mt-4 empty:hidden" />
            {showVerification && (
              <FieldMessage id="verification-error">
                {errors.verification}
              </FieldMessage>
            )}

            <Button
              type="submit"
              disabled={isPending}
              size="lg"
              className="mt-5 h-12 w-full rounded-2xl text-base font-bold"
            >
              {isPending ? "Booking..." : bookLabel}
            </Button>
            <p className="mt-2.5 text-center text-sm text-muted-foreground">
              You&apos;ll get a confirmation email with a link to reschedule or
              cancel (up to 24 hours before).
            </p>
          </form>
        )}
      </div>
    </BookingShell>
  );
}
