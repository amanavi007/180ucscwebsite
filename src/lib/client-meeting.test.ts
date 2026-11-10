import { describe, expect, it } from "vitest";
import {
  canClientCancel,
  generateClientMeetingSlots,
  isClientMeetingBookable,
  isClientMeetingPast,
  parseClientMeetingSettings,
  parsePanelSetting,
  validateClientMeetingInput,
  validateMeetingUrl,
} from "./client-meeting";

const panel = ["a", "b", "c"];
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const U3 = "33333333-3333-4333-8333-333333333333";
const uuidPanel = [U1, U2, U3];
const block = (execId: string, startTime: string, endTime: string, date = "2026-10-20") => ({ execId, date, startTime, endTime });

describe("parsePanelSetting", () => {
  it("accepts exactly 3 distinct ids", () => {
    expect(parsePanelSetting(JSON.stringify(uuidPanel))).toEqual(uuidPanel);
  });
  it("rejects a non-UUID id", () => {
    expect(parsePanelSetting(JSON.stringify([U1, U2, "not-a-uuid"]))).toEqual([]);
  });
  it("trims surrounding whitespace and returns the trimmed ids", () => {
    expect(parsePanelSetting(JSON.stringify([` ${U1} `, `${U2}\n`, U3]))).toEqual(uuidPanel);
  });
  it("rejects ids that are duplicates once trimmed", () => {
    expect(parsePanelSetting(JSON.stringify([U1, ` ${U1}`, U3]))).toEqual([]);
  });
  it.each([undefined, null, "", "not json", "[]", '["a","b"]', '["a","b","c","d"]', '["a","a","b"]', '["a","","b"]', '{"a":1}', "[1,2,3]"])(
    "rejects %s",
    (v) => expect(parsePanelSetting(v as string | undefined)).toEqual([]),
  );
});

describe("parseClientMeetingSettings", () => {
  it("defaults to closed / 30 min / no panel", () => {
    expect(parseClientMeetingSettings([])).toEqual({ bookingOpen: false, slotMinutes: 30, panelExecIds: [] });
  });
  it("reads values and rejects out-of-range minutes", () => {
    const s = parseClientMeetingSettings([
      { key: "client_meeting_booking_open", value: "true" },
      { key: "client_meeting_slot_minutes", value: "999" },
      { key: "client_meeting_panel", value: JSON.stringify(uuidPanel) },
    ]);
    expect(s).toEqual({ bookingOpen: true, slotMinutes: 30, panelExecIds: uuidPanel });
  });
});

describe("generateClientMeetingSlots", () => {
  it("creates slots where at least 2 of 3 are free, on the :00/:30 grid", () => {
    const slots = generateClientMeetingSlots(panel, [
      block("a", "09:00", "11:00"),
      block("b", "09:15", "11:00"),
      block("c", "09:00", "10:30"),
    ]);
    // 09:00 has a+c, 09:30 and 10:00 have all three, 10:30 has a+b.
    expect(slots.map((s) => s.startTime)).toEqual(["09:00", "09:30", "10:00", "10:30"]);
    expect(slots[1]).toEqual({ date: "2026-10-20", startTime: "09:30", endTime: "10:00" });
  });
  it("still works when one exec has no availability", () => {
    expect(generateClientMeetingSlots(panel, [block("a", "09:00", "10:00"), block("b", "09:00", "10:00")]).map((s) => s.startTime)).toEqual(["09:00", "09:30"]);
  });
  it("creates nothing when only 1 exec is free", () => {
    expect(generateClientMeetingSlots(panel, [block("a", "09:00", "11:00")])).toEqual([]);
    expect(generateClientMeetingSlots(panel, [block("a", "09:00", "10:00"), block("b", "10:00", "11:00")])).toEqual([]);
  });
  it("ignores availability from non-panel execs", () => {
    expect(
      generateClientMeetingSlots(panel, [block("a", "09:00", "10:00"), block("x", "09:00", "10:00"), block("y", "09:00", "10:00")]),
    ).toEqual([]);
  });
  it("returns nothing for an invalid panel", () => {
    expect(generateClientMeetingSlots(["a", "b"], [block("a", "09:00", "10:00"), block("b", "09:00", "10:00")])).toEqual([]);
  });
  it("skips times overlapping existing slots and never overlaps itself with longer slots", () => {
    const avail = [block("a", "09:00", "11:00"), block("b", "09:00", "11:00"), block("c", "09:00", "11:00")];
    const withExisting = generateClientMeetingSlots(panel, avail, [{ date: "2026-10-20", startTime: "09:30", endTime: "10:00" }]);
    expect(withExisting.map((s) => s.startTime)).toEqual(["09:00", "10:00", "10:30"]);
    const long = generateClientMeetingSlots(panel, avail, [], 60);
    expect(long.map((s) => s.startTime)).toEqual(["09:00", "10:00"]);
  });
  it("is deterministic and handles HH:MM:SS input", () => {
    const avail = [block("c", "09:00:00", "10:00:00"), block("a", "09:00:00", "10:00:00"), block("b", "09:00:00", "10:00:00")];
    expect(generateClientMeetingSlots(panel, avail)).toEqual(generateClientMeetingSlots(panel, [...avail].reverse()));
  });
});

