"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_MIN_LEAD_MINUTES, locationGroupsForSlot, isSlotBookable, isValidUcscEmail, normalizeTime } from "@/lib/coffee-chat";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { buildBookingConfirmationEmail } from "@/lib/email/coffee-chat-confirmation";
import { sendEmail } from "@/lib/email/send";
import { notifyExecsOfBooking } from "@/lib/email/notify-execs";

const UNIQUE_VIOLATION = "23505";

export interface CreateBookingInput {
  slotId: string;
  name: string;
  email: string;
  location: string;
  turnstileToken: string;
}

export interface CreateBookingResult {
  error?: string;
  booking?: { manageToken: string; date: string; startTime: string; endTime: string; location: string };
}

async function sendConfirmationEmail(params: {
  email: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  manageToken: string;
}): Promise<void> {
  const content = buildBookingConfirmationEmail({
    applicantName: params.name,
    date: params.date,
    startTime: params.startTime,
    endTime: params.endTime,
    location: params.location,
    manageToken: params.manageToken,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL!,
  });
  try {
    await sendEmail({ to: params.email, subject: content.subject, html: content.html, text: content.text });
  } catch (emailError) {
    // The booking already succeeded and is shown on-screen -- a failed
    // confirmation email shouldn't make the applicant think booking failed.
    console.error("coffee chat confirmation email failed:", emailError);
  }
}

export async function createBookingAction(input: CreateBookingInput): Promise<CreateBookingResult> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();

  if (!name) return { error: "Enter your name." };
  if (!isValidUcscEmail(email)) return { error: "Enter a valid @ucsc.edu email address." };

  const turnstileOk = await verifyTurnstileToken(input.turnstileToken);
  if (!turnstileOk) return { error: "We couldn't verify you're not a robot. Please try again." };

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("coffee_chat_bookings")
    .select("id")
    .eq("applicant_email", email)
    .eq("status", "confirmed")
    .maybeSingle();
  if (existing) {
    // Never hand the manage token (or booking details) back to the caller:
    // this action is anonymous and the only "proof" is typing an email
    // address, so returning it would let anyone view or cancel someone
    // else's booking. Point them at the confirmation email instead (no
    // re-send -- it would cost an email credit per attempt).
    return {
      error:
        "You already have a coffee chat booked with that email. Check your confirmation email for the link to cancel or reschedule.",
    };
  }

  const { data: slot, error: slotError } = await supabase
    .from("coffee_chat_slots")
    .select("id, date, start_time, end_time, location, published, exec_id_2")
    .eq("id", input.slotId)
    .single();
  if (slotError || !slot) return { error: "That slot no longer exists. Please pick another." };
  const startTime = normalizeTime(slot.start_time);
  const endTime = normalizeTime(slot.end_time);

  const locationOffered = locationGroupsForSlot({ date: slot.date, startTime, endTime }).some((g) =>
    g.locations.some((l) => l.name === input.location),
  );
  if (!locationOffered) return { error: "That place isn't open at that time. Please pick another location." };

  const { data: activeBookingsForSlot } = await supabase
    .from("coffee_chat_bookings")
    .select("id")
    .eq("slot_id", slot.id)
    .eq("status", "confirmed");

  const bookable = isSlotBookable(
    {
      date: slot.date,
      startTime: slot.start_time,
      published: slot.published,
      hasConfirmedBooking: (activeBookingsForSlot ?? []).length > 0,
      hasTwoExecs: slot.exec_id_2 !== null,
    },
    new Date(),
    DEFAULT_MIN_LEAD_MINUTES,
  );
  if (!bookable) return { error: "That slot was just taken. Please pick another." };

  const manageToken = randomUUID();
  const { data: inserted, error: insertError } = await supabase
    .from("coffee_chat_bookings")
    .insert({
      slot_id: slot.id,
      applicant_name: name,
      applicant_email: email,
      manage_token: manageToken,
      location: input.location,
    })
    .select("id")
    .single();

  if (insertError) {
    if ((insertError as { code?: string }).code === UNIQUE_VIOLATION) {
      return { error: "That slot was just taken, or you already have a booking. Please refresh and try again." };
    }
    return { error: insertError.message };
  }

  await sendConfirmationEmail({
    email,
    name,
    date: slot.date,
    startTime,
    endTime,
    location: input.location,
    manageToken,
  });

  await notifyExecsOfBooking(inserted.id, "booked");

  revalidatePath("/apply/coffee-chat");
  revalidatePath("/portal/admin/coffee-chats");

  return {
    booking: { manageToken, date: slot.date, startTime, endTime, location: input.location },
  };
}

export interface ActionResult {
  error?: string;
}

export async function cancelBookingByTokenAction(token: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { data: booking, error } = await supabase
    .from("coffee_chat_bookings")
    .select("id, status")
    .eq("manage_token", token)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!booking) return { error: "We couldn't find that booking." };
  if (booking.status === "cancelled") return {};

  const { error: updateError } = await supabase
    .from("coffee_chat_bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", booking.id);
  if (updateError) return { error: updateError.message };

  await notifyExecsOfBooking(booking.id, "cancelled");

  revalidatePath("/apply/coffee-chat");
  revalidatePath("/portal/admin/coffee-chats");
  return {};
}
