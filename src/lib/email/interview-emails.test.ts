import { describe, expect, it } from "vitest";
import {
  buildInterviewAdminCancelledEmail,
  buildInterviewConfirmationEmail,
  buildInterviewExecBookedEmail,
  buildInterviewExecCancelledEmail,
  buildInterviewReminderEmail,
} from "./interview-emails";

const when = { date: "2026-10-07", startTime: "09:00", endTime: "10:00" };
const siteUrl = "https://example.org";

describe("interview emails", () => {
  it("confirmation has date, time, SnE Library, calendar links and manage link", () => {
    const { subject, html, text } = buildInterviewConfirmationEmail({ applicantName: "Jane", ...when, manageToken: "tok", siteUrl });
    expect(subject).toBe("You're booked for your 180DC UCSC interview");
    for (const body of [html, text]) {
      expect(body).toContain("SnE Library");
      expect(body).toContain("9:00 AM");
      expect(body).toContain("https://example.org/apply/interview/manage/tok");
      expect(body).toContain("https://example.org/api/interview/tok/calendar.ics");
    }
    expect(html).toContain("calendar.google.com");
    expect(text).toContain("24 hours");
  });

  it("reminder subject depends on kind and links to manage", () => {
    const dayBefore = buildInterviewReminderEmail({ kind: "day_before", applicantName: "Jane", ...when, manageToken: "tok", siteUrl });
    const morning = buildInterviewReminderEmail({ kind: "morning", applicantName: "Jane", ...when, manageToken: "tok", siteUrl });
    expect(dayBefore.subject).toBe("Reminder: your 180DC UCSC interview is tomorrow");
    expect(morning.subject).toBe("Reminder: your 180DC UCSC interview is today");
    expect(dayBefore.text).toContain("https://example.org/apply/interview/manage/tok");
  });

  it("admin-cancelled email says it was cancelled and asks them to get in touch, with no manage link", () => {
    const { subject, html, text } = buildInterviewAdminCancelledEmail({ applicantName: "Jane", ...when, siteUrl });
    expect(subject).toBe("Your 180DC UCSC interview was cancelled");
    expect(html).toContain("Wednesday, October 7, 2026");
    expect(text.toLowerCase()).toContain("contact us");
    expect(text).not.toContain("/manage/");
  });

  it("exec booked email names the applicant and the other panel members", () => {
    const { subject, html, text } = buildInterviewExecBookedEmail({
      execName: "Ava",
      applicantName: "Jane Doe",
      applicantEmail: "jane@ucsc.edu",
      otherPanelNames: ["Ben", "Cy"],
      ...when,
      manageToken: "tok",
      siteUrl,
    });
    expect(subject).toBe("Jane Doe booked an interview with you");
    for (const body of [html, text]) {
      expect(body).toContain("jane@ucsc.edu");
      expect(body).toContain("Ben, Cy");
      expect(body).toContain("SnE Library");
    }
  });

  it("exec cancelled email names the applicant and panel", () => {
    const { subject, text } = buildInterviewExecCancelledEmail({
      execName: "Ava",
      applicantName: "Jane Doe",
      applicantEmail: "jane@ucsc.edu",
      otherPanelNames: ["Ben"],
      ...when,
      siteUrl,
    });
    expect(subject).toBe("Jane Doe's interview was cancelled");
    expect(text).toContain("Ben");
  });

  it("escapes applicant names in html", () => {
    const { html } = buildInterviewConfirmationEmail({ applicantName: "<b>Jane</b>", ...when, manageToken: "tok", siteUrl });
    expect(html).toContain("&lt;b&gt;Jane&lt;/b&gt;");
    expect(html).not.toContain("<b>Jane");
  });
});
