import { getBookingByToken } from "@/lib/data/coffee-chat-public";
import { buildIcsContent } from "@/lib/calendar-invite";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const booking = await getBookingByToken(token);

  if (!booking || booking.status !== "confirmed") {
    return new Response("Booking not found.", { status: 404 });
  }

  const ics = buildIcsContent({
    applicantName: booking.applicantName,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    location: booking.location,
    manageToken: token,
  });

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="coffee-chat.ics"',
    },
  });
}
