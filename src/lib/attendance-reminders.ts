import { ORG_TIME_ZONE } from "./date";

const REMINDER_HOUR = 21;

/** True when `now` falls in the 9pm hour in the org's time zone (DST-aware). */
export function isReminderHour(now: Date): boolean {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: ORG_TIME_ZONE,
    hourCycle: "h23",
    hour: "2-digit",
  }).format(now);
  return Number(hour) === REMINDER_HOUR;
}

export interface ReminderLead {
  projectId: string;
  email: string | null;
  archivedAt: string | null;
}

export interface ReminderProject {
  id: string;
  name: string;
}

export interface Reminder {
  projectId: string;
  projectName: string;
  date: string;
  to: string;
}

/**
 * Who to email: every non-archived lead (once) of each project that has no
 * attendance logged for `today`, but only if `today` is a meeting day.
 */
export function selectReminders(input: {
  today: string;
  meetingDates: string[];
  projects: ReminderProject[];
  loggedProjectIds: string[];
  leads: ReminderLead[];
}): Reminder[] {
  if (!input.meetingDates.includes(input.today)) return [];

  const logged = new Set(input.loggedProjectIds);
  const reminders: Reminder[] = [];

  for (const project of input.projects) {
    if (logged.has(project.id)) continue;

    const seen = new Set<string>();
    for (const lead of input.leads) {
      if (lead.projectId !== project.id || lead.archivedAt) continue;
      const email = lead.email?.trim();
      if (!email || seen.has(email.toLowerCase())) continue;
      seen.add(email.toLowerCase());
      reminders.push({ projectId: project.id, projectName: project.name, date: input.today, to: email });
    }
  }

  return reminders;
}
