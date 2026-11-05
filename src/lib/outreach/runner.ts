import { buildOutreachEmail } from "@/lib/email/outreach-emails";
import { buildBookingUrl } from "./booking-link";
import { isNearDuplicate, type DraftKind, type DraftOutput } from "./draft";
import { OutreachAccountError } from "./errors";
import { dailyCap, evaluateBrakes, planSendTimes } from "./pacing";
import { nextActionAt, statusAfterSend, stepKind } from "./sequence";
import type { OutreachSettings } from "./settings";
import type { ProspectDraftRow, ProspectFact } from "./types";
import { listUnsubscribeHeaders, oneClickUrl, signUnsubscribeToken, unsubscribeUrl } from "./unsubscribe";
import { classifyEmail } from "./verify";

export interface RunnerProspect {
  id: string;
  company: string;
  website: string | null;
  niche: string | null;
  segment?: ProspectDraftRow["segment"];
  sizeStage: string | null;
  summary: string | null;
  whyFit: string | null;
  facts: ProspectFact[];
  contactName: string | null;
  contactRole: string | null;
  contactEmail: string;
  contactDomain: string;
  status: string;
  /** Emails already sent to this prospect. */
  step: number;
  nextActionAt: Date | null;
  firstSentAt: Date | null;
  bookingToken: string;
}

export interface ProspectPatch {
  status?: string;
  statusReason?: string | null;
  step?: number;
  nextActionAt?: Date | null;
  lastSentAt?: Date;
}

export interface MessagePatch {
  status?: string;
  resendId?: string | null;
  scheduledFor?: Date | null;
  sentAt?: Date;
  error?: string | null;
}

export interface RunnerMessage {
  id: string;
  prospectId: string;
  step: number;
  subject: string;
  bodyText: string;
  scheduledFor: Date | null;
}

export interface DueDraft {
  message: RunnerMessage;
  prospect: RunnerProspect;
}

export interface ScheduledMessage {
  messageId: string;
  step: number;
  scheduledFor: Date;
  prospect: RunnerProspect;
}

export interface SendArgs {
  to: string[];
  from: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
  scheduledAt?: Date;
}

export interface RunnerEnv {
  now: Date;
  settings: OutreachSettings;
  /** Today's date in Pacific, "YYYY-MM-DD". */
  today: string;
  siteUrl: string;
  unsubscribeSecret: string;
  unsubscribeMailto: string;
  fromAddress: string;
  replyTo: string;
  rng?: () => number;
}

interface SharedDeps extends RunnerEnv {
  /** Compare-and-set: applies `patch` only when the row is currently in one of `from`; false when it was not. */
  casProspect(id: string, from: string[], patch: ProspectPatch): Promise<boolean>;
  casMessage(id: string, from: string[], patch: MessagePatch): Promise<boolean>;
}

export interface PrepareDeps extends SharedDeps {
  /** Oldest due first. With `dueBy`, only prospects whose next action is due by then; the rest cannot crowd them out of the limit. */
  listProspects(statuses: string[], limit: number, opts?: { dueBy?: Date }): Promise<RunnerProspect[]>;
  checkMx(domain: string): Promise<boolean>;
  draft(args: { row: ProspectDraftRow; step: DraftKind; previousSubjects: string[] }): Promise<{ draft: DraftOutput } | { needsAttention: string }>;
  insertDraft(prospectId: string, step: number, draft: DraftOutput): Promise<void>;
  hasMessageForStep(prospectId: string, step: number): Promise<boolean>;
  previousSubjects(prospectId: string): Promise<string[]>;
  recentDraftBodies(): Promise<string[]>;
  listScheduledDue(before: Date): Promise<ScheduledMessage[]>;
  /** Cancels unsent drafts that no longer pass the writing rules (written under older rules) so they get redrafted. Returns how many. */
  refreshStaleDrafts?(): Promise<number>;
  /** Stop starting new drafts after this long. Defaults to 150 seconds, which fits the cron's 300-second limit. */
  budgetMs?: number;
}

