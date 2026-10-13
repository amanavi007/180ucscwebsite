import { describe, expect, it } from "vitest";
import { buildReviewNudgeEmail } from "./review-nudge";

describe("buildReviewNudgeEmail", () => {
  it("says how many are left and links to the queue", () => {
    const e = buildReviewNudgeEmail({ firstName: "Maya", left: 3, siteUrl: "https://x.org" });
    expect(e.subject).toBe("You have 3 applications left to review");
    expect(e.html).toContain("https://x.org/portal/admin/applicants?tab=queue");
    expect(e.text).toContain("Hi Maya,");
  });
  it("uses the singular for one", () => {
    expect(buildReviewNudgeEmail({ firstName: "A", left: 1, siteUrl: "https://x.org" }).subject).toBe("You have 1 application left to review");
  });
  it("escapes names", () => {
    const e = buildReviewNudgeEmail({ firstName: "<b>x</b>", left: 2, siteUrl: "https://x.org" });
    expect(e.html).not.toContain("<b>x</b>");
  });
});
