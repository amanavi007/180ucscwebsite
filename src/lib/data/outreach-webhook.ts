import "server-only";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildReplyForwardEmail } from "@/lib/email/outreach-emails";
import { sendOutreachEmail } from "@/lib/email/outreach-send";
import { evaluateBrakes } from "@/lib/outreach/pacing";
import { extractEmail, matchReplyToProspect } from "@/lib/outreach/replies";
import type { WebhookDeps, WebhookEvent } from "@/lib/outreach/webhook-handler";
import { emailDomain } from "@/lib/outreach/verify";
import {
  addSuppression,
  alertExecsOfBrake,
  cancelScheduledMessages,
  execEmails,
  loadOutreachSettings,
  OUTREACH_PORTAL_PATH,
  recentHealth,
  recordOutreachEvent,
  setOutreachSetting,
  unsubscribeProspect,
} from "./outreach";

const DAY_MS = 86_400_000;
// Statuses a reply must never overwrite.
const KEEP_STATUSES = ["booked", "unsubscribed", "bounced", "invalid"];

function stripHtml(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildWebhookDeps(): WebhookDeps {
  const admin = createAdminClient();
  const resend = new Resend(process.env.OUTREACH_RESEND_API_KEY ?? "missing");
  const repliesAddress = (process.env.OUTREACH_REPLY_TO ?? "").toLowerCase();
  const domain = repliesAddress.split("@")[1] ?? "";

  return {
    repliesAddress,
    unsubscribeAddress: `unsubscribe@${domain}`,

    verify: (rawBody, headers) => {
      // Fail closed: with no secret configured, nothing may be accepted as genuine.
      const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
      if (!webhookSecret) throw new Error("RESEND_WEBHOOK_SECRET is not set.");
      return resend.webhooks.verify({
        payload: rawBody,
        headers: {
          id: headers.get("svix-id") ?? "",
          timestamp: headers.get("svix-timestamp") ?? "",
          signature: headers.get("svix-signature") ?? "",
        },
        webhookSecret,
      }) as unknown as WebhookEvent;
    },

    findMessageByResendId: async (resendId) => {
      const { data, error } = await admin.from("outreach_messages").select("id, prospect_id").eq("resend_id", resendId).maybeSingle();
      if (error) throw error;
      return data ? { messageId: data.id, prospectId: data.prospect_id } : null;
    },

    fetchReceived: async (emailId) => {
      const { data, error } = await resend.emails.receiving.get(emailId);
      if (error || !data) throw new Error(error?.message ?? "Could not read the received email.");
      return {
        from: data.from,
        subject: data.subject,
        text: (data.text ?? (data.html ? stripHtml(data.html) : "")).trim(),
        headers: data.headers,
      };
    },

    hasForwardedReply: async (emailId) => {
      const { data, error } = await admin.from("outreach_replies").select("forwarded_at").eq("resend_email_id", emailId).maybeSingle();
      if (error) throw error;
      return !!data?.forwarded_at;
    },

    matchProspect: async (fromEmail) => {
      const email = extractEmail(fromEmail);
      const [byEmail, byDomain] = await Promise.all([
        admin.from("outreach_prospects").select("id, company, contact_name").eq("contact_email", email).maybeSingle(),
        admin
          .from("outreach_prospects")
          .select("id, company, contact_name")
          .eq("contact_domain", emailDomain(email))
          .order("last_sent_at", { ascending: false, nullsFirst: false })
          .limit(1),
      ]);
      if (byEmail.error) throw byEmail.error;
      if (byDomain.error) throw byDomain.error;
      const row = byEmail.data ?? byDomain.data?.[0] ?? null;
      const id = matchReplyToProspect({
        fromEmail: email,
        prospectsByEmail: new Map(byEmail.data ? [[email, byEmail.data.id]] : []),
        prospectsByDomain: new Map(byDomain.data?.[0] ? [[emailDomain(email), byDomain.data[0].id]] : []),
      });
      return id && row ? { id, company: row.company, contactName: row.contact_name } : null;
    },

    saveReply: async (reply) => {
      const { error } = await admin.from("outreach_replies").upsert(
        {
          resend_email_id: reply.resendEmailId,
          prospect_id: reply.prospectId,
          from_email: reply.fromEmail,
          subject: reply.subject,
          snippet: reply.snippet,
          classification: reply.classification,
        },
        { onConflict: "resend_email_id" },
      );
      if (error) throw error;
    },

    markReplied: async (prospectId) => {
      await admin
        .from("outreach_prospects")
        .update({ status: "replied", status_reason: null, next_action_at: null })
        .eq("id", prospectId)
        .not("status", "in", `(${KEEP_STATUSES.join(",")})`);
      await cancelScheduledMessages(admin, prospectId);
      await recordOutreachEvent(admin, { prospectId, kind: "replied" });
    },

    unsubscribe: (prospectId, reason) => unsubscribeProspect(prospectId, reason),

    pauseSequence: async (prospectId) => {
      const { data } = await admin.from("outreach_prospects").select("next_action_at").eq("id", prospectId).maybeSingle();
      if (!data?.next_action_at) return;
      const pushed = new Date(Math.max(new Date(data.next_action_at).getTime(), Date.now() + DAY_MS));
      await admin.from("outreach_prospects").update({ next_action_at: pushed.toISOString() }).eq("id", prospectId);
    },

    forward: async (args) => {
      const to = await execEmails(admin);
      if (to.length === 0) throw new Error("No exec email addresses to forward to.");
      const portalUrl = `${process.env.NEXT_PUBLIC_SITE_URL}${OUTREACH_PORTAL_PATH}${args.prospectId ? `?prospect=${args.prospectId}` : ""}`;
      const email = buildReplyForwardEmail({
        company: args.company,
        contactName: args.contactName,
        fromEmail: args.fromEmail,
        classification: args.classification,
        subject: args.subject,
        text: args.text,
        portalUrl,
        unmatched: args.unmatched,
      });
      await sendOutreachEmail({
        to,
        from: process.env.OUTREACH_FROM ?? "",
        // Replying to the forward goes straight to the prospect.
        replyTo: args.fromEmail,
        subject: email.subject,
        text: email.text,
        html: email.html,
        headers: {},
      });
    },

    markForwarded: async (emailId) => {
      const { error } = await admin.from("outreach_replies").update({ forwarded_at: new Date().toISOString() }).eq("resend_email_id", emailId);
      if (error) throw error;
    },

    markBounced: async ({ prospectId, messageId, email, reason }) => {
      await admin
        .from("outreach_prospects")
        .update({ status: "bounced", status_reason: reason, next_action_at: null })
        .eq("id", prospectId)
        .not("status", "in", `(${["booked", "unsubscribed"].join(",")})`);
      await addSuppression(admin, email, "Bounced.");
      await cancelScheduledMessages(admin, prospectId);
      await recordOutreachEvent(admin, { prospectId, messageId, kind: "bounced", detail: { reason } });
    },

    markComplained: async ({ prospectId, messageId, email }) => {
      await admin
        .from("outreach_prospects")
        .update({ status: "unsubscribed", status_reason: "Marked an email as spam.", next_action_at: null })
        .eq("id", prospectId);
      await addSuppression(admin, email, "Marked an email as spam.");
      await cancelScheduledMessages(admin, prospectId);
      await recordOutreachEvent(admin, { prospectId, messageId, kind: "complained" });
    },

    recordDelivered: async ({ prospectId, messageId }) => {
      await recordOutreachEvent(admin, { prospectId, messageId, kind: "delivered" });
    },

    checkBrakes: async () => {
      const settings = await loadOutreachSettings(admin);
      const verdict = evaluateBrakes({
        ...(await recentHealth(admin)),
        settings: { ...settings, mode: "live", paused: false },
        bookingOpen: true,
        resendAccountError: false,
      });
      if (!verdict.allow && (verdict.reason === "bounce_rate" || verdict.reason === "complaint_rate")) {
        await setOutreachSetting(admin, "outreach_paused", "true");
        await alertExecsOfBrake(admin, verdict.reason);
      }
    },
  };
}