describe("bookability and cancel", () => {
  const slot = { date: "2026-10-20", startTime: "10:00", published: true, hasConfirmedBooking: false };
  it("needs published, unbooked, valid panel and >= 24h lead", () => {
    const farNow = new Date("2026-10-18T09:00:00-07:00"); // 49h before
    expect(isClientMeetingBookable(slot, true, farNow)).toBe(true);
    expect(isClientMeetingBookable({ ...slot, published: false }, true, farNow)).toBe(false);
    expect(isClientMeetingBookable({ ...slot, hasConfirmedBooking: true }, true, farNow)).toBe(false);
    expect(isClientMeetingBookable(slot, false, farNow)).toBe(false);
    expect(isClientMeetingBookable(slot, true, new Date("2026-10-19T10:01:00-07:00"))).toBe(false); // 23h59m
    expect(isClientMeetingBookable(slot, true, new Date("2026-10-19T10:00:00-07:00"))).toBe(true); // exactly 24h
  });
  it("lets clients cancel until exactly 12h before", () => {
    expect(canClientCancel("2026-10-20", "10:00", new Date("2026-10-19T22:00:00-07:00"))).toBe(true);
    expect(canClientCancel("2026-10-20", "10:00", new Date("2026-10-19T22:00:01-07:00"))).toBe(false);
  });
  it("detects past meetings", () => {
    expect(isClientMeetingPast("2026-10-20", "10:30", new Date("2026-10-20T10:30:00-07:00"))).toBe(true);
    expect(isClientMeetingPast("2026-10-20", "10:30", new Date("2026-10-20T10:29:00-07:00"))).toBe(false);
  });
});

describe("validateMeetingUrl", () => {
  it("accepts https and trims", () => expect(validateMeetingUrl("  https://zoom.us/j/1  ")).toEqual({ url: "https://zoom.us/j/1" }));
  it("treats empty as clearing the link", () => expect(validateMeetingUrl("   ")).toEqual({ url: null }));
  it.each(["http://zoom.us/j/1", "javascript:alert(1)", "zoom.us/j/1", "https://" + "a".repeat(600) + ".com"])("rejects %s", (v) =>
    expect(validateMeetingUrl(v)).toHaveProperty("error"),
  );
});

describe("validateClientMeetingInput", () => {
  const ok = { contactName: " Jo ", businessName: "Acme", email: " Jo@Acme.COM ", phone: " 831-555-0100 ", needs: "Marketing help" };
  it("normalizes", () => {
    expect(validateClientMeetingInput(ok)).toEqual({
      value: { contactName: "Jo", businessName: "Acme", email: "jo@acme.com", phone: "831-555-0100", needs: "Marketing help" },
    });
  });
  it.each([
    { phone: "" },
    { phone: "   " },
    { phone: "1".repeat(31) },
    { contactName: "" },
    { businessName: " " },
    { email: "nope" },
    { needs: "" },
    { needs: "x".repeat(1001) },
    { contactName: "x".repeat(101) },
  ])("rejects %j", (patch) => expect(validateClientMeetingInput({ ...ok, ...patch })).toHaveProperty("error"));
});
