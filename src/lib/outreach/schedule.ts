import { formatOrgDate, ORG_TIME_ZONE } from "@/lib/date";
import { dailyCap, pacificInstant } from "./pacing";
import type { OutreachSettings } from "./settings";

export interface ScheduleProspect {
  id: string;
  company: string;
  contactName: string | null;
  contactEmail: string;
  status: string;
  step: number;
  nextActionAt: string | null;
}

export interface ScheduleMessage {
  prospectId: string;
  step: number;
  subject: string;
  status: string;
  scheduledFor: string | null;
  sentAt: string | null;
  createdAt: string | null;
}

export interface ScheduleItem {
  prospectId: string;
  company: string;
  contact: string;
  step: number;
  /** Null for a follow-up that is not written yet (it is drafted the morning it is due). */
  subject: string | null;
  state: "sent" | "scheduled" | "planned";
  /** The exact send time, known only once Resend has the email. */
  at: string | null;
}

export interface ScheduleDay {
  date: string;
  label: string;
  weekend: boolean;
  /** How many emails may go out this day. */
  cap: number;
  items: ScheduleItem[];
}

export interface Schedule {
  days: ScheduleDay[];
  /** Companies verified but without a written email yet. */
  notDrafted: number;
  /** Companies the drafter or sender could not handle, waiting for a person. */
  needsAttention: number;
  /** Written emails that are not on any day shown, because the daily limit is full. */
  waitingBeyond: number;
}

const DAY_MS = 86_400_000;
const FOLLOW_UP_STATUSES = ["sent", "follow_up_1", "follow_up_2"];
const HORIZON_DAYS = 10;

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const isWeekend = (date: string) => [0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay());
const domainOf = (email: string) => email.split("@")[1]?.toLowerCase() ?? email;

function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00Z`));
}

const pacificHour = (now: Date) =>
  Number(new Intl.DateTimeFormat("en-US", { timeZone: ORG_TIME_ZONE, hourCycle: "h23", hour: "2-digit" }).format(now));

/**
 * What goes out today (exact, from what is already scheduled or sent) and what is expected on the next working days.
 * The future days copy the real sender: oldest written email first, one per company domain, no weekends, and no more
 * than the daily limit, which grows each day. The real sender picks its times when the morning job runs, so a future
 * day shows an order and a count, never a time.
 */
export function buildSchedule(args: {
  prospects: ScheduleProspect[];
  messages: ScheduleMessage[];
  settings: Pick<OutreachSettings, "mode" | "startedOn" | "dailyCapOverride" | "windowStartHour">;
  now: Date;
}): Schedule {
  const { prospects, messages, settings, now } = args;
  const today = formatOrgDate(now);
  const byId = new Map(prospects.map((p) => [p.id, p]));
  const startOfToday = pacificInstant(today, 0).getTime();
  const startOfTomorrow = pacificInstant(addDays(today, 1), 0).getTime();

  const item = (p: ScheduleProspect, m: { step: number; subject: string | null }, state: ScheduleItem["state"], at: string | null): ScheduleItem => ({
    prospectId: p.id,
    company: p.company,
    contact: p.contactName ? `${p.contactName}, ${p.contactEmail}` : p.contactEmail,
    step: m.step,
    subject: m.subject,
    state,
    at,
  });

  const todayActual: ScheduleItem[] = [];
  for (const m of messages) {
    const p = byId.get(m.prospectId);
    const when = m.sentAt ?? m.scheduledFor;
    if (!p || !when || !["scheduled", "sent"].includes(m.status)) continue;
    const t = Date.parse(when);
    if (t >= startOfToday && t < startOfTomorrow) todayActual.push(item(p, m, m.status === "sent" ? "sent" : "scheduled", when));
  }
  todayActual.sort((a, b) => Date.parse(a.at!) - Date.parse(b.at!));

  // The queue the sender draws from, oldest first.
  interface Queued {
    p: ScheduleProspect;
    step: number;
    subject: string | null;
    readyOn: string;
    order: number;
  }
  const queue: Queued[] = [];
  const draftedSteps = new Set<string>();
  messages.forEach((m, i) => {
    const p = byId.get(m.prospectId);
    if (!p || m.status !== "draft") return;
    const first = m.step === 0 && p.status === "drafted";
    const followUp = m.step > 0 && m.step === p.step && FOLLOW_UP_STATUSES.includes(p.status) && !!p.nextActionAt;
    if (!first && !followUp) return;
    draftedSteps.add(`${p.id}:${m.step}`);
    queue.push({ p, step: m.step, subject: m.subject, readyOn: first ? today : formatOrgDate(new Date(p.nextActionAt!)), order: m.createdAt ? Date.parse(m.createdAt) : i });
  });
  for (const p of prospects) {
    if (!FOLLOW_UP_STATUSES.includes(p.status) || !p.nextActionAt || draftedSteps.has(`${p.id}:${p.step}`)) continue;
    queue.push({ p, step: p.step, subject: null, readyOn: formatOrgDate(new Date(p.nextActionAt)), order: Date.parse(p.nextActionAt) });
  }
  queue.sort((a, b) => a.order - b.order);

  // Today's real list is shown as it is. The sender's morning job has already run unless it is still before the window.
  const projectToday = todayActual.length === 0 && pacificHour(now) < settings.windowStartHour;
  const days: ScheduleDay[] = [];
  const used = new Set<Queued>();
  let startedOn = settings.startedOn;
  for (let i = 0; i < HORIZON_DAYS; i++) {
    const date = addDays(today, i);
    const weekend = isWeekend(date);
    const projected = i > 0 || projectToday;
    if (!weekend && projected && !startedOn) startedOn = date; // the ramp counts from the first day that sends
    const cap = !weekend && projected ? dailyCap(startedOn, date, settings.dailyCapOverride) : i === 0 ? dailyCap(startedOn, date, settings.dailyCapOverride) : 0;
    const items: ScheduleItem[] = i === 0 ? [...todayActual] : [];
    if (!weekend && projected) {
      const domains = new Set<string>();
      for (const q of queue) {
        if (items.length >= cap) break;
        if (used.has(q) || q.readyOn > date) continue;
        const domain = domainOf(q.p.contactEmail);
        if (domains.has(domain)) continue;
        domains.add(domain);
        used.add(q);
        items.push(item(q.p, { step: q.step, subject: q.subject }, "planned", null));
      }
    }
    days.push({ date, label: dayLabel(date, today), weekend, cap, items });
  }

  return {
    days,
    notDrafted: prospects.filter((p) => ["new", "verified"].includes(p.status)).length,
    needsAttention: prospects.filter((p) => ["needs_attention", "replied"].includes(p.status)).length,
    waitingBeyond: queue.filter((q) => !used.has(q)).length,
  };
}
