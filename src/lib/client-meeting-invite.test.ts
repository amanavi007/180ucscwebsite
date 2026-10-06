import { describe, expect, it } from "vitest";
import { buildClientMeetingGoogleCalendarUrl, buildClientMeetingIcs, clientMeetingEventLines } from "./client-meeting-invite";

const base = {
  businessName: "Acme, Inc; Co",
  contactName: "Jo Park",
  needs: "Line one\nLine two, with; punctuation",
  date: "2026-10-20",
  startTime: "10:00",
  endTime: "10:30",
  manageToken: "tok123",
  meetingUrl: "https://meet.google.com/abc-defg-hij",
};

describe("client meeting invites", () => {
  it("builds a Google link in UTC with the meeting link as location", () => {
    const url = buildClientMeetingGoogleCalendarUrl(base);
    expect(url).toContain("dates=20261020T170000Z%2F20261020T173000Z");
    expect(url).toContain("location=https%3A%2F%2Fmeet.google.com");
  });
  it("says the link is coming when there is none", () => {
    expect(buildClientMeetingIcs({ ...base, meetingUrl: null })).toContain("Link to follow");
  });
  it("keeps the client copy generic and names business, needs and panel on the exec copy, escaped", () => {
    expect(buildClientMeetingIcs(base)).not.toContain("Line one");
    const exec = buildClientMeetingIcs({ ...base, audience: "exec", panelNames: ["Ava", "Ben"] });
    expect(exec).toContain("SUMMARY:Client meeting: Acme\\, Inc\\; Co");
    expect(exec).toContain("Line one\\nLine two\\, with\\; punctuation");
    expect(exec).toContain("Ava\\, Ben");
    expect(exec).not.toMatch(/Line one\r?\nLine two/);
  });
  it("uses CRLF and stable per-booking UIDs for the feed", () => {
    expect(buildClientMeetingIcs(base)).toContain("\r\n");
    const lines = clientMeetingEventLines({ ...base, id: "b1", audience: "exec" });
    expect(lines).toContain("UID:b1-client-meeting-exec@180dcucsc.org");
    expect(lines[0]).toBe("BEGIN:VEVENT");
    expect(lines.at(-1)).toBe("END:VEVENT");
  });
});
