import { zonedDateTimeToUtc } from "./date";

export const DEFAULT_CHUNK_MINUTES = 20;
export const DEFAULT_MIN_LEAD_MINUTES = 120;

export interface AvailabilityBlock {
  execId: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM", 24h
  endTime: string; // "HH:MM", 24h
}

export interface GeneratedSlot {
  date: string;
  startTime: string;
  endTime: string;
  execId1: string;
  execId2: string | null;
}

export interface ExistingSlotAssignment {
  slotId: string;
  date: string;
  startTime: string;
  endTime: string;
  execId1: string;
  execId2: string | null;
}

/** Postgres `time` columns come back as "HH:MM:SS"; all logic here works on "HH:MM". */
export function normalizeTime(time: string): string {
  return time.slice(0, 5);
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (totalMinutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Every fixed-length chunk that fits entirely inside [startTime, endTime),
 * aligned to a shared grid (multiples of `chunkMinutes` from midnight) so
 * two execs' blocks line up regardless of when each block starts.
 */
function chunkStartsFor(block: AvailabilityBlock, chunkMinutes: number): string[] {
  const start = Math.ceil(timeToMinutes(block.startTime) / chunkMinutes) * chunkMinutes;
  const end = timeToMinutes(block.endTime);
  const starts: string[] = [];
  for (let t = start; t + chunkMinutes <= end; t += chunkMinutes) {
    starts.push(minutesToTime(t));
  }
  return starts;
}

/**
 * Chunks every exec's availability into fixed-length windows, then greedily
 * pairs whoever's free in each window two at a time -- 4 execs free at the
 * same time produces 2 parallel slots, an odd exec out gets a slot with
 * `execId2: null` for the admin to fill by hand. Deterministic: execs
 * within a window are sorted by id before pairing, so re-running with the
 * same input produces the same pairing.
 */
export function generateSlots(
  availability: AvailabilityBlock[],
  chunkMinutes: number,
  existingSlots: ExistingSlotAssignment[] = [],
): GeneratedSlot[] {
  const byWindow = new Map<string, Set<string>>();

  for (const rawBlock of availability) {
    const block = { ...rawBlock, startTime: normalizeTime(rawBlock.startTime), endTime: normalizeTime(rawBlock.endTime) };
    for (const chunkStart of chunkStartsFor(block, chunkMinutes)) {
      const key = `${block.date}|${chunkStart}`;
      if (!byWindow.has(key)) byWindow.set(key, new Set());
      byWindow.get(key)!.add(block.execId);
    }
  }

  const slots: GeneratedSlot[] = [];
  for (const [key, execIds] of byWindow) {
    const [date, startTime] = key.split("|");
    const endTime = minutesToTime(timeToMinutes(startTime) + chunkMinutes);
    // An exec already on an existing slot that overlaps this window (whether
    // from an earlier run or a manual swap) can't be put on another one.
    const busy = new Set(
      existingSlots
        .filter((s) => s.date === date && overlaps(s.startTime, s.endTime, startTime, endTime))
        .flatMap(assignedExecIds),
    );
    const sorted = [...execIds].filter((id) => !busy.has(id)).sort();
    for (let i = 0; i < sorted.length; i += 2) {
      slots.push({
        date,
        startTime,
        endTime,
        execId1: sorted[i],
        execId2: sorted[i + 1] ?? null,
      });
    }
  }

  return slots;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(bStart) < timeToMinutes(aEnd);
}

function assignedExecIds(slot: ExistingSlotAssignment): string[] {
  return [slot.execId1, slot.execId2].filter((id): id is string => id !== null);
}

/**
 * True if `candidateExecId` can be swapped onto `targetSlot`: they marked
 * themselves available for that exact window, and they aren't already
 * assigned to a *different* slot whose time overlaps it (an exec can't be
 * in two coffee chats at once).
 */
export function isSwapEligible(
  targetSlot: ExistingSlotAssignment,
  candidateExecId: string,
  candidateAvailability: AvailabilityBlock[],
  allSlots: ExistingSlotAssignment[],
): boolean {
  // Already on this slot (either position): swapping would leave an "A,A" slot or be a no-op.
  if (assignedExecIds(targetSlot).includes(candidateExecId)) return false;

  const isFreeThen = candidateAvailability.some(
    (block) =>
      block.execId === candidateExecId &&
      block.date === targetSlot.date &&
      timeToMinutes(block.startTime) <= timeToMinutes(targetSlot.startTime) &&
      timeToMinutes(block.endTime) >= timeToMinutes(targetSlot.endTime),
  );
  if (!isFreeThen) return false;

  const isDoubleBooked = allSlots.some(
    (slot) =>
      slot.slotId !== targetSlot.slotId &&
      slot.date === targetSlot.date &&
      overlaps(slot.startTime, slot.endTime, targetSlot.startTime, targetSlot.endTime) &&
      assignedExecIds(slot).includes(candidateExecId),
  );
  return !isDoubleBooked;
}

export interface SlotBookabilityInput {
  date: string;
  startTime: string;
  published: boolean;
  hasConfirmedBooking: boolean;
}

/** Whether a slot should appear on the public booking page right now. */
export function isSlotBookable(slot: SlotBookabilityInput, now: Date, minLeadMinutes: number): boolean {
  if (!slot.published || slot.hasConfirmedBooking) return false;
  const slotStart = zonedDateTimeToUtc(slot.date, slot.startTime);
  return slotStart.getTime() - now.getTime() >= minLeadMinutes * 60_000;
}

const UCSC_EMAIL_PATTERN = /^[^\s@]+@ucsc\.edu$/i;

export function isValidUcscEmail(email: string): boolean {
  return UCSC_EMAIL_PATTERN.test(email.trim());
}
