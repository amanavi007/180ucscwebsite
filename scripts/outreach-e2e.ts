/**
 * End-to-end check of the outreach pipeline against the real database and Resend, for ONE test prospect.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env.local scripts/outreach-e2e.ts <phase>
 *
 * Phases: setup | reset | prepare | send | preview | status | cleanup
 * The runner is forced into "live" mode in memory only (org_settings is never changed), and every
 * dependency that lists prospects or drafts is filtered to the test prospect, so real prospects are untouched.
 */
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { EXEC_ROLES } from "@/lib/auth/roles";
import { buildPrepareDeps, buildSendDeps, factsToJson, loadOutreachSettings, outreachEnv } from "@/lib/data/outreach";
import { buildOutreachEmail } from "@/lib/email/outreach-emails";
import { buildSignature, pickSender } from "@/lib/outreach/senders";
import { buildFromAddress } from "@/lib/outreach/settings";
import { sendOutreachEmail } from "@/lib/email/outreach-send";
import { buildBookingUrl } from "@/lib/outreach/booking-link";
import { listUnsubscribeHeaders, oneClickUrl, signUnsubscribeToken, unsubscribeUrl } from "@/lib/outreach/unsubscribe";
import { runPrepare, runSend } from "@/lib/outreach/runner";

const TEST_EMAIL = process.env.OUTREACH_E2E_EMAIL ?? "amanavinash007@gmail.com";
const TEST_COMPANY = "ZZ Pipeline Test Co";

const admin = createAdminClient();

async function testProspect() {
  const { data, error } = await admin.from("outreach_prospects").select("*").eq("contact_email", TEST_EMAIL).maybeSingle();
  if (error) throw error;
  return data;
}

async function setup() {
  if (await testProspect()) return console.log("test prospect already exists");
  const { data: execs, error } = await admin.from("profiles").select("id").in("role", EXEC_ROLES).limit(1);
  if (error || !execs?.[0]) throw error ?? new Error("no exec profile found");
  const { error: insertError } = await admin.from("outreach_prospects").insert({
    company: TEST_COMPANY,
    website: "https://example.com",
    niche: "tech",
    size_stage: "Seed stage, 6 people",
    summary: "A made-up software startup used only to test the 180DC outreach pipeline.",
    why_fit: "Small team building a B2B scheduling product that has not yet validated its pricing.",
    facts: factsToJson([
      { text: "ZZ Pipeline Test Co sells a scheduling tool to dental clinics.", sourceUrl: "https://example.com/about" },
      { text: "It launched a free tier in September and has not published paid pricing.", sourceUrl: "https://example.com/pricing" },
    ]),
    contact_name: "Test Founder",
    contact_role: "Co-founder",
    contact_email: TEST_EMAIL,
    contact_domain: TEST_EMAIL.split("@")[1],
    created_by: execs[0].id,
  });
  if (insertError) throw insertError;
  console.log("created test prospect for", TEST_EMAIL);
}

async function prepare() {
  const p = await testProspect();
  if (!p) throw new Error("run setup first");
  const deps = await buildPrepareDeps();
  const only = <T extends { id: string }>(rows: T[]) => rows.filter((r) => r.id === p.id);
  const result = await runPrepare({
    ...deps,
    settings: { ...deps.settings, mode: "live" },
    listProspects: async (statuses, limit) => only(await deps.listProspects(statuses, 500)).slice(0, limit),
    listScheduledDue: async (before) => (await deps.listScheduledDue(before)).filter((s) => s.prospect.id === p.id),
    // The MX check is real; the domain is gmail.com, which has MX records.
  });
  console.log("prepare:", result);
}

