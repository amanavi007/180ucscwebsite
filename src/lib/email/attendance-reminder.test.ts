import { describe, expect, it } from "vitest";
import { buildAttendanceReminderEmail } from "./attendance-reminder";

const input = { projectName: "Acme", date: "2026-09-29", siteUrl: "https://example.org" };

describe("buildAttendanceReminderEmail", () => {
  it("puts the project and date in the subject", () => {
    expect(buildAttendanceReminderEmail(input).subject).toBe(
      "Reminder: log attendance for Acme (2026-09-29)",
    );
  });

  it("links to the attendance page in both html and text", () => {
    const { html, text } = buildAttendanceReminderEmail(input);
    expect(html).toContain('href="https://example.org/portal/attendance"');
    expect(text).toContain("https://example.org/portal/attendance");
  });

  it("escapes the project name in html", () => {
    const { html } = buildAttendanceReminderEmail({ ...input, projectName: "<b>Acme & Co</b>" });
    expect(html).toContain("&lt;b&gt;Acme &amp; Co&lt;/b&gt;");
    expect(html).not.toContain("<b>Acme");
  });
});
