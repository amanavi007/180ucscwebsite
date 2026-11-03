import { describe, expect, it, vi } from "vitest";
import { handleResendWebhook, type WebhookDeps } from "./webhook-handler";

const REPLIES = "replies@consulting.ucsc180dc.org";

function deps(over: Partial<WebhookDeps> = {}): WebhookDeps & { calls: string[] } {
  const calls: string[] = [];
  const track = <T extends unknown[], R>(name: string, value: R) =>
    vi.fn(async (...args: T) => {
      calls.push(`${name}:${JSON.stringify(args)}`);
      return value;
    });
  const d: WebhookDeps = {
    repliesAddress: REPLIES,
    unsubscribeAddress: "unsubscribe@consulting.ucsc180dc.org",
    verify: (raw) => JSON.parse(raw),
    findMessageByResendId: track("findMessage", null),
    fetchReceived: track("fetch", {
      from: "Jo Lee <jo@acme.com>",
      subject: "Re: Helping Acme",
      text: "Sounds good, can we talk Thursday?",
      headers: null,
    }),
    hasForwardedReply: track("hasForwarded", false),
    matchProspect: track("match", { id: "p1", company: "Acme", contactName: "Jo Lee" }),
    saveReply: track("saveReply", undefined),
    markReplied: track("markReplied", undefined),
    unsubscribe: track("unsubscribe", undefined),
    pauseSequence: track("pause", undefined),
    forward: track("forward", undefined),
    markForwarded: track("markForwarded", undefined),
    markBounced: track("markBounced", undefined),
    markComplained: track("markComplained", undefined),
    markSendFailed: track("markSendFailed", undefined),
    recordDelivered: track("delivered", undefined),
    checkBrakes: track("checkBrakes", undefined),
    ...over,
  };
  return Object.assign(d, { calls });
}

const post = (body: unknown) => new Request("https://x/api/webhooks/resend", { method: "POST", body: JSON.stringify(body) });
const received = (to: string[] = [REPLIES], id = "in_1") => ({ type: "email.received", data: { email_id: id, to, from: "jo@acme.com", subject: "Re: x" } });