async function send() {
  const p = await testProspect();
  if (!p) throw new Error("run setup first");
  const deps = await buildSendDeps();
  const bookingOpen = await deps.bookingOpen();
  console.log("booking open:", bookingOpen, "| real settings mode:", deps.settings.mode);
  const result = await runSend({
    ...deps,
    settings: { ...deps.settings, mode: "live", paused: false, startedOn: deps.today, dailyCapOverride: 1 },
    dueDrafts: async (at, limit) => (await deps.dueDrafts(at, 500)).filter((d) => d.prospect.id === p.id).slice(0, limit),
    setPaused: async () => console.log("(would pause sending)"),
    setStartedOn: async () => {},
    notifyBrake: async (reason) => console.log("(would alert execs of brake:", reason + ")"),
  });
  console.log("send:", result);

  // IMMEDIATE=1: pull the scheduled time forward to a minute from now, so a test does not wait for the random time of day.
  if (process.env.IMMEDIATE && result.scheduled > 0) {
    const { data: m } = await admin.from("outreach_messages").select("id, resend_id").eq("prospect_id", p.id).eq("status", "scheduled").single();
    const at = new Date(Date.now() + 60_000);
    const { error } = await new Resend(process.env.OUTREACH_RESEND_API_KEY).emails.update({ id: m!.resend_id!, scheduledAt: at.toISOString() });
    if (error) throw new Error(error.message);
    await admin.from("outreach_messages").update({ scheduled_for: at.toISOString() }).eq("id", m!.id);
    console.log("delivery pulled forward to", at.toISOString());
  }
}

/** Sends the test prospect's current draft to the test inbox right now, built exactly as the runner builds it. Changes no state. */
async function preview() {
  const p = await testProspect();
  if (!p) throw new Error("run setup first");
  const { data: message } = await admin.from("outreach_messages").select("subject, body_text").eq("prospect_id", p.id).in("status", ["draft", "scheduled", "sent"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!message) throw new Error("no draft yet: run prepare first");
  const env = outreachEnv(await loadOutreachSettings(admin));
  const token = signUnsubscribeToken(p.id, env.unsubscribeSecret);
  const sender = pickSender(env.settings.senders, p.id, p.sender_id);
  const email = buildOutreachEmail({
    subject: message.subject,
    bodyText: message.body_text,
    bookingUrl: buildBookingUrl(env.siteUrl, p.booking_token),
    unsubscribeUrl: unsubscribeUrl(token, env.siteUrl),
    senderName: env.settings.senderName,
    postalAddress: env.settings.postalAddress,
    signature: sender ? buildSignature(sender, env.siteUrl) : env.settings.signature,
    servicesUrl: `${env.siteUrl}/services`,
  });
  const from = sender ? buildFromAddress(env.fromAddress, sender.name) : env.fromAddress;
  const { resendId } = await sendOutreachEmail({
    to: [TEST_EMAIL],
    from,
    replyTo: env.replyTo,
    subject: email.subject,
    text: email.text,
    html: email.html,
    headers: listUnsubscribeHeaders(oneClickUrl(token, env.siteUrl), env.unsubscribeMailto),
  });
  console.log("sent now from", from, "to", TEST_EMAIL, resendId);
}

async function status() {
  const p = await testProspect();
  if (!p) return console.log("no test prospect");
  const [{ data: messages }, { data: events }, { data: replies }] = await Promise.all([
    admin.from("outreach_messages").select("step, status, subject, body_text, scheduled_for, sent_at, error, resend_id").eq("prospect_id", p.id).order("created_at"),
    admin.from("outreach_events").select("kind, detail, created_at").eq("prospect_id", p.id).order("created_at"),
    admin.from("outreach_replies").select("classification, subject, forwarded_at, created_at").eq("prospect_id", p.id),
  ]);
  console.log({ status: p.status, reason: p.status_reason, step: p.step, nextActionAt: p.next_action_at });
  console.log("messages", messages);
  console.log("events", events);
  console.log("replies", replies);
}

async function cleanup() {
  const p = await testProspect();
  if (p) {
    const { error } = await admin.from("outreach_prospects").delete().eq("id", p.id);
    if (error) throw error;
  }
  await admin.from("outreach_suppressions").delete().eq("email", TEST_EMAIL);
  console.log("removed test prospect, its messages/events/replies, and any test suppression");
}

async function reset() {
  await cleanup();
  await setup();
}

const phases = { setup, reset, prepare, send, preview, status, cleanup } as const;
const phase = process.argv[2] as keyof typeof phases;
if (!phases[phase]) {
  console.error("usage: outreach-e2e.ts <setup|reset|prepare|send|preview|status|cleanup>");
  process.exit(1);
}
phases[phase]().catch((err) => {
  console.error(err);
  process.exit(1);
});
