import { describe, expect, it } from "vitest";
import { isTerminal, nextActionAt, statusAfterSend, stepKind } from "./sequence";

const pacificDate = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(d);

describe("nextActionAt", () => {
  const monday = new Date("2026-10-19T18:00:00Z"); // Mon 11:00 PDT
  it("counts business days after the first send", () => {
    expect(pacificDate(nextActionAt(monday, [4, 9, 15], 1)!)).toBe("2026-10-23");
    expect(pacificDate(nextActionAt(monday, [4, 9, 15], 2)!)).toBe("2026-10-30");
    expect(pacificDate(nextActionAt(monday, [4, 9, 15], 3)!)).toBe("2026-11-09");
  });
  it("skips weekends", () => {
    const thursday = new Date("2026-10-22T18:00:00Z");
    expect(pacificDate(nextActionAt(thursday, [4, 9, 15], 1)!)).toBe("2026-10-28");
  });
  it("returns null after the last step", () => {
    expect(nextActionAt(monday, [4, 9, 15], 4)).toBeNull();
    expect(nextActionAt(monday, [], 1)).toBeNull();
  });
});

describe("statusAfterSend / stepKind / isTerminal", () => {
  it("maps steps to pipeline stages", () => {
    expect([0, 1, 2, 3].map(statusAfterSend)).toEqual(["sent", "follow_up_1", "follow_up_2", "closing_note"]);
  });
  it("maps steps to draft kinds", () => {
    expect([0, 1, 2, 3].map(stepKind)).toEqual(["first", "follow_up", "follow_up", "closing"]);
  });
  it("knows which statuses end a sequence", () => {
    for (const s of ["replied", "booked", "unsubscribed", "bounced", "invalid", "no_response"]) expect(isTerminal(s)).toBe(true);
    for (const s of ["new", "verified", "drafted", "queued", "sent", "follow_up_1", "needs_attention"]) expect(isTerminal(s)).toBe(false);
  });
});