export interface SendDeps extends SharedDeps {
  /** Draft messages whose prospect is due for them (first emails, and follow-ups whose date has come). */
  dueDrafts(now: Date, limit: number): Promise<DueDraft[]>;
  /** Problems with a draft under the current writing rules; a draft with any is held back instead of sent. */
  draftProblems?(message: RunnerMessage, prospect: RunnerProspect): string[];
  isSuppressed(email: string): Promise<boolean>;
  /** True when another prospect at this company domain was emailed recently. */
  domainBusy(domain: string, excludeProspectId: string): Promise<boolean>;
  countScheduledOrSentToday(): Promise<number>;
  healthSnapshot(): Promise<{ sent: number; bounced: number; complained: number }>;
  bookingOpen(): Promise<boolean>;
  execEmails(): Promise<string[]>;
  send(args: SendArgs): Promise<{ resendId: string }>;
  setPaused(): Promise<void>;
  setStartedOn(date: string): Promise<void>;
  /** Emails execs about a brake; the implementation sends at most one alert per reason per day. */
  notifyBrake(reason: string): Promise<void>;
}

const SENDABLE = ["drafted", "sent", "follow_up_1", "follow_up_2"];
const EXEC_TEST_LIMIT = 5;
const RECONCILE_DELAY_MS = 5 * 60_000;
const CLOSING_GRACE_MS = 7 * 86_400_000;
const VERIFY_BATCH = 25;
/** First emails drafted per run, at least; raised to the number of companies discovery adds a day, so drafting never caps the pipeline. */
const DRAFT_BATCH = 20;
const DRAFT_CONCURRENCY = 4;
const MAX_DRAFT_BATCH = 40;
/** The cron may run for 300 seconds; stop starting new AI drafts well before that so the job finishes and records itself. */
const PREPARE_BUDGET_MS = 150_000;

export function toDraftRow(p: RunnerProspect): ProspectDraftRow {
  return {
    company: p.company,
    website: p.website,
    niche: p.niche,
    segment: p.segment ?? null,
    sizeStage: p.sizeStage,
    summary: p.summary,
    whyFit: p.whyFit,
    facts: p.facts,
    contactName: p.contactName,
    contactRole: p.contactRole,
    contactEmail: p.contactEmail,
  };
}

export interface PrepareResult {
  verified: number;
  drafted: number;
  needsAttention: number;
  reconciled: number;
  followUps: number;
  /** Old drafts that failed the current rules and were sent back for rewriting. */
  staleRewritten?: number;
}

