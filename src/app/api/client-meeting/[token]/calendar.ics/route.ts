import { getClientMeetingByToken } from "@/lib/data/client-meeting-public";
import { buildClientMeetingIcs } from "@/lib/client-meeting-invite";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const meeting = await getClientMeetingByToken(token);

  if (!meeting || meeting.status !== "confirmed") {
    return new Response("Booking not found.", { status: 404 });
  }

  const ics = buildClientMeetingIcs({
    businessName: meeting.businessName,
    contactName: meeting.contactName,
    date: meeting.date,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    manageToken: token,
    meetingUrl: meeting.meetingUrl,
    audience: "client",
  });

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="intro-call.ics"',
    },
  });
}
