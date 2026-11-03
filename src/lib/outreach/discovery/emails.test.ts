import { describe, expect, it } from "vitest";
import { extractCompanyEmails, pickBestEmail } from "./emails";

describe("extractCompanyEmails", () => {
  it("finds plain text and mailto emails on the company's own domain", () => {
    const html = `<p>Write to hello@acme.com</p><a href="mailto:Jo@Acme.com?subject=Hi">email</a>`;
    expect(extractCompanyEmails(html, "acme.com").sort()).toEqual(["hello@acme.com", "jo@acme.com"]);
  });
  it("ignores other domains, image filenames, and duplicates", () => {
    const html = "x@sentry.io logo@2x.png hello@acme.com hello@acme.com support@mail.acme.com";
    expect(extractCompanyEmails(html, "acme.com").sort()).toEqual(["hello@acme.com", "support@mail.acme.com"]);
  });
  it("decodes obfuscated at-signs", () => {
    expect(extractCompanyEmails("team&#64;acme.com and ceo[at]acme.com", "acme.com").sort()).toEqual(["ceo@acme.com", "team@acme.com"]);
  });
  it("returns nothing for a page with no emails", () => {
    expect(extractCompanyEmails("<p>Nothing here</p>", "acme.com")).toEqual([]);
  });
});

describe("pickBestEmail", () => {
  it("prefers a named inbox over a generic one", () => {
    expect(pickBestEmail(["hello@acme.com", "jo@acme.com", "info@acme.com"])).toBe("jo@acme.com");
  });
  it("orders generic inboxes: founders, hello, contact, info", () => {
    expect(pickBestEmail(["info@acme.com", "contact@acme.com", "hello@acme.com", "founders@acme.com"])).toBe("founders@acme.com");
    expect(pickBestEmail(["info@acme.com", "contact@acme.com", "hello@acme.com"])).toBe("hello@acme.com");
    expect(pickBestEmail(["info@acme.com", "contact@acme.com"])).toBe("contact@acme.com");
  });
  it("never picks inboxes that are not for business conversations", () => {
    for (const local of ["careers", "jobs", "security", "support", "sales", "press", "privacy", "legal", "abuse", "billing", "noreply", "no-reply", "help", "hr", "recruiting", "media", "partners", "quotes", "orders", "bookings", "feedback", "marketing", "newsletter"]) {
      expect(pickBestEmail([`${local}@acme.com`])).toBeNull();
    }
  });
  it("falls back to a good generic inbox when the others are role inboxes", () => {
    expect(pickBestEmail(["careers@acme.com", "security@acme.com", "info@acme.com"])).toBe("info@acme.com");
  });
  it("returns null for an empty list", () => {
    expect(pickBestEmail([])).toBeNull();
  });
});