/** Verifies new prospects, drafts emails, turns past scheduled sends into sent ones, and drafts due follow-ups. */
export async function runPrepare(deps: PrepareDeps): Promise<PrepareResult> {
  const result: PrepareResult = { verified: 0, drafted: 0, needsAttention: 0, reconciled: 0, followUps: 0 };
  const { settings, now } = deps;
  if (settings.mode === "off") return result;

  const stale = deps.refreshStaleDrafts ? await deps.refreshStaleDrafts() : 0;
  if (stale > 0) result.staleRewritten = stale;

  if (settings.mode === "live") {
    for (const s of await deps.listScheduledDue(new Date(now.getTime() - RECONCILE_DELAY_MS))) {
      if (!(await deps.casMessage(s.messageId, ["scheduled"], { status: "sent", sentAt: s.scheduledFor }))) continue;
      result.reconciled++;
      const newStep = s.step + 1;
      const first = s.step === 0 ? s.scheduledFor : (s.prospect.firstSentAt ?? s.scheduledFor);
      const next = nextActionAt(first, settings.followupDays, newStep) ?? new Date(s.scheduledFor.getTime() + CLOSING_GRACE_MS);
      await deps.casProspect(s.prospect.id, ["queued"], {
        status: statusAfterSend(s.step),
        step: newStep,
        lastSentAt: s.scheduledFor,
        nextActionAt: next,
      });
    }
    for (const p of await deps.listProspects(["closing_note"], 100, { dueBy: now })) {
      await deps.casProspect(p.id, ["closing_note"], { status: "no_response" });
    }
  }

  const toVerify = await deps.listProspects(["new"], VERIFY_BATCH);
  // DNS lookups wait on the network, so they run side by side instead of one after another.
  const hasMx = await Promise.all(toVerify.map((p) => (classifyEmail(p.contactEmail).disposable ? Promise.resolve(true) : deps.checkMx(p.contactDomain))));
  for (const [i, p] of toVerify.entries()) {
    const info = classifyEmail(p.contactEmail);
    let reason: string | null = null;
    if (info.disposable) reason = "Disposable email domain.";
    else if (!hasMx[i]) reason = "The email domain can't receive mail.";
    if (reason) {
      await deps.casProspect(p.id, ["new"], { status: "invalid", statusReason: reason });
    } else if (await deps.casProspect(p.id, ["new"], { status: "verified", statusReason: info.roleInbox ? "Generic inbox, not a named person." : null })) {
      result.verified++;
    }
  }

  const startedAt = Date.now();
  const budgetMs = deps.budgetMs ?? PREPARE_BUDGET_MS;
  const outOfTime = () => Date.now() - startedAt > budgetMs;
  const draftBatch = Math.min(MAX_DRAFT_BATCH, Math.max(DRAFT_BATCH, settings.discoveryPerDay));
  const batchBodies = await deps.recentDraftBodies();
  const batchSubjects: string[] = [];
  const toDraft = await deps.listProspects(["verified"], draftBatch);
  // The model is slow (up to two minutes for a draft that needs retries), so a few drafts are written at once.
  for (let i = 0; i < toDraft.length; i += DRAFT_CONCURRENCY) {
    if (outOfTime()) break;
    const chunk = toDraft.slice(i, i + DRAFT_CONCURRENCY);
    const earlier = await Promise.all(chunk.map((p) => deps.previousSubjects(p.id)));
    const firstTries = await Promise.all(chunk.map((p, j) => deps.draft({ row: toDraftRow(p), step: "first", previousSubjects: [...earlier[j], ...batchSubjects] })));
    for (let j = 0; j < chunk.length; j++) {
      const p = chunk[j];
      let outcome: { draft: DraftOutput } | { needsAttention: string } = firstTries[j];
      if (!("needsAttention" in outcome) && batchBodies.some((b) => isNearDuplicate(b, (outcome as { draft: DraftOutput }).draft.body))) {
        const again = await deps.draft({ row: toDraftRow(p), step: "first", previousSubjects: [...earlier[j], ...batchSubjects] });
        outcome = "needsAttention" in again || !batchBodies.some((b) => isNearDuplicate(b, again.draft.body)) ? again : { needsAttention: "Draft too similar to another in this batch." };
      }
      if ("needsAttention" in outcome) {
        if (await deps.casProspect(p.id, ["verified"], { status: "needs_attention", statusReason: outcome.needsAttention })) result.needsAttention++;
        continue;
      }
      if (!(await deps.casProspect(p.id, ["verified"], { status: "drafted", statusReason: null }))) continue;
      await deps.insertDraft(p.id, 0, outcome.draft);
      batchBodies.push(outcome.draft.body);
      batchSubjects.push(outcome.draft.subject);
      result.drafted++;
    }
  }

  if (settings.mode === "live") {
    const waiting = await deps.listProspects(["sent", "follow_up_1", "follow_up_2"], 100, { dueBy: now });
    for (const p of waiting) {
      if (outOfTime()) break;
      if (!p.nextActionAt || p.nextActionAt > now) continue;
      if (await deps.hasMessageForStep(p.id, p.step)) continue;
      const made = await deps.draft({ row: toDraftRow(p), step: stepKind(p.step), previousSubjects: await deps.previousSubjects(p.id) });
      if ("needsAttention" in made) {
        await deps.casProspect(p.id, [p.status], { status: "needs_attention", statusReason: made.needsAttention });
        result.needsAttention++;
        continue;
      }
      await deps.insertDraft(p.id, p.step, made.draft);
      result.followUps++;
    }
  }
  return result;
}

export interface SendResult {
  scheduled: number;
  skipped: string | null;
}

