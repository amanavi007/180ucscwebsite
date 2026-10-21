import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTime } from "@/lib/coffee-chat";
import {
  buildClientMeetingCancelledEmail,
  buildClientMeetingConfirmationEmail,
  buildClientMeetingExecBookedEmail,
  buildClientMeetingExecCancelledEmail,
  buildClientMeetingLinkEmail,
} from "./client-meeting-emails";
import { sendEmail } from "./send";

async function loadBookingContext(bookingId: string) {
  const supabase = createAdminClient();
  const { data: booking, error } = await supabase
    .from("client_meetings")
    .select(
      "contact_name, business_name, email, phone, needs, panel_exec_ids, meeting_url, manage_token, slot_id",
    )
    .eq("id", bookingId)
    .single();
  if (error) throw error;
  const { data: slot, error: slotError } = await supabase
    .from("client_meeting_slots")
    .select("date, start_time, end_time")
    .eq("id", booking.slot_id)
    .single();
  if (slotError) throw slotError;
  const { data: execs, error: execsError } = await supabase
    .from("profiles")
    .select("id, name, email")
    .in("id", booking.panel_exec_ids);
  if (execsError) throw execsError;
  return {
    booking,
    when: {
      date: slot.date,
      startTime: normalizeTime(slot.start_time),
      endTime: normalizeTime(slot.end_time),
    },
    execs: execs ?? [],
  };
}

/**
 * Emails every exec on the booking's panel. Best effort: the booking change
 * has already happened, so failures are logged rather than surfaced.
 */
export async function notifyClientMeetingExecs(
  bookingId: string,
  kind: "booked" | "cancelled" | "rescheduled",
): Promise<{ sentTo: string[]; errors: string[] }> {
  const result = { sentTo: [] as string[], errors: [] as string[] };
  try {
    const { booking, when, execs } = await loadBookingContext(bookingId);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;

    await Promise.all(
      execs.map(async (exec) => {
        const base = {
          execName: exec.name,
          contactName: booking.contact_name,
          businessName: booking.business_name,
          email: booking.email,
          phone: booking.phone,
          needs: booking.needs,
          meetingUrl: booking.meeting_url,
          otherPanelNames: execs
            .filter((e) => e.id !== exec.id)
            .map((e) => e.name),
          ...when,
          siteUrl,
        };
        const content =
          kind === "cancelled"
            ? buildClientMeetingExecCancelledEmail(base)
            : buildClientMeetingExecBookedEmail({
                ...base,
                manageToken: booking.manage_token,
                rescheduled: kind === "rescheduled",
              });
        try {
          await sendEmail({
            to: exec.email,
            subject: content.subject,
            html: content.html,
            text: content.text,
          });
          result.sentTo.push(exec.email);
        } catch (emailError) {
          console.error(`client meeting exec ${kind} email failed:`, emailError);
          result.errors.push(
            `${exec.email}: ${emailError instanceof Error ? emailError.message : String(emailError)}`,
          );
        }
      }),
    );
  } catch (err) {
    console.error(`client meeting exec ${kind} notification failed:`, err);
    result.errors.push(
      err instanceof Error ? err.message : JSON.stringify(err),
    );
  }
  return result;
}

/** Tells the client their meeting was cancelled (by an admin, or by themselves as a receipt). Best effort. */
export async function emailClientMeetingCancelled(
  bookingId: string,
  cancelledBy: "admin" | "client",
): Promise<void> {
  try {
    const { booking, when } = await loadBookingContext(bookingId);
    const content = buildClientMeetingCancelledEmail({
      contactName: booking.contact_name,
      ...when,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL!,
      cancelledBy,
    });
    await sendEmail({
      to: booking.email,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });
  } catch (err) {
    console.error("client meeting cancel email to client failed:", err);
  }
}

/** Sends the client the video link. No-op when the booking has no link. Best effort. */
export async function emailClientMeetingLink(bookingId: string): Promise<void> {
  try {
    const { booking, when } = await loadBookingContext(bookingId);
    if (!booking.meeting_url) return;
    const content = buildClientMeetingLinkEmail({
      contactName: booking.contact_name,
      meetingUrl: booking.meeting_url,
      manageToken: booking.manage_token,
      ...when,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL!,
    });
    await sendEmail({
      to: booking.email,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });
  } catch (err) {
    console.error("client meeting link email to client failed:", err);
  }
}

/** Tells the client an exec moved their meeting to a new time. Best effort. */
export async function emailClientMeetingRescheduled(bookingId: string): Promise<void> {
  try {
    const { booking, when } = await loadBookingContext(bookingId);
    const content = buildClientMeetingConfirmationEmail({
      contactName: booking.contact_name,
      businessName: booking.business_name,
      manageToken: booking.manage_token,
      meetingUrl: booking.meeting_url,
      ...when,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL!,
      rescheduled: true,
    });
    await sendEmail({
      to: booking.email,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });
  } catch (err) {
    console.error("client meeting reschedule email to client failed:", err);
  }
}
