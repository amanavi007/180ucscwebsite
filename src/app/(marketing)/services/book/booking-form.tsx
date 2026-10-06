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
import { createClientMeetingAction } from "@/actions/client-meeting-public";
import type { PublicClientMeetingSlot } from "@/lib/data/client-meeting-public";
import { formatTime12h } from "@/lib/coffee-chat";
import {
  MAX_NEEDS,
  validateClientMeetingInput,
} from "@/lib/client-meeting";
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
} from "../../apply/coffee-chat/booking-form";
import {
  ClientMeetingConfirmation,
  type ConfirmedClientMeeting,
} from "./confirmation";

type Errors = {
  slot?: string;
  contactName?: string;
  businessName?: string;
  email?: string;
  phone?: string;
  needs?: string;
  verification?: string;
};

type Fields = {
  contactName: string;
  businessName: string;
  email: string;
  phone: string;
  needs: string;
};

const VALID: Fields = {
  contactName: "x",
  businessName: "x",
  email: "a@b.co",
  phone: "",
  needs: "x",
};

// validateClientMeetingInput reports one error at a time, so check each field against otherwise-valid values.
function fieldError(fields: Fields, key: keyof Fields): string | undefined {
  const result = validateClientMeetingInput({ ...VALID, [key]: fields[key] });
  return "error" in result ? result.error : undefined;
}

