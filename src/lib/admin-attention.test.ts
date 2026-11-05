import { describe, expect, it } from "vitest";
import {
  buildAttentionItems,
  countBelowThreshold,
  hasUnfinalizedDraft,
  type AttentionCounts,
} from "./admin-attention";

const CLEAR: AttentionCounts = {
  quarterId: "q1",
  lowAttendance: 0,
  draftUnfinalized: false,
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

describe("recruiting attention items", () => {
  const counts = { ...CLEAR, bookingsToMark: 9, applicantsWithoutReviewer: 1, interviewSlotShortfall: 6 };

  it("adds the recruiting items ahead of the others, each with a plain label", () => {
    const items = buildAttentionItems({ ...counts, lowAttendance: 3 });
    expect(items.map((i) => i.kind)).toEqual(["marks", "reviewers", "interview-slots", "attendance"]);
    expect(items[0].label).toBe("9 recruiting bookings still need to be marked");
    expect(items[1].label).toBe("1 applicant has no reviewer yet");
    expect(items[2].label).toBe("Add 6 more interview slots so everyone invited can book");
  });
  it("leaves them out when zero or unavailable", () => {
    expect(buildAttentionItems({ ...CLEAR, bookingsToMark: 0, applicantsWithoutReviewer: null })).toEqual([]);
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
      pendingTeamSubmissions: 2,
    });
    expect(items.map((i) => i.kind)).toEqual(["attendance", "draft", "team-page"]);
    expect(items[0]).toMatchObject({
      label: "7 consultants are below the attendance threshold",
      href: "/portal/admin/stats?quarter=q1",
    });
    expect(items[1].href).toBe("/portal/admin/team-builder?quarter=q1");
    expect(items[2].href).toBe("/portal/admin/team-page");
  });

  it("uses singular wording for a count of one", () => {
    const items = buildAttentionItems({ ...CLEAR, lowAttendance: 1, pendingTeamSubmissions: 1 });
    expect(items.map((i) => i.label)).toEqual([
      "1 consultant is below the attendance threshold",
      "1 team-page submission is waiting for review",
    ]);
  });

  it("omits sources that are unavailable (null) but keeps the rest", () => {
    const items = buildAttentionItems({
      quarterId: "q1",
      lowAttendance: null,
      draftUnfinalized: null,
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

describe("outreach attention items", () => {
  const base = { quarterId: null, lowAttendance: null, draftUnfinalized: null, pendingTeamSubmissions: null };
  it("adds an item for replies waiting", () => {
    const items = buildAttentionItems({ ...base, outreachReplies: 2 });
    expect(items).toEqual([
      { kind: "outreach-replies", label: "2 outreach replies are waiting for an exec", actionLabel: "Open outreach", href: "/portal/admin/outreach/companies?stage=needs-you" },
    ]);
  });
  it("adds an item for prospects that need a look, singular and plural", () => {
    expect(buildAttentionItems({ ...base, outreachNeedsAttention: 1 })[0].label).toBe("1 outreach prospect needs a look");
    expect(buildAttentionItems({ ...base, outreachNeedsAttention: 3 })[0].label).toBe("3 outreach prospects need a look");
  });
  it("adds nothing for zero or unknown", () => {
    expect(buildAttentionItems({ ...base, outreachReplies: 0, outreachNeedsAttention: null })).toEqual([]);
  });
});

describe("task review attention item", () => {
  it("leads the list and links to the Task Reviews view", () => {
    const items = buildAttentionItems({ ...CLEAR, taskReviews: 2, lowAttendance: 1 });
    expect(items.map((i) => i.kind)).toEqual(["task-reviews", "attendance"]);
    expect(items[0].label).toBe("2 consultant tasks are waiting for your review");
    expect(items[0].href).toBe("/portal/admin/task-reviews");
  });
  it("is singular for one and omitted for zero or unavailable", () => {
    expect(buildAttentionItems({ ...CLEAR, taskReviews: 1 })[0].label).toBe("1 consultant task is waiting for your review");
    expect(buildAttentionItems({ ...CLEAR, taskReviews: 0 })).toEqual([]);
    expect(buildAttentionItems({ ...CLEAR, taskReviews: null })).toEqual([]);
  });
});
