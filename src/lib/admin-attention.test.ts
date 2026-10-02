import { describe, expect, it } from "vitest";
import {
  buildAttentionItems,
  countBelowThreshold,
  countUnbookedSlotsThisWeek,
  hasUnfinalizedDraft,
  type AttentionCounts,
} from "./admin-attention";

const CLEAR: AttentionCounts = {
  quarterId: "q1",
  lowAttendance: 0,
  draftUnfinalized: false,
  unbookedSlots: 0,
  pendingTeamSubmissions: 0,
};

describe("countBelowThreshold", () => {
  it("counts only rates strictly below the threshold", () => {
    const rows = [{ attendanceRate: 0.5 }, { attendanceRate: 0.8 }, { attendanceRate: 0.95 }];
    expect(countBelowThreshold(rows, 0.8)).toBe(1);
  });
  it("ignores members with no rate yet (null)", () => {
    expect(countBelowThreshold([{ attendanceRate: null }, { attendanceRate: 0.1 }], 0.8)).toBe(1);
  });
  it("returns 0 for an empty list", () => expect(countBelowThreshold([], 0.8)).toBe(0));
});

describe("hasUnfinalizedDraft", () => {
  it("is false with no drafts", () => expect(hasUnfinalizedDraft([])).toBe(false));
  it("is true when drafts exist and none is finalized", () => {
    expect(hasUnfinalizedDraft([{ isFinalized: false }, { isFinalized: false }])).toBe(true);
  });
  it("is false once any draft is finalized", () => {
    expect(hasUnfinalizedDraft([{ isFinalized: false }, { isFinalized: true }])).toBe(false);
  });
});

describe("countUnbookedSlotsThisWeek", () => {
  const slot = (date: string, over: Partial<{ published: boolean; bookingStatus: "open" | "booked" }> = {}) => ({
    date,
    published: true,
    bookingStatus: "open" as const,
    ...over,
  });

  it("counts open published slots from today through today+6", () => {
    const slots = [slot("2026-10-02"), slot("2026-10-08"), slot("2026-10-09"), slot("2026-10-01")];
    expect(countUnbookedSlotsThisWeek(slots, "2026-10-02")).toBe(2);
  });
  it("rolls over a month boundary", () => {
    const slots = [slot("2026-11-03"), slot("2026-11-04")];
    expect(countUnbookedSlotsThisWeek(slots, "2026-10-28")).toBe(1);
  });
  it("skips unpublished and booked slots", () => {
    const slots = [slot("2026-10-03", { published: false }), slot("2026-10-03", { bookingStatus: "booked" })];
    expect(countUnbookedSlotsThisWeek(slots, "2026-10-02")).toBe(0);
  });
});

describe("buildAttentionItems", () => {
  it("returns nothing when everything is clear", () => {
    expect(buildAttentionItems(CLEAR)).toEqual([]);
  });

  it("builds each item with a deep link, in a stable order", () => {
    const items = buildAttentionItems({
      quarterId: "q1",
      lowAttendance: 7,
      draftUnfinalized: true,
      unbookedSlots: 3,
      pendingTeamSubmissions: 2,
    });
    expect(items.map((i) => i.kind)).toEqual(["attendance", "draft", "coffee-chats", "team-page"]);
    expect(items[0]).toMatchObject({
      label: "7 consultants are below the attendance threshold",
      href: "/portal/admin/stats?quarter=q1",
    });
    expect(items[1].href).toBe("/portal/admin/team-builder?quarter=q1");
    expect(items[2].href).toBe("/portal/admin/coffee-chats?tab=schedule");
    expect(items[3].href).toBe("/portal/admin/team-page");
  });

  it("uses singular wording for a count of one", () => {
    const items = buildAttentionItems({ ...CLEAR, lowAttendance: 1, unbookedSlots: 1, pendingTeamSubmissions: 1 });
    expect(items.map((i) => i.label)).toEqual([
      "1 consultant is below the attendance threshold",
      "1 open coffee-chat slot has no booking in the next 7 days",
      "1 team-page submission is waiting for review",
    ]);
  });

  it("omits sources that are unavailable (null) but keeps the rest", () => {
    const items = buildAttentionItems({
      quarterId: "q1",
      lowAttendance: null,
      draftUnfinalized: null,
      unbookedSlots: null,
      pendingTeamSubmissions: 4,
    });
    expect(items.map((i) => i.kind)).toEqual(["team-page"]);
  });

  it("emits no ?quarter= when there is no quarter", () => {
    const items = buildAttentionItems({ ...CLEAR, quarterId: null, lowAttendance: 2, draftUnfinalized: true });
    expect(items[0].href).toBe("/portal/admin/stats");
    expect(items[1].href).toBe("/portal/admin/team-builder");
  });
});
