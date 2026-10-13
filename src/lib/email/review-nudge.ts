import type { EmailContent } from "./coffee-chat-confirmation";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A friendly reminder to a reviewer who still has applications to score. */
export function buildReviewNudgeEmail(input: {
  firstName: string;
  left: number;
  siteUrl: string;
}): EmailContent {
  const url = `${input.siteUrl}/portal/admin/applicants?tab=queue`;
  const noun = input.left === 1 ? "application" : "applications";
  const subject = `You have ${input.left} ${noun} left to review`;

  const html = `
    <p>Hi ${escapeHtml(input.firstName)},</p>
    <p>You still have <strong>${input.left} ${noun}</strong> to review for recruiting. Scores stay hidden until every assigned reviewer has submitted, so finishing yours helps the whole group move on.</p>
    <p><a href="${escapeHtml(url)}">Open your review queue</a></p>
    <p>Thanks!<br />180DC UCSC</p>
  `.trim();

  const text = [
    `Hi ${input.firstName},`,
    `You still have ${input.left} ${noun} to review for recruiting. Scores stay hidden until every assigned reviewer has submitted, so finishing yours helps the whole group move on.`,
    `Open your review queue: ${url}`,
    "Thanks!",
    "180DC UCSC",
  ].join("\n\n");

  return { subject, html, text };
}
