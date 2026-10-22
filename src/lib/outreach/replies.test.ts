import { describe, expect, it } from "vitest";
import { classifyReply, matchReplyToProspect } from "./replies";

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
