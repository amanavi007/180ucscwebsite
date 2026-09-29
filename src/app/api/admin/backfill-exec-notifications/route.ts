// TEMPORARY one-time backfill: emails execs about coffee chats that were booked
// before exec notifications existed. Delete this route after running it.
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyExecsOfBooking } from "@/lib/email/notify-execs";

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) return new Response("Only exec can do that.", { status: 403 });

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("coffee_chat_bookings")
    .select("id, applicant_name, slot:coffee_chat_slots!inner(date, start_time)")
    .eq("status", "confirmed")
    .gte("slot.date", today);
  if (error) return new Response(error.message, { status: 500 });

  const bookings = data ?? [];
  const lines = bookings.map((b) => {
    const slot = b.slot as unknown as { date: string; start_time: string };
    return `${b.applicant_name} ${slot.date} ${slot.start_time}`;
  });

  // Without ?confirm=1 this is a dry run, so a stray reload can't send email.
  if (new URL(request.url).searchParams.get("confirm") !== "1") {
    return new Response(`Dry run: ${bookings.length} booking(s). Add ?confirm=1 to send.\n${lines.join("\n")}`);
  }

  // ?to=<email> re-sends to just that exec (e.g. one whose email didn't arrive).
  const onlyTo = new URL(request.url).searchParams.get("to") ?? undefined;
  const report: string[] = [];
  for (const b of bookings) {
    const r = await notifyExecsOfBooking(b.id, "booked", onlyTo);
    report.push(`${b.applicant_name}: sent to [${r.sentTo.join(", ")}]${r.errors.length ? ` ERRORS: ${r.errors.join(" | ")}` : ""}`);
  }
  return new Response(`Processed ${bookings.length} booking(s).\n${report.join("\n")}`);
}
