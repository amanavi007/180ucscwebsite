"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTime } from "@/lib/coffee-chat";
import {
  canClientCancel,
  isClientMeetingBookable,
  isClientMeetingPast,
  parseClientMeetingSettings,
  PANEL_SIZE,
  validateClientMeetingInput,
} from "@/lib/client-meeting";
import { CLIENT_MEETING_SETTING_KEYS } from "@/lib/data/client-meeting-public";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { buildClientMeetingConfirmationEmail } from "@/lib/email/client-meeting-emails";
import { sendEmail } from "@/lib/email/send";
import {
  emailClientMeetingCancelled,
  notifyClientMeetingExecs,
} from "@/lib/email/notify-client-meeting";

const UNIQUE_VIOLATION = "23505";

export interface CreateClientMeetingInput {
  slotId: string;
  contactName: string;
  businessName: string;
  email: string;
  phone: string;
  needs: string;
  turnstileToken: string;
  /** The manage token of the booking this one replaces (set by "Reschedule"). */
  rescheduleFromToken?: string;
}

export interface CreateClientMeetingResult {
  error?: string;
  booking?: {
    manageToken: string;
    date: string;
    startTime: string;
    endTime: string;
    meetingUrl: string | null;
  };
}

async function retirePastBookings(
  supabase: ReturnType<typeof createAdminClient>,
  email: string,
) {
  const { data: confirmed } = await supabase
    .from("client_meetings")
    .select("id, slot_id")
    .eq("email", email)
    .eq("status", "confirmed");
  if (!confirmed || confirmed.length === 0) return;

  const { data: slots } = await supabase
    .from("client_meeting_slots")
    .select("id, date, end_time")
    .in(
      "id",
      confirmed.map((b) => b.slot_id),
    );
  const now = new Date();
  const pastSlotIds = new Set(
    (slots ?? [])
      .filter((s) => isClientMeetingPast(s.date, s.end_time, now))
      .map((s) => s.id),
  );
  const retire = confirmed
    .filter((b) => pastSlotIds.has(b.slot_id))
    .map((b) => b.id);
  if (retire.length > 0)
    await supabase
      .from("client_meetings")
      .update({ status: "completed" })
      .in("id", retire);
}

