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
  it("includes the date, 12-hour time, location, manage link, calendar link, and ICS link", () => {
    const email = buildBookingConfirmationEmail(input);
    expect(email.subject).toContain("Coffee Chat");
    expect(email.html).toContain("Tuesday, October 6, 2026");
    expect(email.html).toContain("2:00 PM to 2:20 PM");
    expect(email.html).toContain("Baskin Engineering courtyard");
    expect(email.html).toContain("https://180dcucsc.org/apply/coffee-chat/manage/tok_abc123");
    expect(email.html).toContain("https://180dcucsc.org/api/coffee-chat/tok_abc123/calendar.ics");
    expect(email.html).toContain("calendar.google.com/calendar/render");
    expect(email.text).toContain("https://180dcucsc.org/apply/coffee-chat/manage/tok_abc123");
    expect(email.text).toContain("2:00 PM to 2:20 PM");
  });

  it("ends with the 180DC logo, loaded from the site's own address, with alt text", () => {
    const email = buildBookingConfirmationEmail(input);
    expect(email.html.trimEnd().endsWith("/>")).toBe(true);
    expect(email.html.trimStart().startsWith("<img")).toBe(false);
    expect(email.html.lastIndexOf("<img")).toBeGreaterThan(email.html.indexOf("See you soon"));
    expect(email.html).toContain('src="https://180dcucsc.org/email-logo.png"');
    expect(email.html).toContain('alt="180 Degrees Consulting UC Santa Cruz"');
  });

  it("leaves out the location line when the slot has no location", () => {
    const email = buildBookingConfirmationEmail({ ...input, location: "" });
    expect(email.html).not.toContain("Location");
    expect(email.text).not.toContain("Location");
  });

  it("never uses em dashes, en dashes, or double hyphens in the copy", () => {
    const email = buildBookingConfirmationEmail({ ...input, location: "" });
    for (const copy of [email.subject, email.text, email.html.replace(/https?:\/\/\S+/g, "")]) {
      expect(copy).not.toMatch(/—|–|--/);
    }
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
