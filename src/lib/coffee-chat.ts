import { zonedDateTimeToUtc } from "./date";

export const DEFAULT_CHUNK_MINUTES = 20;
export const DEFAULT_MIN_LEAD_MINUTES = 120;

/** Open/close as "HH:MM", or null when closed that day. Only cafes get hours; libraries and buildings are always offered. */
type WeekHours = ("closed" | { open: string; close: string })[]; // index 0 = Sunday

function everyDay(open: string, close: string): WeekHours {
  return Array.from({ length: 7 }, () => ({ open, close }));
}

function weekdays(hours: Record<number, { open: string; close: string }>): WeekHours {
  return Array.from({ length: 7 }, (_, day) => hours[day] ?? "closed");
}

export interface CoffeeChatLocation {
  name: string;
  hours?: WeekHours;
}

// Hours checked Sept 2026 from each place's own site / UCSC dining. Where
// sources disagreed the narrower window is used. Re-check each quarter.
export const COFFEE_CHAT_LOCATION_GROUPS: { label: string; locations: CoffeeChatLocation[] }[] = [
  {
    label: "On campus",
    locations: [
      { name: "SNE (Science & Engineering Library)" },
      { name: "Baskin Engineering" },
      { name: "McHenry Library" },
      { name: "Oakes Cafe", hours: weekdays({ 1: { open: "10:00", close: "20:00" }, 2: { open: "10:00", close: "20:00" }, 3: { open: "10:00", close: "20:00" }, 4: { open: "10:00", close: "20:00" }, 5: { open: "10:00", close: "20:00" } }) },
      { name: "University Center Cafe", hours: weekdays({ 1: { open: "08:00", close: "16:00" }, 2: { open: "08:00", close: "16:00" }, 3: { open: "08:00", close: "16:00" }, 4: { open: "08:00", close: "16:00" }, 5: { open: "08:00", close: "14:00" } }) },
    ],
  },
  {
    label: "Off campus, near campus (Westside)",
    locations: [
      { name: "Cafe Iveta (Westside)", hours: everyDay("08:00", "15:00") },
      { name: "Verve Coffee Roasters (Westside)", hours: everyDay("07:00", "18:00") },
      { name: "Cat & Cloud Coffee (Westside)", hours: everyDay("06:30", "15:00") },
    ],
  },
  {
    label: "Downtown Santa Cruz",
    locations: [
      { name: "The 11th Hour Coffee", hours: everyDay("07:00", "18:30") },
      { name: "Verve Coffee Roasters (Pacific Ave)", hours: everyDay("07:00", "18:00") },
    ],
  },
];

export const COFFEE_CHAT_LOCATIONS = COFFEE_CHAT_LOCATION_GROUPS.flatMap((g) => g.locations);

/** True if the location has no listed hours, or the whole slot fits inside that day's hours. */
export function isLocationOpenForSlot(
  location: CoffeeChatLocation,
  slot: { date: string; startTime: string; endTime: string },
): boolean {
  if (!location.hours) return true;
  const [y, m, d] = slot.date.split("-").map(Number);
  const day = location.hours[new Date(y, m - 1, d).getDay()];
  if (day === "closed") return false;
  return (
    timeToMinutes(normalizeTime(slot.startTime)) >= timeToMinutes(day.open) &&
    timeToMinutes(normalizeTime(slot.endTime)) <= timeToMinutes(day.close)
  );
}

/** The location groups an applicant can choose from for this slot; empty groups are dropped. */
export function locationGroupsForSlot(slot: { date: string; startTime: string; endTime: string }) {
  return COFFEE_CHAT_LOCATION_GROUPS.map((group) => ({
    label: group.label,
    locations: group.locations.filter((l) => isLocationOpenForSlot(l, slot)),
  })).filter((group) => group.locations.length > 0);
}

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

export interface TimeBlockInput {
  startTime: string;
  endTime: string;
}

export interface AvailabilityRowInput {
  date: string;
  startTime: string;
  endTime: string;
}

/**
 * Turns one availability "entry" (several days x several time blocks) into
 * one row per day and block, or an error message. Days are de-duplicated and
 * sorted; blocks must be valid and must not overlap each other.
 */
export function expandAvailabilityEntry(
  dates: string[],
  blocks: TimeBlockInput[],
): { rows: AvailabilityRowInput[] } | { error: string } {
  const uniqueDates = [...new Set(dates)].sort();
  if (uniqueDates.length === 0) return { error: "Pick at least one day." };
  if (blocks.length === 0) return { error: "Add at least one time block." };

  for (const block of blocks) {
    if (!block.startTime || !block.endTime || timeToMinutes(block.endTime) <= timeToMinutes(block.startTime)) {
      return { error: "Each block needs an end time after its start time." };
    }
  }

  const sortedBlocks = [...blocks].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  for (let i = 1; i < sortedBlocks.length; i++) {
    if (timeToMinutes(sortedBlocks[i].startTime) < timeToMinutes(sortedBlocks[i - 1].endTime)) {
      return { error: "Your time blocks overlap. Adjust them so each is separate." };
    }
  }

  return {
    rows: uniqueDates.flatMap((date) =>
      sortedBlocks.map((block) => ({ date, startTime: block.startTime, endTime: block.endTime })),
    ),
  };
}

