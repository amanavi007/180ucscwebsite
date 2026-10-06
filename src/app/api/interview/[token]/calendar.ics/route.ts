import { getInterviewBookingByToken } from "@/lib/data/interview-public";
import { buildInterviewIcs } from "@/lib/interview-invite";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const booking = await getInterviewBookingByToken(token);

  if (!booking || booking.status !== "confirmed") {
    return new Response("Booking not found.", { status: 404 });
  }

  const audience = new URL(request.url).searchParams.get("for") === "exec" ? "exec" : "applicant";
  const ics = buildInterviewIcs({
    applicantName: booking.applicantName,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    manageToken: token,
    audience,
  });

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="interview.ics"',
    },
  });
}
