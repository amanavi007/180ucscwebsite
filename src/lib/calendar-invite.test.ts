import { describe, expect, it } from "vitest";
import { buildGoogleCalendarUrl, buildIcsContent, type CoffeeChatBookingForInvite } from "./calendar-invite";

const booking: CoffeeChatBookingForInvite = {
  applicantName: "Jamie Rivera",
  date: "2026-10-06",
  startTime: "14:00",
  endTime: "14:20",
  location: "Baskin Engineering courtyard",
  manageToken: "tok_abc123",
};

describe("buildGoogleCalendarUrl", () => {
  it("encodes the UTC start/end as a Google Calendar template link", () => {
    const url = buildGoogleCalendarUrl(booking);
    expect(url).toContain("https://calendar.google.com/calendar/render?action=TEMPLATE");
    expect(url).toContain("dates=20261006T210000Z%2F20261006T212000Z");
    expect(url).toContain("text=180DC+UCSC+Coffee+Chat");
    expect(url).toContain("location=Baskin+Engineering+courtyard");
  });
});

describe("calendar links for a slot without a location", () => {
  const noLocation = { ...booking, location: "" };

  it("omits the location from the Google Calendar link", () => {
    expect(buildGoogleCalendarUrl(noLocation)).not.toContain("location=");
  });

  it("omits the LOCATION line from the ICS", () => {
    expect(buildIcsContent(noLocation)).not.toContain("LOCATION");
  });
});

describe("buildIcsContent", () => {
  it("produces a VCALENDAR block with the right UID, times, and CRLF line endings", () => {
    const ics = buildIcsContent(booking);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("UID:tok_abc123@180dcucsc.org");
    expect(ics).toContain("DTSTART:20261006T210000Z");
    expect(ics).toContain("DTEND:20261006T212000Z");
    expect(ics).toContain("SUMMARY:180DC UCSC Coffee Chat");
    expect(ics).toContain("LOCATION:Baskin Engineering courtyard");
    expect(ics.split("\n")[0].endsWith("\r")).toBe(true);
  });
});

describe("exec audience", () => {
  it("names the applicant for execs only", () => {
    expect(buildIcsContent({ ...booking, audience: "exec" })).toContain(`SUMMARY:Coffee chat with ${booking.applicantName}`);
    expect(buildIcsContent(booking)).toContain("SUMMARY:180DC UCSC Coffee Chat");
    expect(buildIcsContent(booking)).not.toContain(booking.applicantName);
    expect(buildGoogleCalendarUrl(booking)).not.toContain("Jamie");
  });
});
