import { minutesToTime, normalizeTime, overlaps, timeToMinutes } from "./coffee-chat";
import { zonedDateTimeToUtc } from "./date";

export const CLIENT_MEETING_SLOT_MINUTES = 30;
export const CLIENT_MEETING_GRID_MINUTES = 30;
export const CLIENT_MEETING_MIN_LEAD_MINUTES = 24 * 60;
export const CLIENT_MEETING_CANCEL_CUTOFF_MINUTES = 12 * 60;
export const PANEL_SIZE = 3;

export const MAX_CONTACT_NAME = 100;
export const MAX_BUSINESS_NAME = 150;
export const MAX_EMAIL = 254;
export const MAX_PHONE = 30;
export const MAX_NEEDS = 1000;
export const MAX_MEETING_URL = 500;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The panel setting is valid only as a JSON array of exactly 3 distinct UUID strings (trimmed). */
export function parsePanelSetting(value: string | undefined | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length !== PANEL_SIZE) return [];
    if (!parsed.every((id) => typeof id === "string" && UUID_RE.test(id.trim()))) return [];
    const ids = (parsed as string[]).map((id) => id.trim());
    return new Set(ids).size === PANEL_SIZE ? ids : [];
  } catch {
    return [];
  }
}

export function parseClientMeetingSettings(rows: { key: string; value: string }[]): {
  bookingOpen: boolean;
  slotMinutes: number;
  panelExecIds: string[];
} {
  const get = (key: string) => rows.find((r) => r.key === key)?.value;
  const minutes = Number(get("client_meeting_slot_minutes"));
  const valid = Number.isInteger(minutes) && minutes >= 15 && minutes <= 120;
  return {
    bookingOpen: get("client_meeting_booking_open") === "true",
    slotMinutes: valid ? minutes : CLIENT_MEETING_SLOT_MINUTES,
    panelExecIds: parsePanelSetting(get("client_meeting_panel")),
  };
}

export interface ClientMeetingAvailabilityBlock {
  execId: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM" or "HH:MM:SS"
  endTime: string;
}

export interface ClientMeetingSlotTime {
  date: string;
  startTime: string;
  endTime: string;
}

/**
 * Slots exist only where all 3 panel execs are free. Candidate starts are every :00/:30 for which
 * each exec's block covers the whole slot. Existing slots (and slots created earlier in this run)
 * are never overlapped. Output is chronological, so the same input always gives the same result.
 */
export function generateClientMeetingSlots(
  panelExecIds: string[],
  availability: ClientMeetingAvailabilityBlock[],
  existing: ClientMeetingSlotTime[] = [],
  slotMinutes: number = CLIENT_MEETING_SLOT_MINUTES,
): ClientMeetingSlotTime[] {
  if (panelExecIds.length !== PANEL_SIZE) return [];
  const panel = new Set(panelExecIds);

  const free = new Map<string, Set<string>>();
  for (const raw of availability) {
    if (!panel.has(raw.execId)) continue;
    const start = timeToMinutes(normalizeTime(raw.startTime));
    const end = timeToMinutes(normalizeTime(raw.endTime));
    for (
      let t = Math.ceil(start / CLIENT_MEETING_GRID_MINUTES) * CLIENT_MEETING_GRID_MINUTES;
      t + slotMinutes <= end;
      t += CLIENT_MEETING_GRID_MINUTES
    ) {
      const key = `${raw.date}|${minutesToTime(t)}`;
      if (!free.has(key)) free.set(key, new Set());
      free.get(key)!.add(raw.execId);
    }
  }

  const taken = existing.map((s) => ({ date: s.date, startTime: normalizeTime(s.startTime), endTime: normalizeTime(s.endTime) }));
  const generated: ClientMeetingSlotTime[] = [];
  for (const [key, execIds] of [...free].sort(([a], [b]) => a.localeCompare(b))) {
    if (execIds.size !== PANEL_SIZE) continue;
    const [date, startTime] = key.split("|");
    const endTime = minutesToTime(timeToMinutes(startTime) + slotMinutes);
    if (taken.some((s) => s.date === date && overlaps(s.startTime, s.endTime, startTime, endTime))) continue;
    const slot = { date, startTime, endTime };
    generated.push(slot);
    taken.push(slot);
  }
  return generated;
}

export function isClientMeetingBookable(
  slot: { date: string; startTime: string; published: boolean; hasConfirmedBooking: boolean },
  panelValid: boolean,
  now: Date,
  minLeadMinutes: number = CLIENT_MEETING_MIN_LEAD_MINUTES,
): boolean {
  if (!panelValid || !slot.published || slot.hasConfirmedBooking) return false;
  const start = zonedDateTimeToUtc(slot.date, normalizeTime(slot.startTime));
  return start.getTime() - now.getTime() >= minLeadMinutes * 60_000;
}

/** Clients can cancel or reschedule themselves until 12 hours before the meeting. */
export function canClientCancel(date: string, startTime: string, now: Date): boolean {
  const start = zonedDateTimeToUtc(date, normalizeTime(startTime));
  return start.getTime() - now.getTime() >= CLIENT_MEETING_CANCEL_CUTOFF_MINUTES * 60_000;
}

/** True once the meeting's end time has passed (used to retire old confirmed bookings). */
export function isClientMeetingPast(date: string, endTime: string, now: Date): boolean {
  return zonedDateTimeToUtc(date, normalizeTime(endTime)).getTime() <= now.getTime();
}

/** Empty clears the link; otherwise it must be an https URL of reasonable length. */
export function validateMeetingUrl(raw: string): { url: string | null } | { error: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { url: null };
  if (trimmed.length > MAX_MEETING_URL) return { error: "That link is too long." };
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return { error: "The meeting link must start with https://." };
    return { url: trimmed };
  } catch {
    return { error: "Enter a full link, like https://meet.google.com/abc-defg-hij." };
  }
}

export function isValidEmail(email: string): boolean {
  return email.length <= MAX_EMAIL && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateClientMeetingInput(input: {
  contactName: string;
  businessName: string;
  email: string;
  phone: string;
  needs: string;
}):
  | { error: string }
  | { value: { contactName: string; businessName: string; email: string; phone: string; needs: string } } {
  const contactName = input.contactName.trim();
  const businessName = input.businessName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  const needs = input.needs.trim();

  if (!contactName) return { error: "Enter your name." };
  if (contactName.length > MAX_CONTACT_NAME) return { error: "Your name is too long." };
  if (!businessName) return { error: "Enter your business or organization name." };
  if (businessName.length > MAX_BUSINESS_NAME) return { error: "The business name is too long." };
  if (!isValidEmail(email)) return { error: "Enter a valid email address." };
  if (!phone) return { error: "Enter a phone number." };
  if (phone.length > MAX_PHONE) return { error: "That phone number is too long." };
  if (!needs) return { error: "Tell us a little about what you need help with." };
  if (needs.length > MAX_NEEDS) return { error: `Keep it under ${MAX_NEEDS} characters.` };

  return { value: { contactName, businessName, email, phone, needs } };
}
