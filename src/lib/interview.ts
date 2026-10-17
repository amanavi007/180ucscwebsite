import { isValidUcscEmail, minutesToTime, normalizeTime, overlaps, timeToMinutes } from "./coffee-chat";
import { zonedDateTimeToUtc } from "./date";

export const INTERVIEW_LOCATION = "Online";
export const DEFAULT_INTERVIEW_SLOT_MINUTES = 60;
export const INTERVIEW_GRID_MINUTES = 30;
export const INTERVIEW_MIN_LEAD_MINUTES = 12 * 60;
export const INTERVIEW_CANCEL_CUTOFF_MINUTES = 24 * 60;
export const MIN_PANEL_SIZE = 2;
export const MAX_PANEL_SIZE = 3;

export interface InterviewAvailabilityBlock {
  execId: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM" or "HH:MM:SS"
  endTime: string;
}

export interface InterviewSlotAssignment {
  slotId: string;
  date: string;
  startTime: string;
  endTime: string;
  execIds: string[];
}

export interface GeneratedInterviewSlot {
  date: string;
  startTime: string;
  endTime: string;
  execIds: string[];
}

/** How to split N free execs into panels: pairs, with one trio when N is odd. Nobody is left alone. */
export function panelSizes(freeCount: number): number[] {
  if (freeCount < MIN_PANEL_SIZE) return [];
  if (freeCount === 3) return [3];
  if (freeCount % 2 === 0) return Array<number>(freeCount / 2).fill(2);
  return [...Array<number>((freeCount - 3) / 2).fill(2), 3];
}

interface Interval {
  date: string;
  start: string;
  end: string;
}

/**
 * Builds interview panels. Candidate starts are every :00/:30 for which an
 * exec's block covers the whole slot. Windows are processed in time order;
 * for each, every free exec who is not already on an overlapping slot
 * (existing, or created earlier in this run) is split into panels of 2-3.
 * Ties favour the least-used exec and the pairing that has happened least,
 * then ids, so the same input always gives the same result. Existing slots
 * are never modified.
 */
export function generateInterviewSlots(
  availability: InterviewAvailabilityBlock[],
  existingSlots: InterviewSlotAssignment[] = [],
  slotMinutes: number = DEFAULT_INTERVIEW_SLOT_MINUTES,
): GeneratedInterviewSlot[] {
  const free = new Map<string, Set<string>>();
  for (const raw of availability) {
    const start = timeToMinutes(normalizeTime(raw.startTime));
    const end = timeToMinutes(normalizeTime(raw.endTime));
    for (let t = Math.ceil(start / INTERVIEW_GRID_MINUTES) * INTERVIEW_GRID_MINUTES; t + slotMinutes <= end; t += INTERVIEW_GRID_MINUTES) {
      const key = `${raw.date}|${minutesToTime(t)}`;
      if (!free.has(key)) free.set(key, new Set());
      free.get(key)!.add(raw.execId);
    }
  }

  const intervals = new Map<string, Interval[]>();
  const load = new Map<string, number>();
  const pairCount = new Map<string, number>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const loadOf = (id: string) => load.get(id) ?? 0;
  const pairsOf = (a: string, b: string) => pairCount.get(pairKey(a, b)) ?? 0;

  function record(execIds: string[], date: string, start: string, end: string) {
    for (const id of execIds) {
      if (!intervals.has(id)) intervals.set(id, []);
      intervals.get(id)!.push({ date, start, end });
      load.set(id, loadOf(id) + 1);
    }
    for (let i = 0; i < execIds.length; i++) {
      for (let j = i + 1; j < execIds.length; j++) {
        pairCount.set(pairKey(execIds[i], execIds[j]), pairsOf(execIds[i], execIds[j]) + 1);
      }
    }
  }

  for (const s of existingSlots) {
    record(s.execIds, s.date, normalizeTime(s.startTime), normalizeTime(s.endTime));
  }

  const generated: GeneratedInterviewSlot[] = [];
  for (const [key, execIds] of [...free].sort(([a], [b]) => a.localeCompare(b))) {
    const [date, startTime] = key.split("|");
    const endTime = minutesToTime(timeToMinutes(startTime) + slotMinutes);

    // Starts are staggered: one panel per start time, so the next :30 start can use other execs
    // (12-1, 12:30-1:30, 1-2). Execs who can't make the next start would otherwise be wasted, so they get panels now.
    const nextFree = free.get(`${date}|${minutesToTime(timeToMinutes(startTime) + INTERVIEW_GRID_MINUTES)}`);
    const isStranded = (id: string) => !nextFree?.has(id);
    const pool = [...execIds]
      .filter((id) => !(intervals.get(id) ?? []).some((i) => i.date === date && overlaps(i.start, i.end, startTime, endTime)))
      .sort((x, y) => Number(!isStranded(x)) - Number(!isStranded(y)) || loadOf(x) - loadOf(y) || x.localeCompare(y));

    function takePanel(from: string[], size: number) {
      const group = [from.shift()!];
      while (group.length < size) {
        let bestIndex = 0;
        let bestScore: [number, number, string] | null = null;
        from.forEach((candidate, index) => {
          const score: [number, number, string] = [
            group.reduce((sum, member) => sum + pairsOf(member, candidate), 0),
            loadOf(candidate),
            candidate,
          ];
          if (
            bestScore === null ||
            score[0] < bestScore[0] ||
            (score[0] === bestScore[0] && (score[1] < bestScore[1] || (score[1] === bestScore[1] && score[2] < bestScore[2])))
          ) {
            bestScore = score;
            bestIndex = index;
          }
        });
        group.push(from.splice(bestIndex, 1)[0]);
      }
      const sorted = [...group].sort();
      record(sorted, date, startTime, endTime);
      generated.push({ date, startTime, endTime, execIds: sorted });
    }

    if (pool.length >= MIN_PANEL_SIZE) takePanel(pool, pool.length === 3 ? 3 : 2);
    const stranded = pool.filter(isStranded);
    for (const size of panelSizes(stranded.length)) takePanel(stranded, size);
  }
  return generated;
}

