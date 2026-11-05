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

describe("buildOutreachEmail: services link", () => {
  it("points to the services page above the booking link when given one", () => {
    const email = buildOutreachEmail({ ...args, servicesUrl: "https://www.ucsc180dc.org/services" });
    expect(email.text).toContain("how a quarter works on our services page: https://www.ucsc180dc.org/services");
    // It sits inside the message, right before the closing question, not as a footer.
    expect(email.text.indexOf("services page")).toBeLessThan(email.text.indexOf("Would a short call help?"));
    expect(email.text.indexOf("Saw Acme")).toBeLessThan(email.text.indexOf("services page"));
    expect(email.html).toContain('<a href="https://www.ucsc180dc.org/services">our services page</a>');
    expect(email.html.indexOf("our services page")).toBeLessThan(email.html.indexOf("Would a short call help?"));
    expect(email.html).not.toContain("[[services]]");
  });
  it("leaves it out when there is none", () => {
    const email = buildOutreachEmail(args);
    expect(email.text).not.toContain("services page");
    expect(email.html).not.toContain("services page");
  });
});

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
  it("shows the unsubscribe URL as text only in the plain version, and as a short link in the html", () => {
    expect(email.text).toContain(args.unsubscribeUrl);
    expect(email.html).toContain(`<a href="${args.unsubscribeUrl}">Unsubscribe here</a>`);
    expect(email.html).not.toContain(`${args.unsubscribeUrl}</`);
  });
  it("leaves the body in the mail app's own font and sets only the signature in Times New Roman", () => {
    const beforeSignature = email.html.slice(0, email.html.indexOf("border-top"));
    expect(beforeSignature).not.toContain("font-family");
    expect(beforeSignature).not.toContain("font-size");
    const signature = email.html.slice(email.html.indexOf("border-top"));
    expect(signature).toContain("Times New Roman");
    expect(signature).toMatch(/font-size:14px/);
  });
  it("puts a bar above the signature, and sets the signature in Times New Roman in the html", () => {
    expect(email.text).toContain("\u23AF".repeat(17) + "\n");
    expect(email.text.indexOf("\u23AF")).toBeLessThan(email.text.indexOf("The 180 Degrees Consulting UCSC team"));
    expect(email.html).toContain("border-top:1px solid");
    expect(email.html.indexOf("border-top")).toBeLessThan(email.html.indexOf("The 180 Degrees Consulting UCSC team"));
  });
  it("keeps the postal address after the signature", () => {
    expect(email.text.indexOf("The 180 Degrees Consulting UCSC team")).toBeLessThan(email.text.indexOf("1156 High St"));
  });
  it("includes the address and team signature in both versions", () => {
    for (const part of [email.text, email.html]) {
      expect(part).toContain("1156 High St, Santa Cruz, CA 95064");
      expect(part).toContain("The 180 Degrees Consulting UCSC team");
    }
  });
  describe("signature", () => {
    const signature = "Best regards,\n\nAman Avinash\nDirector of Projects | 180 Degrees Consulting\n[LinkedIn](https://linkedin.com/in/x) \uFE31 [Learn More About Us](https://ucsc180dc.org)";
    const personal = buildOutreachEmail({ ...args, signature });
    it("uses the full signature, one line per line", () => {
      expect(personal.text).toContain("Best regards,\n\nAman Avinash\nDirector of Projects | 180 Degrees Consulting\n");
      expect(personal.html).toContain("<div>Best regards,</div>");
      expect(personal.html).toContain("<div>Aman Avinash</div><div>Director of Projects | 180 Degrees Consulting</div>");
      expect(personal.text).not.toContain("The 180 Degrees Consulting UCSC team");
    });
    it("turns the blank line in the signature into a small spacer, not a full empty line", () => {
      expect(personal.html).toContain('<div style="height:6px"></div>');
      expect(personal.html).not.toContain("<br><br>");
    });
    it("shows links as clickable words in the html and as label plus address in plain text", () => {
      expect(personal.html).toContain('<a href="https://linkedin.com/in/x">LinkedIn</a>');
      expect(personal.html).toContain('<a href="https://ucsc180dc.org">Learn More About Us</a>');
      expect(personal.text).toContain("LinkedIn (https://linkedin.com/in/x)");
    });
    it("only turns http(s) links into anchors and escapes everything else", () => {
      const e = buildOutreachEmail({ ...args, signature: "Hi <b>\n[x](javascript:alert(1))" });
      expect(e.html).not.toContain("<b>");
      expect(e.html).not.toContain("<a href=\"javascript");
    });
    it("falls back to the team signature", () => {
      const team = buildOutreachEmail(args);
      expect(team.text).toContain("Best,\nThe 180 Degrees Consulting UCSC team");
      expect(team.html).toContain("<div>Best,</div><div>The 180 Degrees Consulting UCSC team</div>");
    });
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
  const input = {
    company: "Acme",
    contactName: "Jo Lee",
    fromEmail: "jo@acme.com",
    classification: "interested" as const,
    subject: "Re: Helping Acme grow",
    text: "Sounds good, call Thursday?",
    portalUrl: "https://ucsc180dc.org/portal/admin/outreach?prospect=1",
    unmatched: false,
  };
  const fwd = buildReplyForwardEmail(input);

  it("puts the outcome and the company in the subject so execs can triage from the inbox list", () => {
    expect(fwd.subject).toBe("[Interested] Acme: Jo Lee replied");
  });
  it("opens with one plain sentence about what happened", () => {
    expect(fwd.text.split("\n")[0]).toBe("Jo Lee at Acme replied and sounds interested.");
  });
  it("has their message, what to do, and what the system already did, in that order", () => {
    const at = (label: string) => fwd.text.indexOf(label);
    expect(at("THEIR MESSAGE")).toBeGreaterThan(-1);
    expect(at("THEIR MESSAGE")).toBeLessThan(at("WHAT TO DO"));
    expect(at("WHAT TO DO")).toBeLessThan(at("WHAT THE SYSTEM ALREADY DID"));
    expect(fwd.text).toContain("Sounds good, call Thursday?");
    expect(fwd.text).toContain("Reply all");
    expect(fwd.text).toContain("Stopped all follow-up emails");
    expect(fwd.text).toContain("/portal/admin/outreach?prospect=1");
  });
  it("tells execs there is nothing to do when someone opts out", () => {
    const e = buildReplyForwardEmail({ ...input, classification: "unsubscribe", text: "stop" });
    expect(e.subject).toBe("[Unsubscribed] Acme: Jo Lee replied");
    expect(e.text).toContain("asked us to stop emailing");
    expect(e.text).toContain("Nothing to do");
    expect(e.text).toContain("do-not-contact list");
  });
  it("says an automatic reply needs nothing", () => {
    const e = buildReplyForwardEmail({ ...input, classification: "auto_reply" });
    expect(e.subject.startsWith("[Auto-reply]")).toBe(true);
    expect(e.text).toContain("Nothing to do");
  });
  it("labels unmatched replies", () => {
    const u = buildReplyForwardEmail({ company: null, contactName: null, fromEmail: "x@y.co", classification: "other", subject: "hi", text: "t", portalUrl: "https://p", unmatched: true });
    expect(u.subject).toBe("[Unmatched] Reply from x@y.co: hi");
    expect(u.text).toContain("could not be matched");
  });
  it("escapes html in their message", () => {
    expect(buildReplyForwardEmail({ ...input, text: "<script>x</script>" }).html).not.toContain("<script>");
  });
});

describe("buildBrakeAlertEmail", () => {
  it("explains the reason in plain words", () => {
    const e = buildBrakeAlertEmail("bounce_rate", "https://p");
    expect(e.subject).toMatch(/paused/i);
    expect(e.text).toMatch(/bounce/i);
  });
});
