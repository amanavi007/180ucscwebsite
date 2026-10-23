import { describe, expect, it } from "vitest";
import { buildBrakeAlertEmail, buildOutreachEmail, buildReplyForwardEmail } from "./outreach-emails";

const args = {
  subject: "Helping Acme grow",
  bodyText: "Hi Jo,\n\nSaw Acme's new clinic partnerships.\n\nWould a short call help?",
  bookingUrl: "https://ucsc180dc.org/services/book?lead=abc",
  unsubscribeUrl: "https://ucsc180dc.org/unsubscribe?token=t",
  senderName: "180 Degrees Consulting at UCSC",
  postalAddress: "1156 High St, Santa Cruz, CA 95064",
};

describe("buildOutreachEmail", () => {
  const email = buildOutreachEmail(args);
  it("keeps the subject and includes the body", () => {
    expect(email.subject).toBe("Helping Acme grow");
    expect(email.text).toContain("Saw Acme's new clinic partnerships.");
    expect(email.html).toContain("Saw Acme&#39;s new clinic partnerships.");
  });
  it("hides the booking link behind words in the html and keeps the lead token in it", () => {
    expect(email.html).toContain(`<a href="${args.bookingUrl}">Book a discovery call here</a>`);
    expect(email.text).toContain("https://ucsc180dc.org/services/book\n");
    expect(email.text).not.toContain("lead=");
  });
  it("shows the unsubscribe URL as text only in the plain version", () => {
    expect(email.text).toContain(args.unsubscribeUrl);
    expect(email.html).toContain(`href="${args.unsubscribeUrl}"`);
    expect(email.html).not.toContain(`${args.unsubscribeUrl}</`);
  });
  it("includes the address and team signature in both versions", () => {
    for (const part of [email.text, email.html]) {
      expect(part).toContain("1156 High St, Santa Cruz, CA 95064");
      expect(part).toContain("The 180 Degrees Consulting UCSC team");
    }
  });
  it("has no tracking pixel or images", () => {
    expect(email.html).not.toMatch(/<img/i);
  });
  it("escapes html in the body", () => {
    const e = buildOutreachEmail({ ...args, bodyText: "<script>x</script>" });
    expect(e.html).not.toContain("<script>");
  });
});

describe("buildReplyForwardEmail", () => {
  const fwd = buildReplyForwardEmail({
    company: "Acme",
    contactName: "Jo Lee",
    fromEmail: "jo@acme.com",
    classification: "interested",
    subject: "Re: Helping Acme grow",
    text: "Sounds good, call Thursday?",
    portalUrl: "https://ucsc180dc.org/portal/admin/outreach?prospect=1",
    unmatched: false,
  });
  it("starts the subject with Reply from and names the company", () => {
    expect(fwd.subject).toBe("Reply from Acme: Re: Helping Acme grow");
  });
  it("shows the classification, original message and portal link", () => {
    expect(fwd.text).toContain("interested");
    expect(fwd.text).toContain("Sounds good, call Thursday?");
    expect(fwd.text).toContain("/portal/admin/outreach?prospect=1");
  });
  it("labels unmatched replies", () => {
    const u = buildReplyForwardEmail({ company: null, contactName: null, fromEmail: "x@y.co", classification: "other", subject: "hi", text: "t", portalUrl: "https://p", unmatched: true });
    expect(u.subject).toBe("Reply from x@y.co: hi");
    expect(u.text).toContain("could not be matched");
  });
});

describe("buildBrakeAlertEmail", () => {
  it("explains the reason in plain words", () => {
    const e = buildBrakeAlertEmail("bounce_rate", "https://p");
    expect(e.subject).toMatch(/paused/i);
    expect(e.text).toMatch(/bounce/i);
  });
});