export interface InterviewBookabilityInput {
  date: string;
  startTime: string;
  published: boolean;
  hasConfirmedBooking: boolean;
  execCount: number;
}

/** Whether a slot should be listed to (and bookable by) applicants right now. */
export function isInterviewSlotBookable(
  slot: InterviewBookabilityInput,
  now: Date,
  minLeadMinutes: number = INTERVIEW_MIN_LEAD_MINUTES,
): boolean {
  if (!slot.published || slot.hasConfirmedBooking || slot.execCount < MIN_PANEL_SIZE) return false;
  const slotStart = zonedDateTimeToUtc(slot.date, normalizeTime(slot.startTime));
  return slotStart.getTime() - now.getTime() >= minLeadMinutes * 60_000;
}

/** True once the interview's end time has passed (used to retire last cycle's bookings). */
export function isInterviewPast(date: string, endTime: string, now: Date): boolean {
  return zonedDateTimeToUtc(date, normalizeTime(endTime)).getTime() <= now.getTime();
}

/** Applicants can cancel or reschedule themselves until 24 hours before the interview. */
export function canSelfCancel(date: string, startTime: string, now: Date): boolean {
  const slotStart = zonedDateTimeToUtc(date, normalizeTime(startTime));
  return slotStart.getTime() - now.getTime() >= INTERVIEW_CANCEL_CUTOFF_MINUTES * 60_000;
}

/** An exec can join a slot unless they are already on it or on an overlapping one. */
export function isInterviewSwapEligible(
  target: InterviewSlotAssignment,
  candidateExecId: string,
  allSlots: InterviewSlotAssignment[],
): boolean {
  if (target.execIds.includes(candidateExecId)) return false;
  return !allSlots.some(
    (slot) =>
      slot.slotId !== target.slotId &&
      slot.date === target.date &&
      slot.execIds.includes(candidateExecId) &&
      overlaps(normalizeTime(slot.startTime), normalizeTime(slot.endTime), normalizeTime(target.startTime), normalizeTime(target.endTime)),
  );
}

export function canAddToPanel(currentCount: number): boolean {
  return currentCount < MAX_PANEL_SIZE;
}

export function canRemoveFromPanel(currentCount: number): boolean {
  return currentCount > MIN_PANEL_SIZE;
}

export function normalizeInviteeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Parses the admin's pasted invitee list: one per line, `email` or
 * `email, name` (comma, semicolon or tab). Emails are lowercased and
 * de-duplicated (first wins); anything that isn't a @ucsc.edu address is
 * reported by line number instead of being added.
 */
export function parseInviteeList(text: string): { invitees: { email: string; name: string | null }[]; errors: string[] } {
  const invitees: { email: string; name: string | null }[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  function add(rawEmail: string, rawName: string, lineNumber: number) {
    const email = normalizeInviteeEmail(rawEmail);
    if (!isValidUcscEmail(email)) {
      errors.push(`Line ${lineNumber}: "${rawEmail.trim()}" is not a @ucsc.edu address.`);
      return;
    }
    if (seen.has(email)) return;
    seen.add(email);
    const name = rawName.trim();
    invitees.push({ email, name: name === "" ? null : name });
  }

  text.split(/\r?\n/).forEach((line, index) => {
    if (line.trim() === "") return;
    // Several addresses on one line (e.g. copied from a mail client) are separate invitees, not "email, name".
    const addresses = line.split(/[\s,;]+/).filter((token) => token.includes("@"));
    if (addresses.length > 1) {
      for (const address of addresses) add(address, "", index + 1);
      return;
    }
    const [rawEmail, ...rest] = line.split(/[,;\t]/);
    add(rawEmail, rest.join(" "), index + 1);
  });

  return { invitees, errors };
}

export type InterviewWindow = { windowStart: string | null; windowEnd: string | null };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True when `date` falls inside the optional interview window. A missing end means open-ended. */
export function isInInterviewWindow(date: string, { windowStart, windowEnd }: InterviewWindow): boolean {
  if (windowStart && date < windowStart) return false;
  if (windowEnd && date > windowEnd) return false;
  return true;
}

/** Reads the interview `org_settings` rows, falling back to closed / 60 minutes / no date window. */
export function parseInterviewSettings(
  rows: { key: string; value: string }[],
): { bookingOpen: boolean; slotMinutes: number } & InterviewWindow {
  const get = (key: string) => rows.find((r) => r.key === key)?.value;
  const minutes = Number(get("interview_slot_minutes"));
  const valid = Number.isInteger(minutes) && minutes >= 15 && minutes <= 240;
  const date = (key: string) => {
    const v = get(key);
    return v && DATE_RE.test(v) ? v : null;
  };
  return {
    bookingOpen: get("interview_booking_open") === "true",
    slotMinutes: valid ? minutes : DEFAULT_INTERVIEW_SLOT_MINUTES,
    windowStart: date("interview_window_start"),
    windowEnd: date("interview_window_end"),
  };
}

/** "between 2026-10-20 and 2026-11-03", for error messages and hints. */
export function describeInterviewWindow({ windowStart, windowEnd }: InterviewWindow): string {
  if (windowStart && windowEnd) return `between ${windowStart} and ${windowEnd}`;
  if (windowStart) return `from ${windowStart} on`;
  if (windowEnd) return `up to ${windowEnd}`;
  return "on any date";
}