/** Plans today's sends within the pace limits and hands each to Resend for its randomized time. */
export async function runSend(deps: SendDeps): Promise<SendResult> {
  const { settings, now, today } = deps;
  if (settings.mode === "off") return { scheduled: 0, skipped: "mode_off" };
  if (settings.mode === "dry_run") return { scheduled: 0, skipped: "dry_run" };

  const brakes = evaluateBrakes({
    ...(await deps.healthSnapshot()),
    settings,
    bookingOpen: await deps.bookingOpen(),
    resendAccountError: false,
  });
  if (!brakes.allow) {
    const reason = brakes.reason!;
    if (reason === "bounce_rate" || reason === "complaint_rate") await deps.setPaused();
    if (reason !== "paused") await deps.notifyBrake(reason);
    return { scheduled: 0, skipped: reason };
  }

  const execOnly = settings.mode === "exec_only" || settings.mode === "self_only";
  let startedOn = settings.startedOn;
  if (!startedOn && !execOnly) {
    startedOn = today;
    await deps.setStartedOn(today);
  }
  let available = EXEC_TEST_LIMIT;
  if (!execOnly) {
    available = dailyCap(startedOn, today, settings.dailyCapOverride) - (await deps.countScheduledOrSentToday());
    if (available <= 0) return { scheduled: 0, skipped: "cap_reached" };
  }

  const picked: DueDraft[] = [];
  const domains = new Set<string>();
  for (const due of await deps.dueDrafts(now, available * 4)) {
    if (picked.length >= available) break;
    const { prospect } = due;
    if (deps.draftProblems && deps.draftProblems(due.message, prospect).length > 0) continue;
    if (domains.has(prospect.contactDomain)) continue;
    if (await deps.isSuppressed(prospect.contactEmail)) continue;
    if (await deps.domainBusy(prospect.contactDomain, prospect.id)) continue;
    domains.add(prospect.contactDomain);
    picked.push(due);
  }
  if (picked.length === 0) return { scheduled: 0, skipped: "nothing_due" };

  const times = execOnly
    ? picked.map(() => undefined)
    : planSendTimes({ now, count: picked.length, windowStartHour: settings.windowStartHour, windowEndHour: settings.windowEndHour, rng: deps.rng });
  if (times.length === 0) return { scheduled: 0, skipped: "no_send_times" };
  const testRecipients =
    settings.mode === "self_only"
      ? settings.testRecipient ? [settings.testRecipient] : []
      : execOnly ? await deps.execEmails() : [];
  if (execOnly && testRecipients.length === 0) return { scheduled: 0, skipped: "no_test_recipient" };

  let scheduled = 0;
  for (let i = 0; i < times.length; i++) {
    const { message, prospect } = picked[i];
    const at = times[i];
    const claimedProspectStatus = prospect.status;

    if (!execOnly) {
      if (!(await deps.casMessage(message.id, ["draft"], { status: "scheduled", scheduledFor: at ?? null }))) continue;
      if (!(await deps.casProspect(prospect.id, SENDABLE, { status: "queued" }))) {
        await deps.casMessage(message.id, ["scheduled"], { status: "draft", scheduledFor: null });
        continue;
      }
    }
    const rollback = async () => {
      if (execOnly) return;
      await deps.casMessage(message.id, ["scheduled"], { status: "draft", scheduledFor: null });
      await deps.casProspect(prospect.id, ["queued"], { status: claimedProspectStatus });
    };

    const token = signUnsubscribeToken(prospect.id, deps.unsubscribeSecret);
    const email = buildOutreachEmail({
      subject: execOnly ? `[TEST for ${prospect.company} → ${prospect.contactEmail}] ${message.subject}` : message.subject,
      bodyText: message.bodyText,
      bookingUrl: buildBookingUrl(deps.siteUrl, prospect.bookingToken),
      unsubscribeUrl: unsubscribeUrl(token, deps.siteUrl),
      senderName: settings.senderName,
      postalAddress: settings.postalAddress,
      signature: settings.signature,
    });
    try {
      const { resendId } = await deps.send({
        to: execOnly ? testRecipients : [prospect.contactEmail],
        from: deps.fromAddress,
        replyTo: deps.replyTo,
        subject: email.subject,
        text: email.text,
        html: email.html,
        headers: listUnsubscribeHeaders(oneClickUrl(token, deps.siteUrl), deps.unsubscribeMailto),
        scheduledAt: at,
      });
      if (!execOnly) await deps.casMessage(message.id, ["scheduled"], { resendId });
      scheduled++;
    } catch (err) {
      if (err instanceof OutreachAccountError) {
        await rollback();
        await deps.setPaused();
        await deps.notifyBrake("account_error");
        return { scheduled, skipped: "account_error" };
      }
      if (execOnly) continue;
      // Not retried by itself: an address Resend refuses would be refused again every day. A person sees it and decides.
      const reason = err instanceof Error ? err.message : String(err);
      await deps.casMessage(message.id, ["scheduled"], { status: "failed", error: reason });
      await deps.casProspect(prospect.id, ["queued"], { status: "needs_attention", statusReason: `The email could not be sent: ${reason}` });
    }
  }
  return { scheduled, skipped: null };
}