export async function createClientMeetingAction(
  input: CreateClientMeetingInput,
): Promise<CreateClientMeetingResult> {
  // Names go into email subjects and bodies: collapse newlines/tabs/runs of spaces to single spaces
  // first, so the validator's non-empty and length checks apply to exactly what gets stored.
  const validated = validateClientMeetingInput({
    contactName: String(input.contactName ?? "").replace(/\s+/g, " ").trim(),
    businessName: String(input.businessName ?? "").replace(/\s+/g, " ").trim(),
    email: String(input.email ?? ""),
    phone: String(input.phone ?? ""),
    needs: String(input.needs ?? ""),
  });
  if ("error" in validated) return { error: validated.error };
  const { contactName, businessName, email, phone, needs } = validated.value;

  const turnstileOk = await verifyTurnstileToken(input.turnstileToken);
  if (!turnstileOk)
    return {
      error: "We couldn't verify you're not a robot. Please try again.",
    };

  const supabase = createAdminClient();

  const { data: settingRows } = await supabase
    .from("org_settings")
    .select("key, value")
    .in("key", CLIENT_MEETING_SETTING_KEYS);
  const { bookingOpen, panelExecIds } = parseClientMeetingSettings(
    settingRows ?? [],
  );
  if (!bookingOpen)
    return { error: "Booking isn't open right now. Check back soon." };
  if (panelExecIds.length !== PANEL_SIZE)
    return { error: "Booking isn't available right now. Please contact us." };

  // A booking whose meeting already happened must not block the same client from booking again.
  await retirePastBookings(supabase, email);

  const { data: existing } = await supabase
    .from("client_meetings")
    .select("id")
    .eq("email", email)
    .eq("status", "confirmed")
    .maybeSingle();
  if (existing) {
    // Never hand back the manage token: the only "proof" here is typing an email address.
    return {
      error:
        "You already have an intro call booked with that email. Check your confirmation email for the link to cancel or reschedule.",
    };
  }

  const { data: slot, error: slotError } = await supabase
    .from("client_meeting_slots")
    .select("id, date, start_time, end_time, published")
    .eq("id", input.slotId)
    .single();
  if (slotError || !slot)
    return { error: "That slot no longer exists. Please pick another." };

  const { data: activeBookings } = await supabase
    .from("client_meetings")
    .select("id")
    .eq("slot_id", slot.id)
    .eq("status", "confirmed");

  const bookable = isClientMeetingBookable(
    {
      date: slot.date,
      startTime: slot.start_time,
      published: slot.published,
      hasConfirmedBooking: (activeBookings ?? []).length > 0,
    },
    true,
    new Date(),
  );
  if (!bookable)
    return {
      error:
        "That slot was just taken or is no longer available. Please pick another.",
    };

  // Rescheduling keeps the video link an exec already set, but only for the same client (same email).
  // The panel is not carried: the new booking snapshots the current panel.
  let carriedMeetingUrl: string | null = null;
  if (input.rescheduleFromToken) {
    const { data: previous } = await supabase
      .from("client_meetings")
      .select("email, meeting_url")
      .eq("manage_token", input.rescheduleFromToken)
      .maybeSingle();
    if (previous && previous.email === email)
      carriedMeetingUrl = previous.meeting_url;
  }

  const manageToken = randomUUID();
  const { data: inserted, error: insertError } = await supabase
    .from("client_meetings")
    .insert({
      slot_id: slot.id,
      contact_name: contactName,
      business_name: businessName,
      email,
      phone,
      needs,
      panel_exec_ids: panelExecIds,
      manage_token: manageToken,
      meeting_url: carriedMeetingUrl,
    })
    .select("id")
    .single();

  if (insertError) {
    if ((insertError as { code?: string }).code === UNIQUE_VIOLATION) {
      return {
        error:
          "That slot was just taken, or you already have a booking. Please refresh and try again.",
      };
    }
    return { error: insertError.message };
  }

  const startTime = normalizeTime(slot.start_time);
  const endTime = normalizeTime(slot.end_time);

  const content = buildClientMeetingConfirmationEmail({
    contactName,
    businessName,
    date: slot.date,
    startTime,
    endTime,
    manageToken,
    meetingUrl: carriedMeetingUrl,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL!,
  });
  try {
    await sendEmail({
      to: email,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });
  } catch (emailError) {
    // The booking already succeeded and is shown on-screen.
    console.error("client meeting confirmation email failed:", emailError);
  }

  await notifyClientMeetingExecs(inserted.id, "booked");

  revalidatePath("/services/book");
  revalidatePath("/portal/admin/client-meetings");

  return {
    booking: {
      manageToken,
      date: slot.date,
      startTime,
      endTime,
      meetingUrl: carriedMeetingUrl,
    },
  };
}

/**
 * Self-cancel from the manage link. The client gets a receipt email, except when this cancel is
 * just the first half of "Reschedule" (the new booking's confirmation email is their receipt then).
 */
export async function cancelClientMeetingByTokenAction(
  token: string,
  options: { reschedule?: boolean } = {},
): Promise<{ error?: string }> {
  const supabase = createAdminClient();
  const { data: booking, error } = await supabase
    .from("client_meetings")
    .select("id, status, slot_id")
    .eq("manage_token", token)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!booking) return { error: "We couldn't find that booking." };
  // Only a confirmed booking can be cancelled; cancelled or completed ones are left untouched.
  if (booking.status !== "confirmed") return {};

  const { data: slot } = await supabase
    .from("client_meeting_slots")
    .select("date, start_time")
    .eq("id", booking.slot_id)
    .single();
  if (
    !slot ||
    !canClientCancel(slot.date, normalizeTime(slot.start_time), new Date())
  ) {
    return {
      error:
        "Intro calls can only be changed up to 12 hours ahead. Please contact us and we'll help.",
    };
  }

  const { data: cancelled, error: updateError } = await supabase
    .from("client_meetings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", booking.id)
    .eq("status", "confirmed")
    .select("id");
  if (updateError) return { error: updateError.message };

  if ((cancelled ?? []).length > 0) {
    await Promise.all([
      notifyClientMeetingExecs(booking.id, "cancelled"),
      options.reschedule
        ? Promise.resolve()
        : emailClientMeetingCancelled(booking.id, "client"),
    ]);
  }

  revalidatePath("/services/book");
  revalidatePath("/portal/admin/client-meetings");
  return {};
}
