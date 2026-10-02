import { formatDateLong } from "../date";
import type { EmailContent } from "./coffee-chat-confirmation";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildAttendanceReminderEmail(input: {
  projectName: string;
  date: string;
  siteUrl: string;
}): EmailContent {
  const attendanceUrl = `${input.siteUrl}/portal/attendance`;
  const dateLabel = formatDateLong(input.date);
  const subject = `Reminder: log attendance for ${input.projectName} (${input.date})`;

  // Project name is free text, so escape anything interpolated into HTML.
  const html = `
    <p>Hi,</p>
    <p>${escapeHtml(input.projectName)} met on <strong>${escapeHtml(dateLabel)}</strong>, but attendance hasn't been logged yet.</p>
    <p><a href="${escapeHtml(attendanceUrl)}">Log attendance in the portal</a></p>
    <p>Thanks!<br />180DC UCSC</p>
  `.trim();

  const text = [
    "Hi,",
    `${input.projectName} met on ${dateLabel}, but attendance hasn't been logged yet.`,
    `Log attendance in the portal: ${attendanceUrl}`,
    "Thanks!",
    "180DC UCSC",
  ].join("\n\n");

  return { subject, html, text };
}
