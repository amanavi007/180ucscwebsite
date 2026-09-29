import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTime } from "@/lib/coffee-chat";
import { buildExecBookingCancelledEmail, buildExecBookingNotificationEmail } from "./coffee-chat-confirmation";
import { sendEmail } from "./send";

/**
 * Emails the execs on a booking's slot. Best effort: the booking change has
 * already happened, so failures are logged rather than surfaced.
 */
export async function notifyExecsOfBooking(
  bookingId: string,
  kind: "booked" | "cancelled",
): Promise<{ sentTo: string[]; errors: string[] }> {
  const result = { sentTo: [] as string[], errors: [] as string[] };
  try {
    const supabase = createAdminClient();
    const { data: booking, error } = await supabase
      .from("coffee_chat_bookings")
      .select(
        "applicant_name, applicant_email, manage_token, slot:coffee_chat_slots!inner(date, start_time, end_time, location, exec_id_1, exec_id_2)",
      )
      .eq("id", bookingId)
      .single();
    if (error) throw error;

    const slot = booking.slot as unknown as {
      date: string;
      start_time: string;
      end_time: string;
      location: string;
      exec_id_1: string;
      exec_id_2: string | null;
    };
    const execIds = [slot.exec_id_1, slot.exec_id_2].filter((id): id is string => id !== null);
    const { data: execs, error: execError } = await supabase.from("profiles").select("name, email").in("id", execIds);
    if (execError) throw execError;

    await Promise.all(
      (execs ?? []).map(async (exec) => {
        const base = {
          execName: exec.name,
          applicantName: booking.applicant_name,
          applicantEmail: booking.applicant_email,
          date: slot.date,
          startTime: normalizeTime(slot.start_time),
          endTime: normalizeTime(slot.end_time),
          location: slot.location,
          siteUrl: process.env.NEXT_PUBLIC_SITE_URL!,
        };
        const content =
          kind === "booked"
            ? buildExecBookingNotificationEmail({ ...base, manageToken: booking.manage_token })
            : buildExecBookingCancelledEmail(base);
        try {
          await sendEmail({ to: exec.email, subject: content.subject, html: content.html, text: content.text });
          result.sentTo.push(exec.email);
        } catch (emailError) {
          console.error(`coffee chat exec ${kind} email failed:`, emailError);
          result.errors.push(`${exec.email}: ${emailError instanceof Error ? emailError.message : String(emailError)}`);
        }
      }),
    );
  } catch (err) {
    console.error(`coffee chat exec ${kind} notification failed:`, err);
    result.errors.push(err instanceof Error ? err.message : JSON.stringify(err));
  }
  return result;
}
