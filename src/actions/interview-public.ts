"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidUcscEmail, normalizeTime } from "@/lib/coffee-chat";
import { canSelfCancel, isInterviewSlotBookable, normalizeInviteeEmail, parseInterviewSettings } from "@/lib/interview";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { buildInterviewConfirmationEmail } from "@/lib/email/interview-emails";
import { sendEmail } from "@/lib/email/send";
import { notifyInterviewExecs } from "@/lib/email/notify-interview";

const UNIQUE_VIOLATION = "23505";

const NOT_INVITED_MESSAGE =
  "This booking page is for invited applicants. Contact us if you think this is a mistake.";

export interface CreateInterviewBookingInput {
  slotId: string;
  name: string;
  email: string;
  turnstileToken: string;
}

export interface CreateInterviewBookingResult {
  error?: string;
  booking?: { manageToken: string; date: string; startTime: string; endTime: string };
}

export async function createInterviewBookingAction(input: CreateInterviewBookingInput): Promise<CreateInterviewBookingResult> {
  const name = input.name.trim();
  const email = normalizeInviteeEmail(input.email);

  if (!name) return { error: "Enter your name." };
  if (!isValidUcscEmail(email)) return { error: "Enter a valid @ucsc.edu email address." };

  const turnstileOk = await verifyTurnstileToken(input.turnstileToken);
  if (!turnstileOk) return { error: "We couldn't verify you're not a robot. Please try again." };

  const supabase = createAdminClient();

  const { data: settingRows } = await supabase
    .from("org_settings")
    .select("key, value")
    .in("key", ["interview_booking_open", "interview_slot_minutes"]);
  if (!parseInterviewSettings(settingRows ?? []).bookingOpen) {
    return { error: "Interview booking isn't open right now. Check back soon." };
  }

  // The allowlist gate. Never reveal who is (or isn't) on the list beyond this one message.
  const { data: invitee } = await supabase.from("interview_invitees").select("id").eq("email", email).maybeSingle();
  if (!invitee) return { error: NOT_INVITED_MESSAGE };

  const { data: existing } = await supabase
    .from("interview_bookings")
    .select("id")
    .eq("applicant_email", email)
    .eq("status", "confirmed")
    .maybeSingle();
  if (existing) {
    // Never hand back the manage token: the only "proof" here is typing an email address.
    return {
      error:
        "You already have an interview booked with that email. Check your confirmation email for the link to cancel or reschedule.",
    };
  }

  const { data: slot, error: slotError } = await supabase
    .from("interview_slots")
    .select("id, date, start_time, end_time, published")
    .eq("id", input.slotId)
    .single();
  if (slotError || !slot) return { error: "That slot no longer exists. Please pick another." };

  const [{ data: activeBookings }, { data: links }] = await Promise.all([
    supabase.from("interview_bookings").select("id").eq("slot_id", slot.id).eq("status", "confirmed"),
    supabase.from("interview_slot_execs").select("exec_id").eq("slot_id", slot.id),
  ]);

  const bookable = isInterviewSlotBookable(
    {
      date: slot.date,
      startTime: slot.start_time,
      published: slot.published,
      hasConfirmedBooking: (activeBookings ?? []).length > 0,
      execCount: (links ?? []).length,
    },
    new Date(),
  );
  if (!bookable) return { error: "That slot was just taken or is no longer available. Please pick another." };

  const manageToken = randomUUID();
  const { data: inserted, error: insertError } = await supabase
    .from("interview_bookings")
    .insert({ slot_id: slot.id, applicant_name: name, applicant_email: email, manage_token: manageToken })
    .select("id")
    .single();

  if (insertError) {
    if ((insertError as { code?: string }).code === UNIQUE_VIOLATION) {
      return { error: "That slot was just taken, or you already have a booking. Please refresh and try again." };
    }
    return { error: insertError.message };
  }

  const startTime = normalizeTime(slot.start_time);
  const endTime = normalizeTime(slot.end_time);

  const content = buildInterviewConfirmationEmail({
    applicantName: name,
    date: slot.date,
    startTime,
    endTime,
    manageToken,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL!,
  });
  try {
    await sendEmail({ to: email, subject: content.subject, html: content.html, text: content.text });
  } catch (emailError) {
    // The booking already succeeded and is shown on-screen.
    console.error("interview confirmation email failed:", emailError);
  }

  await notifyInterviewExecs(inserted.id, "booked");

  revalidatePath("/apply/interview");
  revalidatePath("/portal/admin/interviews");

  return { booking: { manageToken, date: slot.date, startTime, endTime } };
}

export async function cancelInterviewBookingByTokenAction(token: string): Promise<{ error?: string }> {
  const supabase = createAdminClient();
  const { data: booking, error } = await supabase
    .from("interview_bookings")
    .select("id, status, slot_id")
    .eq("manage_token", token)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!booking) return { error: "We couldn't find that booking." };
  if (booking.status === "cancelled") return {};

  const { data: slot } = await supabase.from("interview_slots").select("date, start_time").eq("id", booking.slot_id).single();
  if (!slot || !canSelfCancel(slot.date, normalizeTime(slot.start_time), new Date())) {
    return { error: "Interviews can only be changed up to 24 hours ahead. Please contact us and we'll help." };
  }

  const { data: cancelled, error: updateError } = await supabase
    .from("interview_bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", booking.id)
    .eq("status", "confirmed")
    .select("id");
  if (updateError) return { error: updateError.message };

  if ((cancelled ?? []).length > 0) await notifyInterviewExecs(booking.id, "cancelled");

  revalidatePath("/apply/interview");
  revalidatePath("/portal/admin/interviews");
  return {};
}
