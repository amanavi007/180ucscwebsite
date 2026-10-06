import { describe, expect, it } from "vitest";
import { buildInterviewGoogleCalendarUrl, buildInterviewIcs, interviewEventLines } from "./interview-invite";

const base = {
  applicantName: "Jane Doe",
  date: "2026-10-07",
  startTime: "09:00",
  endTime: "10:00",
  manageToken: "tok123",
};

describe("interview invites", () => {
  it("builds a Google Calendar link in UTC with the fixed location", () => {
    const url = buildInterviewGoogleCalendarUrl(base);
    expect(url).toContain("dates=20261007T160000Z%2F20261007T170000Z");
    expect(url).toContain("location=SnE+Library");
    expect(url).toContain("text=180DC+UCSC+Interview");
  });

  it("keeps the applicant copy generic and names the applicant and panel on the exec copy", () => {
    expect(buildInterviewIcs(base)).not.toContain("Jane Doe");
    const exec = buildInterviewIcs({ ...base, audience: "exec", panelNames: ["Ava", "Ben"] });
    expect(exec).toContain("SUMMARY:Interview with Jane Doe");
    expect(exec).toContain("Ava\\, Ben"); // commas are RFC 5545-escaped
  });

  it("emits CRLF-separated .ics with correct times", () => {
    const ics = buildInterviewIcs(base);
    expect(ics).toContain("\r\n");
    expect(ics).toContain("DTSTART:20261007T160000Z");
    expect(ics).toContain("DTEND:20261007T170000Z");
    expect(ics).toContain("LOCATION:SnE Library");
  });

  it("gives feed events a stable per-booking UID", () => {
    const lines = interviewEventLines({ ...base, id: "b1", audience: "exec", panelNames: ["Ava"] });
    expect(lines).toContain("UID:b1-interview-exec@180dcucsc.org");
    expect(lines[0]).toBe("BEGIN:VEVENT");
    expect(lines[lines.length - 1]).toBe("END:VEVENT");
  });

  it("escapes commas, semicolons and newlines in text fields", () => {
    const lines = interviewEventLines({ ...base, id: "b1", applicantName: "Doe, Jane; Jr", audience: "exec" });
    expect(lines.find((l) => l.startsWith("SUMMARY:"))).toBe("SUMMARY:Interview with Doe\\, Jane\\; Jr");
  });
});