export function ClientMeetingBookingForm({
  bookingOpen,
  slots,
  turnstileSiteKey,
  intro,
}: {
  bookingOpen: boolean;
  slots: PublicClientMeetingSlot[];
  turnstileSiteKey: string;
  intro: ReactNode;
}) {
  const [isPending, startTransition] = useTransition();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [chosenSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [contactName, setContactName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [needs, setNeeds] = useState("");
  const [rescheduleFromToken, setRescheduleFromToken] = useState<
    string | undefined
  >(undefined);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileScriptReady, setTurnstileScriptReady] = useState(false);
  const [touched, setTouched] = useState<
    Partial<Record<keyof Fields, boolean>>
  >({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedClientMeeting | null>(null);
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const noticeRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  // Arriving from "Reschedule": the manage page stashed their details so they don't retype them.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("clientMeetingReschedule");
      if (!saved) return;
      sessionStorage.removeItem("clientMeetingReschedule");
      const parsed = JSON.parse(saved) as Partial<Fields> & { token?: string };
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time prefill from sessionStorage, which can't be read during render
      if (parsed.contactName) setContactName(parsed.contactName);
      if (parsed.businessName) setBusinessName(parsed.businessName);
      if (parsed.email) setEmail(parsed.email);
      if (parsed.phone) setPhone(parsed.phone);
      if (parsed.needs) setNeeds(parsed.needs);
      if (parsed.token) setRescheduleFromToken(parsed.token);
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
    const map = new Map<string, PublicClientMeetingSlot[]>();
    for (const slot of slots) {
      if (!map.has(slot.date)) map.set(slot.date, []);
      map.get(slot.date)!.push(slot);
    }
    return map;
  }, [slots]);
  const dates = useMemo(() => [...byDate.keys()].sort(), [byDate]);
  const availableDates = useMemo(() => new Set(dates), [dates]);
  const availableDayObjects = useMemo(() => dates.map(parseLocalDate), [dates]);
  // Slots are one per time; dedupe defensively by start time.
  const timesForSelectedDate = useMemo(() => {
    const seen = new Set<string>();
    return (selectedDate ? (byDate.get(selectedDate) ?? []) : []).filter(
      (s) => !seen.has(s.startTime) && seen.add(s.startTime),
    );
  }, [selectedDate, byDate]);
  const selectedParts = selectedDate ? formatDateParts(selectedDate) : null;

  const errors: Errors = {};
  if (!selectedSlotId) errors.slot = "Pick a time.";
  const fields: Fields = { contactName, businessName, email, phone, needs };
  for (const key of [
    "contactName",
    "businessName",
    "email",
    "phone",
    "needs",
  ] as const) {
    const message = fieldError(fields, key);
    if (message) errors[key] = message;
  }
  if (!turnstileToken) errors.verification = "Complete the verification check.";
  const show = (key: keyof Fields) =>
    (touched[key] || submitAttempted) && errors[key];
  const showName = show("contactName");
  const showBusiness = show("businessName");
  const showEmail = show("email");
  const showPhone = show("phone");
  const showNeeds = show("needs");
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
      : errors.contactName
        ? document.getElementById("contactName")
        : errors.businessName
          ? document.getElementById("businessName")
          : errors.email
            ? document.getElementById("email")
            : errors.phone
              ? document.getElementById("phone")
              : errors.needs
                ? document.getElementById("needs")
                : turnstileContainerRef.current;
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    if (target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement)
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
      const result = await createClientMeetingAction({
        slotId: selectedSlotId,
        contactName,
        businessName,
        email,
        phone,
        needs,
        turnstileToken,
        rescheduleFromToken,
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
      if (result.booking)
        setConfirmed({ ...result.booking, businessName, contactName });
    });
  }

  if (confirmed)
    return <ClientMeetingConfirmation booking={confirmed} />;

  if (!bookingOpen || slots.length === 0) {
    return (
      <BookingShell intro={intro}>
        <p className="text-center text-foreground/70">
          Booking is closed right now. Check back soon or contact us.
        </p>
      </BookingShell>
    );
  }

  const bookLabel =
    selectedSlot && selectedParts
      ? `Book ${selectedParts.weekday.slice(0, 3)}, ${selectedParts.month} ${selectedParts.day} at ${formatTime12h(selectedSlot.startTime)}`
      : "Book this intro call";

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
                  30-minute video call
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
                  htmlFor="contactName"
                  className="mb-1.5 block text-sm font-semibold"
                >
                  Your name
                </label>
                <Input
                  id="contactName"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, contactName: true }))}
                  autoComplete="name"
                  aria-invalid={showName ? true : undefined}
                  aria-describedby={showName ? "contactName-error" : undefined}
                  className={cn(
                    inputClass,
                    showName && "border-2 border-red-700",
                  )}
                />
                {showName && (
                  <FieldMessage id="contactName-error">{errors.contactName}</FieldMessage>
                )}
              </div>
              <div>
                <label
                  htmlFor="businessName"
                  className="mb-1.5 block text-sm font-semibold"
                >
                  Business or organization
                </label>
                <Input
                  id="businessName"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, businessName: true }))}
                  autoComplete="organization"
                  aria-invalid={showBusiness ? true : undefined}
                  aria-describedby={showBusiness ? "businessName-error" : undefined}
                  className={cn(
                    inputClass,
                    showBusiness && "border-2 border-red-700",
                  )}
                />
                {showBusiness && (
                  <FieldMessage id="businessName-error">{errors.businessName}</FieldMessage>
                )}
              </div>
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-sm font-semibold"
                >
                  Email
                </label>
                <Input
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                  type="email"
                  inputMode="email"
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
              <div>
                <label
                  htmlFor="phone"
                  className="mb-1.5 block text-sm font-semibold"
                >
                  Phone (optional)
                </label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  aria-invalid={showPhone ? true : undefined}
                  aria-describedby={showPhone ? "phone-error" : undefined}
                  className={cn(
                    inputClass,
                    showPhone && "border-2 border-red-700",
                  )}
                />
                {showPhone && (
                  <FieldMessage id="phone-error">{errors.phone}</FieldMessage>
                )}
              </div>
              <div className="sm:col-span-2">
                <label
                  htmlFor="needs"
                  className="mb-1.5 block text-sm font-semibold"
                >
                  What would you like help with?
                </label>
                <textarea
                  id="needs"
                  rows={5}
                  maxLength={MAX_NEEDS}
                  value={needs}
                  onChange={(e) => setNeeds(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, needs: true }))}
                  aria-invalid={showNeeds ? true : undefined}
                  aria-describedby={
                    showNeeds ? "needs-error needs-count" : "needs-count"
                  }
                  className={cn(
                    inputClass,
                    "h-auto min-h-28 w-full py-2",
                    showNeeds && "border-2 border-red-700",
                  )}
                />
                <p
                  id="needs-count"
                  className="mt-1 text-right text-xs text-muted-foreground tabular-nums"
                >
                  {needs.length}/{MAX_NEEDS}
                </p>
                {showNeeds && (
                  <FieldMessage id="needs-error">{errors.needs}</FieldMessage>
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
              cancel (up to 12 hours before).
            </p>
          </form>
        )}
      </div>
    </BookingShell>
  );
}
