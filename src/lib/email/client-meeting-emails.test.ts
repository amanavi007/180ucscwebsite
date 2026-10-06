import { describe, expect, it } from "vitest";
import {
  buildClientMeetingCancelledEmail,
  buildClientMeetingConfirmationEmail,
  buildClientMeetingExecBookedEmail,
  buildClientMeetingLinkEmail,
  buildClientMeetingReminderEmail,
} from "./client-meeting-emails";

const when = { date: "2026-10-20", startTime: "10:00", endTime: "10:30" };
const site = "https://example.org";

describe("client meeting emails", () => {
  it("confirmation links to manage and ics, and says the link is coming when absent", () => {
    const e = buildClientMeetingConfirmationEmail({ ...when, contactName: "Jo", businessName: "Acme", manageToken: "tok", meetingUrl: null, siteUrl: site });
    expect(e.html).toContain(`${site}/services/book/manage/tok`);
    expect(e.html).toContain(`${site}/api/client-meeting/tok/calendar.ics`);
    expect(e.text).toContain("send you the video link");
  });
  it("shows the link when present", () => {
    const e = buildClientMeetingConfirmationEmail({ ...when, contactName: "Jo", businessName: "Acme", manageToken: "tok", meetingUrl: "https://zoom.us/j/1", siteUrl: site });
    expect(e.text).toContain("https://zoom.us/j/1");
  });
  it("link email and reminders", () => {
    expect(buildClientMeetingLinkEmail({ ...when, contactName: "Jo", meetingUrl: "https://zoom.us/j/1", manageToken: "tok", siteUrl: site }).text).toContain("https://zoom.us/j/1");
    expect(buildClientMeetingReminderEmail({ ...when, kind: "day_before", contactName: "Jo", manageToken: "tok", meetingUrl: null, siteUrl: site }).subject).toContain("tomorrow");
    expect(buildClientMeetingReminderEmail({ ...when, kind: "morning", contactName: "Jo", manageToken: "tok", meetingUrl: null, siteUrl: site }).subject).toContain("today");
  });
  it("cancel subject differs by who cancelled", () => {
    const byClient = buildClientMeetingCancelledEmail({ ...when, contactName: "Jo", siteUrl: site, cancelledBy: "client" });
    const byAdmin = buildClientMeetingCancelledEmail({ ...when, contactName: "Jo", siteUrl: site });
    expect(byClient.subject).not.toBe(byAdmin.subject);
  });
  it("exec email escapes HTML but keeps text raw", () => {
    const e = buildClientMeetingExecBookedEmail({
      ...when, execName: "Ava", contactName: "Jo", businessName: "A&B", email: "jo@x.com", phone: null,
      needs: "<script>x</script>", meetingUrl: null, otherPanelNames: ["Ben", "Cy"], siteUrl: site, manageToken: "tok",
    });
    expect(e.html).toContain("A&amp;B");
    expect(e.html).not.toContain("<script>x</script>");
    expect(e.text).toContain("<script>x</script>");
    expect(e.text).toContain("Video link: not added yet");
    expect(e.html).toContain("/portal/admin/client-meetings?tab=bookings");
  });
});
