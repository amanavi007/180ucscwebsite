import { describe, expect, it } from "vitest";
import { classifyReply, matchReplyToProspect, stripQuotedReply } from "./replies";

const base = { subject: "Re: Helping Acme", headers: null as Record<string, string> | null };

describe("classifyReply", () => {
  it("treats auto-reply headers as auto replies", () => {
    expect(classifyReply({ ...base, text: "I am out until Monday.", headers: { "Auto-Submitted": "auto-replied" } })).toBe("auto_reply");
    expect(classifyReply({ ...base, text: "x", headers: { "X-Autoreply": "yes" } })).toBe("auto_reply");
    expect(classifyReply({ ...base, text: "x", headers: { Precedence: "auto_reply" } })).toBe("auto_reply");
  });
  it("does not treat Auto-Submitted: no as an auto reply", () => {
    expect(classifyReply({ ...base, text: "Sounds good, let's talk.", headers: { "Auto-Submitted": "no" } })).toBe("interested");
  });
  it("treats out-of-office subjects as auto replies", () => {
    expect(classifyReply({ subject: "Automatic reply: Helping Acme", text: "away", headers: null })).toBe("auto_reply");
    expect(classifyReply({ subject: "Out of Office", text: "away", headers: null })).toBe("auto_reply");
  });
  it("spots unsubscribe requests", () => {
    expect(classifyReply({ ...base, text: "Please remove me from your list.", headers: null })).toBe("unsubscribe");
    expect(classifyReply({ ...base, text: "STOP emailing us", headers: null })).toBe("unsubscribe");
    expect(classifyReply({ ...base, text: "unsubscribe", headers: null })).toBe("unsubscribe");
  });
  it("spots a plain no, and does not mistake it for interest", () => {
    expect(classifyReply({ ...base, text: "Thanks, but we're not interested.", headers: null })).toBe("not_interested");
    expect(classifyReply({ ...base, text: "No thanks.", headers: null })).toBe("not_interested");
  });
  it("spots interest", () => {
    expect(classifyReply({ ...base, text: "Sounds interesting, can we talk Thursday?", headers: null })).toBe("interested");
    expect(classifyReply({ ...base, text: "Happy to chat next week.", headers: null })).toBe("interested");
  });
  it("calls other questions questions and everything else other", () => {
    expect(classifyReply({ ...base, text: "Who pays for this?", headers: null })).toBe("question");
    expect(classifyReply({ ...base, text: "Forwarding to my cofounder.", headers: null })).toBe("other");
  });
});

const OUR_EMAIL_QUOTED = `On Tue, Nov 3, 2026 at 11:22 AM 180 Degrees Consulting at UCSC <
team@consulting.ucsc180dc.org> wrote:

> Hi Test, we're 180 Degrees Consulting at UCSC.
>
> Best,
> The 180 Degrees Consulting UCSC team
>
> 180 Degrees Consulting at UCSC, 1156 High St, Santa Cruz, CA 95064
> Not interested? Unsubscribe here
> <https://www.ucsc180dc.org/unsubscribe?token=abc>
> and we won't email you again.
`;

describe("classifyReply: not now", () => {
  const classify = (text: string) => classifyReply({ subject: "Re: x", text, headers: null });
  it("keeps a timing answer out of the permanent no", () => {
    expect(classify("Not right now, but check back in the spring.")).toBe("later");
    expect(classify("Maybe next quarter, we're heads down.")).toBe("later");
    expect(classify("Bad timing for us. Reach back out in a few months.")).toBe("later");
  });
  it("still treats a plain no as a no", () => {
    expect(classify("Not interested, thanks.")).toBe("not_interested");
    expect(classify("Not interested right now, please remove me")).toBe("unsubscribe");
  });
});

describe("stripQuotedReply", () => {
  it("drops the Gmail quote block and keeps only what the person wrote", () => {
    expect(stripQuotedReply(`this sounds interesting, can we talk?\n\n${OUR_EMAIL_QUOTED}`)).toBe("this sounds interesting, can we talk?");
  });
  it("drops Outlook-style original message blocks", () => {
    expect(stripQuotedReply("Sure, Thursday works.\n\n-----Original Message-----\nFrom: team\nNot interested? Unsubscribe")).toBe("Sure, Thursday works.");
    expect(stripQuotedReply("Sure.\n\nFrom: 180 Degrees Consulting\nSent: Tuesday\nTo: me\nUnsubscribe here")).toBe("Sure.");
  });
  it("drops lines that start with > but keeps inline answers", () => {
    expect(stripQuotedReply("> Would a call help?\nYes, it would.")).toBe("Yes, it would.");
  });
  it("leaves a plain reply alone", () => {
    expect(stripQuotedReply("  Forwarding to my cofounder.  ")).toBe("Forwarding to my cofounder.");
  });
});

describe("classifyReply with quoted text", () => {
  it("is not fooled by the unsubscribe line in our own quoted email", () => {
    expect(classifyReply({ ...base, text: `this sounds interesting, can we talk?\n\n${OUR_EMAIL_QUOTED}`, headers: null })).toBe("interested");
  });
  it("still sees a real unsubscribe request above the quote", () => {
    expect(classifyReply({ ...base, text: `please unsubscribe me\n\n${OUR_EMAIL_QUOTED}`, headers: null })).toBe("unsubscribe");
  });
  it("calls a reply that is only a quote 'other'", () => {
    expect(classifyReply({ ...base, text: OUR_EMAIL_QUOTED, headers: null })).toBe("other");
  });
});

describe("matchReplyToProspect", () => {
  const byEmail = new Map([["jo@acme.com", "p1"]]);
  const byDomain = new Map([["acme.com", "p1"], ["gmail.com", "pgmail"]]);

  it("matches the exact address first", () => {
    expect(matchReplyToProspect({ fromEmail: "Jo@Acme.com", prospectsByEmail: byEmail, prospectsByDomain: byDomain })).toBe("p1");
  });
  it("matches a colleague at the same company domain", () => {
    expect(matchReplyToProspect({ fromEmail: "sam@acme.com", prospectsByEmail: byEmail, prospectsByDomain: byDomain })).toBe("p1");
  });
  it("never matches by a free-mail domain", () => {
    expect(matchReplyToProspect({ fromEmail: "someone@gmail.com", prospectsByEmail: byEmail, prospectsByDomain: byDomain })).toBeNull();
  });
  it("returns null for strangers", () => {
    expect(matchReplyToProspect({ fromEmail: "x@other.org", prospectsByEmail: byEmail, prospectsByDomain: byDomain })).toBeNull();
  });
  it("copes with display-name formats", () => {
    expect(matchReplyToProspect({ fromEmail: "Jo Lee <jo@acme.com>", prospectsByEmail: byEmail, prospectsByDomain: byDomain })).toBe("p1");
  });
});
