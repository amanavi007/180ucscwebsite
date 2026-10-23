import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTime } from "@/lib/coffee-chat";
import {
  buildInterviewAdminCancelledEmail,
  buildInterviewExecBookedEmail,
  buildInterviewExecCancelledEmail,
} from "./interview-emails";
import { sendEmail } from "./send";

async function loadBookingContext(bookingId: string) {
  const supabase = createAdminClient();
  const { data: booking, error } = await supabase
    .from("interview_bookings")
    .select("applicant_name, applicant_email, manage_token, slot_id")
    .eq("id", bookingId)
    .single();
  if (error) throw error;
  const { data: slot, error: slotError } = await supabase
    .from("interview_slots")
    .select("date, start_time, end_time")
    .eq("id", booking.slot_id)
    .single();
  if (slotError) throw slotError;
  const { data: links, error: linksError } = await supabase
    .from("interview_slot_execs")
    .select("exec_id")
    .eq("slot_id", booking.slot_id);
  if (linksError) throw linksError;
  const { data: execs, error: execsError } = await supabase
    .from("profiles")
    .select("id, name, email")
    .in( // in-ok: one interview panel
      "id",
      (links ?? []).map((l) => l.exec_id),
    );
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
export async function notifyInterviewExecs(
  bookingId: string,
  kind: "booked" | "cancelled",
  /** Only email these execs (e.g. someone just assigned to an already-booked slot); the panel list shown still includes everyone. */
  onlyExecIds?: string[],
): Promise<{ sentTo: string[]; errors: string[] }> {
  const result = { sentTo: [] as string[], errors: [] as string[] };
  try {
    const { booking, when, execs } = await loadBookingContext(bookingId);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;

    await Promise.all(
      execs
        .filter((exec) => !onlyExecIds || onlyExecIds.includes(exec.id))
        .map(async (exec) => {
          const base = {
            execName: exec.name,
            applicantName: booking.applicant_name,
            applicantEmail: booking.applicant_email,
            otherPanelNames: execs
              .filter((e) => e.id !== exec.id)
              .map((e) => e.name),
            ...when,
            siteUrl,
          };
          const content =
            kind === "booked"
              ? buildInterviewExecBookedEmail({
                  ...base,
                  manageToken: booking.manage_token,
                })
              : buildInterviewExecCancelledEmail(base);
          try {
            await sendEmail({
              to: exec.email,
              subject: content.subject,
              html: content.html,
              text: content.text,
            });
            result.sentTo.push(exec.email);
          } catch (emailError) {
            console.error(`interview exec ${kind} email failed:`, emailError);
            result.errors.push(
              `${exec.email}: ${emailError instanceof Error ? emailError.message : String(emailError)}`,
            );
          }
        }),
    );
  } catch (err) {
    console.error(`interview exec ${kind} notification failed:`, err);
    result.errors.push(
      err instanceof Error ? err.message : JSON.stringify(err),
    );
  }
  return result;
}

/** Tells the applicant their interview was cancelled (by an admin, or by themselves as a receipt). Best effort, like the exec emails. */
export async function emailApplicantInterviewCancelled(
  bookingId: string,
  cancelledBy: "admin" | "applicant" = "admin",
): Promise<void> {
  try {
    const { booking, when } = await loadBookingContext(bookingId);
    const content = buildInterviewAdminCancelledEmail({
      applicantName: booking.applicant_name,
      ...when,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL!,
      cancelledBy,
    });
    await sendEmail({
      to: booking.applicant_email,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });
  } catch (err) {
    console.error("interview admin-cancel email to applicant failed:", err);
  }
}
