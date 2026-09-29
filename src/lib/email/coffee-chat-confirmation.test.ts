import { describe, expect, it } from "vitest";
import { buildBookingConfirmationEmail, type BookingConfirmationEmailInput } from "./coffee-chat-confirmation";

const input: BookingConfirmationEmailInput = {
  applicantName: "Jamie Rivera",
  date: "2026-10-06",
  startTime: "14:00",
  endTime: "14:20",
  location: "Baskin Engineering courtyard",
  manageToken: "tok_abc123",
  siteUrl: "https://180dcucsc.org",
};

describe("buildBookingConfirmationEmail", () => {
  it("includes the date, time, location, manage link, calendar link, and ICS link", () => {
    const email = buildBookingConfirmationEmail(input);
    expect(email.subject).toContain("Coffee Chat");
    expect(email.html).toContain("2026-10-06");
    expect(email.html).toContain("14:00");
    expect(email.html).toContain("Baskin Engineering courtyard");
    expect(email.html).toContain("https://180dcucsc.org/apply/coffee-chat/manage/tok_abc123");
    expect(email.html).toContain("https://180dcucsc.org/api/coffee-chat/tok_abc123/calendar.ics");
    expect(email.html).toContain("calendar.google.com/calendar/render");
    expect(email.text).toContain("https://180dcucsc.org/apply/coffee-chat/manage/tok_abc123");
  });

  it("HTML-escapes the applicant-supplied name so it can't inject markup into the email", () => {
    const email = buildBookingConfirmationEmail({
      ...input,
      applicantName: '<a href="https://evil.example">Click</a>',
    });
    expect(email.html).not.toContain("<a href=\"https://evil.example\">");
    expect(email.html).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;Click&lt;/a&gt;");
  });
});
