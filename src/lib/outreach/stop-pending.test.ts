import { describe, expect, it } from "vitest";
import { stopAction } from "./stop-pending";

const now = new Date("2026-11-03T20:00:00Z");

describe("stopAction", () => {
  it("cancels a draft", () => expect(stopAction({ status: "draft", scheduledFor: null }, now)).toBe("cancel"));
  it("cancels an email Resend is still holding for later", () => {
    expect(stopAction({ status: "scheduled", scheduledFor: new Date("2026-11-03T22:00:00Z") }, now)).toBe("cancel");
  });
  it("records an email whose time has passed as sent, not cancelled", () => {
    expect(stopAction({ status: "scheduled", scheduledFor: new Date("2026-11-03T19:59:00Z") }, now)).toBe("mark_sent");
    expect(stopAction({ status: "scheduled", scheduledFor: now }, now)).toBe("mark_sent");
  });
  it("cancels a scheduled email with no time recorded, to be safe", () => {
    expect(stopAction({ status: "scheduled", scheduledFor: null }, now)).toBe("cancel");
  });
  it("leaves finished messages alone", () => {
    for (const status of ["sent", "failed", "cancelled"]) expect(stopAction({ status, scheduledFor: null }, now)).toBe("leave");
  });
});