describe("handleResendWebhook", () => {
  it("rejects a bad signature with 400 and does nothing", async () => {
    const d = deps({
      verify: () => {
        throw new Error("bad signature");
      },
    });
    const res = await handleResendWebhook(post(received()), d);
    expect(res.status).toBe(400);
    expect(d.calls).toEqual([]);
  });

  it("ignores events for emails that are not outreach (booking confirmations share the account)", async () => {
    const d = deps(); // findMessageByResendId -> null
    for (const type of ["email.bounced", "email.complained", "email.delivered"]) {
      const res = await handleResendWebhook(post({ type, data: { email_id: "re_booking", bounce: { type: "Permanent" } } }), d);
      expect(res.status).toBe(200);
    }
    expect(d.calls.filter((c) => !c.startsWith("findMessage"))).toEqual([]);
  });

  it("ignores unrelated event types", async () => {
    const d = deps();
    const res = await handleResendWebhook(post({ type: "domain.updated", data: {} }), d);
    expect(res.status).toBe(200);
    expect(d.calls).toEqual([]);
  });

  it("marks a hard bounce, then checks the brakes", async () => {
    const d = deps({ findMessageByResendId: vi.fn(async () => ({ messageId: "m1", prospectId: "p1" })) });
    await handleResendWebhook(post({ type: "email.bounced", data: { email_id: "re_1", to: ["jo@acme.com"], bounce: { type: "Permanent", message: "no mailbox" } } }), d);
    expect(d.markBounced).toHaveBeenCalledWith({ prospectId: "p1", messageId: "m1", email: "jo@acme.com", reason: "no mailbox" });
    expect(d.checkBrakes).toHaveBeenCalledTimes(1);
  });

  it("does not suppress on a transient bounce", async () => {
    const d = deps({ findMessageByResendId: vi.fn(async () => ({ messageId: "m1", prospectId: "p1" })) });
    await handleResendWebhook(post({ type: "email.bounced", data: { email_id: "re_1", to: ["jo@acme.com"], bounce: { type: "Transient", message: "mailbox full" } } }), d);
    expect(d.markBounced).not.toHaveBeenCalled();
  });

  it("handles a spam complaint", async () => {
    const d = deps({ findMessageByResendId: vi.fn(async () => ({ messageId: "m1", prospectId: "p1" })) });
    await handleResendWebhook(post({ type: "email.complained", data: { email_id: "re_1", to: ["jo@acme.com"] } }), d);
    expect(d.markComplained).toHaveBeenCalledWith({ prospectId: "p1", messageId: "m1", email: "jo@acme.com" });
    expect(d.checkBrakes).toHaveBeenCalledTimes(1);
  });

  it("marks the prospect replied, saves the reply and forwards it to the execs", async () => {
    const d = deps();
    const res = await handleResendWebhook(post(received()), d);
    expect(res.status).toBe(200);
    expect(d.markReplied).toHaveBeenCalledWith("p1");
    expect(d.forward).toHaveBeenCalledWith(
      expect.objectContaining({ company: "Acme", contactName: "Jo Lee", fromEmail: "jo@acme.com", classification: "interested", unmatched: false, text: "Sounds good, can we talk Thursday?" }),
    );
    expect(d.markForwarded).toHaveBeenCalledWith("in_1");
    const order = d.calls.map((c) => c.split(":")[0]);
    expect(order.indexOf("saveReply")).toBeLessThan(order.indexOf("markReplied"));
    expect(order.indexOf("markReplied")).toBeLessThan(order.indexOf("forward"));
  });

  it("still forwards a reply from an unknown sender, touching no prospect", async () => {
    const d = deps({ matchProspect: vi.fn(async () => null) });
    await handleResendWebhook(post(received()), d);
    expect(d.forward).toHaveBeenCalledWith(expect.objectContaining({ unmatched: true, company: null }));
    expect(d.markReplied).not.toHaveBeenCalled();
    expect(d.unsubscribe).not.toHaveBeenCalled();
  });

  it("unsubscribes on a stop request or a plain no, and still forwards", async () => {
    for (const text of ["Please remove me from your list", "Thanks, not interested"]) {
      const d = deps({ fetchReceived: vi.fn(async () => ({ from: "jo@acme.com", subject: "Re", text, headers: null })) });
      await handleResendWebhook(post(received()), d);
      expect(d.unsubscribe).toHaveBeenCalledWith("p1", expect.any(String));
      expect(d.markReplied).not.toHaveBeenCalled();
      expect(d.forward).toHaveBeenCalledTimes(1);
    }
  });

  it("pauses (not stops) the sequence on an auto reply, and still forwards", async () => {
    const d = deps({ fetchReceived: vi.fn(async () => ({ from: "jo@acme.com", subject: "Automatic reply: Re", text: "I am away", headers: null })) });
    await handleResendWebhook(post(received()), d);
    expect(d.pauseSequence).toHaveBeenCalledWith("p1");
    expect(d.markReplied).not.toHaveBeenCalled();
    expect(d.forward).toHaveBeenCalledWith(expect.objectContaining({ classification: "auto_reply" }));
  });

  it("treats mail to the unsubscribe address as an unsubscribe from the sender", async () => {
    const d = deps({ fetchReceived: vi.fn(async () => ({ from: "jo@acme.com", subject: "unsubscribe", text: "", headers: null })) });
    await handleResendWebhook(post(received(["unsubscribe@consulting.ucsc180dc.org"])), d);
    expect(d.unsubscribe).toHaveBeenCalledWith("p1", expect.any(String));
  });

  it("ignores inbound mail addressed to anything else", async () => {
    const d = deps();
    await handleResendWebhook(post(received(["someone-else@consulting.ucsc180dc.org"])), d);
    expect(d.fetchReceived).not.toHaveBeenCalled();
    expect(d.forward).not.toHaveBeenCalled();
  });

  it("forwards once when the same webhook is delivered twice", async () => {
    let forwarded = false;
    const d = deps({
      hasForwardedReply: vi.fn(async () => forwarded),
      markForwarded: vi.fn(async () => {
        forwarded = true;
      }),
    });
    await handleResendWebhook(post(received()), d);
    await handleResendWebhook(post(received()), d);
    expect(d.forward).toHaveBeenCalledTimes(1);
  });

  it("answers 500 when forwarding fails so Resend retries, and does not mark it forwarded", async () => {
    const d = deps({
      forward: vi.fn(async () => {
        throw new Error("smtp down");
      }),
    });
    const res = await handleResendWebhook(post(received()), d);
    expect(res.status).toBe(500);
    expect(d.markForwarded).not.toHaveBeenCalled();
  });

  describe("emails that were never delivered", () => {
    const found = { messageId: "m1", prospectId: "p1" };

    it("marks an email Resend could not send as failed, with Resend's reason", async () => {
      const d = deps({ findMessageByResendId: vi.fn(async () => found) });
      const res = await handleResendWebhook(post({ type: "email.failed", data: { email_id: "re_1", to: ["jo@acme.com"], failed: { reason: "Could not reach the mail server" } } }), d);
      expect(res.status).toBe(200);
      expect(d.markSendFailed).toHaveBeenCalledWith({ ...found, reason: "Could not reach the mail server" });
      expect(d.markBounced).not.toHaveBeenCalled();
    });

    it("treats an address on Resend's suppression list like a bounce, so it joins our do-not-contact list", async () => {
      const d = deps({ findMessageByResendId: vi.fn(async () => found) });
      await handleResendWebhook(post({ type: "email.suppressed", data: { email_id: "re_1", to: ["jo@acme.com"], suppressed: { message: "Previously bounced" } } }), d);
      expect(d.markBounced).toHaveBeenCalledWith({ ...found, email: "jo@acme.com", reason: "Previously bounced" });
      expect(d.checkBrakes).toHaveBeenCalled();
    });

    it("ignores failures for emails that are not outreach", async () => {
      const d = deps();
      const res = await handleResendWebhook(post({ type: "email.failed", data: { email_id: "re_booking" } }), d);
      expect(res.status).toBe(200);
      expect(d.markSendFailed).not.toHaveBeenCalled();
    });
  });

  it("sends a 'not right now' reply to a human instead of removing the company", async () => {
    const d = deps({
      fetchReceived: vi.fn(async () => ({ from: "Jo Lee <jo@acme.com>", subject: "Re: x", text: "Thanks, not right now. Check back next quarter.", headers: null })),
    });
    await handleResendWebhook(post(received()), d);
    expect(d.unsubscribe).not.toHaveBeenCalled();
    expect(d.markReplied).toHaveBeenCalledWith("p1");
    expect(d.saveReply).toHaveBeenCalledWith(expect.objectContaining({ classification: "later" }));
  });
});