/** "14:20" (or "14:20:00") -> "2:20 PM". Applicant-facing times are 12-hour. */
export function formatTime12h(time: string): string {
  const [h, m] = normalizeTime(time).split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${suffix}`;
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
 * Chunks every exec's availability into fixed-length windows (on a shared
 * grid), then builds two-exec slots for each window in time order. 4 execs
 * free at once produce 2 parallel slots. Choices are balanced using the
 * history so far (existing slots plus what this run has already made):
 * the least-used exec is placed first, paired with the partner they have
 * met least, and with an odd number free the busiest exec sits that window
 * out. Every slot has two execs, so nothing generated is ever unbookable.
 * Deterministic: ties are broken by id, so the same input gives the same
 * result.
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
  // Running history used to balance choices: how many chats each exec is
  // already on, and how many times each pair has already been put together.
  const load = new Map<string, number>();
  const pairCount = new Map<string, number>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const loadOf = (id: string) => load.get(id) ?? 0;
  const pairsOf = (a: string, b: string) => pairCount.get(pairKey(a, b)) ?? 0;
  for (const s of existingSlots) {
    for (const id of assignedExecIds(s)) load.set(id, loadOf(id) + 1);
    if (s.execId2) pairCount.set(pairKey(s.execId1, s.execId2), pairsOf(s.execId1, s.execId2) + 1);
  }

  // Chronological order, so earlier windows shape the balance of later ones.
  for (const [key, execIds] of [...byWindow].sort(([a], [b]) => a.localeCompare(b))) {
    const [date, startTime] = key.split("|");
    const endTime = minutesToTime(timeToMinutes(startTime) + chunkMinutes);
    // An exec already on an existing slot that overlaps this window (whether
    // from an earlier run or a manual swap) can't be put on another one.
    const busy = new Set(
      existingSlots
        .filter((s) => s.date === date && overlaps(s.startTime, s.endTime, startTime, endTime))
        .flatMap(assignedExecIds),
    );
    let pool = [...execIds].filter((id) => !busy.has(id)).sort();

    // Every slot needs two execs (applicants are promised two), so with an
    // odd number free the busiest exec sits this window out.
    if (pool.length % 2 === 1) {
      const sitOut = pool.reduce((busiest, id) => (loadOf(id) >= loadOf(busiest) ? id : busiest));
      pool = pool.filter((id) => id !== sitOut);
    }

    pool.sort((x, y) => loadOf(x) - loadOf(y) || x.localeCompare(y));
    for (const [first, second] of bestMatching(pool)) {
      const [execId1, execId2] = first < second ? [first, second] : [second, first];
      slots.push({ date, startTime, endTime, execId1, execId2 });
      load.set(first, loadOf(first) + 1);
      load.set(second, loadOf(second) + 1);
      pairCount.set(pairKey(first, second), pairsOf(first, second) + 1);
    }
  }

  return slots;

  /**
   * Splits an even-sized pool into pairs, picking the split with the fewest
   * repeat pairings overall (repeats are squared, so one pair meeting three
   * times costs more than three pairs meeting twice). Looking at the whole
   * window matters: taking the best partner for one exec at a time can
   * strand the last two execs into a repeat. Exhaustive up to 10 execs
   * (at most 945 splits), greedy beyond that.
   */
  function bestMatching(pool: string[]): [string, string][] {
    const partnerOrder = (first: string, others: string[]) =>
      others
        .map((_, i) => i)
        .sort(
          (i, j) =>
            pairsOf(first, others[i]) - pairsOf(first, others[j]) ||
            loadOf(others[i]) - loadOf(others[j]) ||
            others[i].localeCompare(others[j]),
        );

    if (pool.length > 10) {
      const rest = [...pool];
      const pairs: [string, string][] = [];
      while (rest.length >= 2) {
        const first = rest.shift()!;
        const [best] = partnerOrder(first, rest);
        pairs.push([first, rest.splice(best, 1)[0]]);
      }
      return pairs;
    }

    let best: [string, string][] = [];
    let bestCost = Infinity;
    const search = (rest: string[], chosen: [string, string][], cost: number) => {
      if (cost >= bestCost) return;
      if (rest.length === 0) {
        best = chosen;
        bestCost = cost;
        return;
      }
      const [first, ...others] = rest;
      for (const i of partnerOrder(first, others)) {
        const remaining = others.filter((_, index) => index !== i);
        search(remaining, [...chosen, [first, others[i]]], cost + pairsOf(first, others[i]) ** 2);
      }
    };
    search(pool, [], 0);
    return best;
  }
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
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
  /** Applicants are promised two execs, so a slot with an empty second seat is never bookable. */
  hasTwoExecs: boolean;
}

/** Whether a slot should appear on the public booking page right now. */
export function isSlotBookable(slot: SlotBookabilityInput, now: Date, minLeadMinutes: number): boolean {
  if (!slot.published || slot.hasConfirmedBooking || !slot.hasTwoExecs) return false;
  const slotStart = zonedDateTimeToUtc(slot.date, slot.startTime);
  return slotStart.getTime() - now.getTime() >= minLeadMinutes * 60_000;
}

const UCSC_EMAIL_PATTERN = /^[^\s@]+@ucsc\.edu$/i;

export function isValidUcscEmail(email: string): boolean {
  return UCSC_EMAIL_PATTERN.test(email.trim());
}
