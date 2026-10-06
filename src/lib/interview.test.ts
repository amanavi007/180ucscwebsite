import { describe, expect, it } from "vitest";
import {
  canAddToPanel,
  canRemoveFromPanel,
  canSelfCancel,
  generateInterviewSlots,
  isInterviewPast,
  isInterviewSlotBookable,
  isInterviewSwapEligible,
  normalizeInviteeEmail,
  panelSizes,
  parseInterviewSettings,
  parseInviteeList,
  type InterviewAvailabilityBlock,
  type InterviewSlotAssignment,
} from "./interview";

const D = "2026-10-06";
const block = (execId: string, startTime: string, endTime: string, date = D): InterviewAvailabilityBlock => ({
  execId,
  date,
  startTime,
  endTime,
});

describe("panelSizes", () => {
  it.each([
    [0, []],
    [1, []],
    [2, [2]],
    [3, [3]],
    [4, [2, 2]],
    [5, [2, 3]],
    [6, [2, 2, 2]],
    [7, [2, 2, 3]],
  ])("splits %i free execs into %j", (n, expected) => {
    expect(panelSizes(n)).toEqual(expected);
  });
});

describe("generateInterviewSlots", () => {
  it("makes one slot from two execs free for a full hour", () => {
    const slots = generateInterviewSlots([block("a", "14:00", "15:00"), block("b", "14:00", "15:00")]);
    expect(slots).toEqual([{ date: D, startTime: "14:00", endTime: "15:00", execIds: ["a", "b"] }]);
  });

  it("makes one slot of three when three execs are free", () => {
    const slots = generateInterviewSlots(["a", "b", "c"].map((id) => block(id, "14:00", "15:00")));
    expect(slots).toHaveLength(1);
    expect(slots[0].execIds).toEqual(["a", "b", "c"]);
  });

  it("makes two slots of two when four execs are free", () => {
    const slots = generateInterviewSlots(["a", "b", "c", "d"].map((id) => block(id, "14:00", "15:00")));
    expect(slots.map((s) => s.execIds.length)).toEqual([2, 2]);
    expect(slots.flatMap((s) => s.execIds).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("makes a 2 and a 3 when five execs are free", () => {
    const slots = generateInterviewSlots(["a", "b", "c", "d", "e"].map((id) => block(id, "14:00", "15:00")));
    expect(slots.map((s) => s.execIds.length).sort()).toEqual([2, 3]);
  });

  it("makes nothing for a single exec", () => {
    expect(generateInterviewSlots([block("a", "14:00", "16:00")])).toEqual([]);
  });

  it("makes nothing when the block is shorter than the slot", () => {
    const slots = generateInterviewSlots([block("a", "14:00", "14:50"), block("b", "14:00", "14:50")]);
    expect(slots).toEqual([]);
  });

  it("starts slots on :00 and :30 only, rounding a block start up to the grid", () => {
    const slots = generateInterviewSlots([block("a", "14:10", "15:30"), block("b", "14:10", "15:30")]);
    expect(slots).toEqual([{ date: D, startTime: "14:30", endTime: "15:30", execIds: ["a", "b"] }]);
  });

  it("uses a :30 start when availability is offset", () => {
    const slots = generateInterviewSlots([
      block("a", "14:00", "15:00"),
      block("b", "14:00", "15:00"),
      block("c", "14:30", "15:30"),
      block("d", "14:30", "15:30"),
    ]);
    expect(slots).toEqual([
      { date: D, startTime: "14:00", endTime: "15:00", execIds: ["a", "b"] },
      { date: D, startTime: "14:30", endTime: "15:30", execIds: ["c", "d"] },
    ]);
  });

  it("never puts an exec on two overlapping slots, so a 2-hour block yields back-to-back hours", () => {
    const slots = generateInterviewSlots(["a", "b", "c", "d"].map((id) => block(id, "14:00", "16:00")));
    expect(slots.map((s) => s.startTime)).toEqual(["14:00", "14:00", "15:00", "15:00"]);
    for (const x of slots) {
      for (const y of slots) {
        if (x === y) continue;
        const shared = x.execIds.some((id) => y.execIds.includes(id));
        const overlap = x.startTime < y.endTime && y.startTime < x.endTime;
        expect(shared && overlap).toBe(false);
      }
    }
  });

  it("does not repeat a pairing when other pairings are possible", () => {
    const slots = generateInterviewSlots(["a", "b", "c", "d"].map((id) => block(id, "14:00", "16:00")));
    const pairs = slots.map((s) => [...s.execIds].sort().join("|"));
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("skips an exec already on an overlapping existing slot", () => {
    const existing: InterviewSlotAssignment[] = [
      { slotId: "s1", date: D, startTime: "13:30", endTime: "14:30", execIds: ["b", "x"] },
    ];
    const slots = generateInterviewSlots(
      [block("a", "14:00", "15:00"), block("b", "14:00", "15:00"), block("c", "14:00", "15:00")],
      existing,
    );
    expect(slots).toEqual([{ date: D, startTime: "14:00", endTime: "15:00", execIds: ["a", "c"] }]);
  });

  it("is deterministic", () => {
    const input = ["d", "b", "a", "c"].map((id) => block(id, "14:00", "16:00"));
    expect(generateInterviewSlots(input)).toEqual(generateInterviewSlots([...input].reverse()));
  });

  it("keeps dates separate", () => {
    const slots = generateInterviewSlots([
      block("a", "14:00", "15:00", "2026-10-06"),
      block("b", "14:00", "15:00", "2026-10-06"),
      block("a", "14:00", "15:00", "2026-10-07"),
      block("b", "14:00", "15:00", "2026-10-07"),
    ]);
    expect(slots.map((s) => s.date)).toEqual(["2026-10-06", "2026-10-07"]);
  });

  it("accepts Postgres HH:MM:SS times", () => {
    const slots = generateInterviewSlots([block("a", "14:00:00", "15:00:00"), block("b", "14:00:00", "15:00:00")]);
    expect(slots).toHaveLength(1);
  });
});

describe("isInterviewSlotBookable", () => {
  // 2026-10-07 09:00 Pacific (PDT, UTC-7) = 2026-10-07T16:00:00Z. Twelve hours earlier = 04:00Z.
  const slot = { date: "2026-10-07", startTime: "09:00", published: true, hasConfirmedBooking: false, execCount: 2 };

  it("is bookable exactly 12 hours before", () => {
    expect(isInterviewSlotBookable(slot, new Date("2026-10-07T04:00:00Z"))).toBe(true);
  });

  it("is not bookable one minute inside 12 hours", () => {
    expect(isInterviewSlotBookable(slot, new Date("2026-10-07T04:01:00Z"))).toBe(false);
  });

  it("rejects unpublished, booked, or under-staffed slots", () => {
    const now = new Date("2026-10-06T12:00:00Z");
    expect(isInterviewSlotBookable({ ...slot, published: false }, now)).toBe(false);
    expect(isInterviewSlotBookable({ ...slot, hasConfirmedBooking: true }, now)).toBe(false);
    expect(isInterviewSlotBookable({ ...slot, execCount: 1 }, now)).toBe(false);
    expect(isInterviewSlotBookable({ ...slot, execCount: 3 }, now)).toBe(true);
  });
});

describe("canSelfCancel", () => {
  it("allows cancelling exactly 24 hours before and blocks one minute later", () => {
    expect(canSelfCancel("2026-10-07", "09:00", new Date("2026-10-06T16:00:00Z"))).toBe(true);
    expect(canSelfCancel("2026-10-07", "09:00", new Date("2026-10-06T16:01:00Z"))).toBe(false);
  });
});

describe("isInterviewSwapEligible", () => {
  const target: InterviewSlotAssignment = { slotId: "t", date: D, startTime: "14:00", endTime: "15:00", execIds: ["a", "b"] };
  const other: InterviewSlotAssignment = { slotId: "o", date: D, startTime: "14:30", endTime: "15:30", execIds: ["c", "d"] };

  it("rejects an exec already on the slot", () => {
    expect(isInterviewSwapEligible(target, "a", [target, other])).toBe(false);
  });

  it("rejects an exec on an overlapping slot", () => {
    expect(isInterviewSwapEligible(target, "c", [target, other])).toBe(false);
  });

  it("allows an exec on a non-overlapping slot or no slot", () => {
    const later: InterviewSlotAssignment = { ...other, slotId: "l", startTime: "15:00", endTime: "16:00" };
    expect(isInterviewSwapEligible(target, "c", [target, later])).toBe(true);
    expect(isInterviewSwapEligible(target, "z", [target, other])).toBe(true);
  });
});

describe("panel bounds", () => {
  it("allows adding up to three and removing down to two", () => {
    expect(canAddToPanel(2)).toBe(true);
    expect(canAddToPanel(3)).toBe(false);
    expect(canRemoveFromPanel(3)).toBe(true);
    expect(canRemoveFromPanel(2)).toBe(false);
  });
});

describe("invitee parsing", () => {
  it("normalizes case and whitespace", () => {
    expect(normalizeInviteeEmail("  Jane.Doe@UCSC.edu ")).toBe("jane.doe@ucsc.edu");
  });

  it("parses email-only and email,name lines, ignoring blanks", () => {
    const { invitees, errors } = parseInviteeList("a@ucsc.edu\n\n  B@UCSC.EDU , Bea Smith \nc@ucsc.edu;Cy\nd@ucsc.edu\tDee");
    expect(errors).toEqual([]);
    expect(invitees).toEqual([
      { email: "a@ucsc.edu", name: null },
      { email: "b@ucsc.edu", name: "Bea Smith" },
      { email: "c@ucsc.edu", name: "Cy" },
      { email: "d@ucsc.edu", name: "Dee" },
    ]);
  });

  it("de-duplicates by email, keeping the first", () => {
    const { invitees } = parseInviteeList("a@ucsc.edu, First\nA@ucsc.edu, Second");
    expect(invitees).toEqual([{ email: "a@ucsc.edu", name: "First" }]);
  });

  it("reports non-UCSC addresses by line without adding them", () => {
    const { invitees, errors } = parseInviteeList("a@ucsc.edu\nbad@gmail.com\nnot-an-email");
    expect(invitees).toEqual([{ email: "a@ucsc.edu", name: null }]);
    expect(errors).toEqual(['Line 2: "bad@gmail.com" is not a @ucsc.edu address.', 'Line 3: "not-an-email" is not a @ucsc.edu address.']);
  });
});

describe("parseInterviewSettings", () => {
  it("defaults to closed and 60 minutes", () => {
    expect(parseInterviewSettings([])).toEqual({ bookingOpen: false, slotMinutes: 60 });
  });

  it("reads open and a valid slot length, rejecting nonsense lengths", () => {
    expect(parseInterviewSettings([{ key: "interview_booking_open", value: "true" }, { key: "interview_slot_minutes", value: "45" }])).toEqual({
      bookingOpen: true,
      slotMinutes: 45,
    });
    expect(parseInterviewSettings([{ key: "interview_slot_minutes", value: "abc" }]).slotMinutes).toBe(60);
    expect(parseInterviewSettings([{ key: "interview_slot_minutes", value: "5" }]).slotMinutes).toBe(60);
  });
});

describe("parseInviteeList with several emails on one line", () => {
  it("treats a semicolon- or comma-separated one-line list as separate invitees, not a name", () => {
    const { invitees, errors } = parseInviteeList("a@ucsc.edu; b@ucsc.edu; c@ucsc.edu");
    expect(errors).toEqual([]);
    expect(invitees).toEqual([
      { email: "a@ucsc.edu", name: null },
      { email: "b@ucsc.edu", name: null },
      { email: "c@ucsc.edu", name: null },
    ]);
    expect(parseInviteeList("a@ucsc.edu, b@ucsc.edu").invitees.map((i) => i.email)).toEqual(["a@ucsc.edu", "b@ucsc.edu"]);
  });

  it("splits space-separated addresses and reports bad ones", () => {
    const { invitees, errors } = parseInviteeList("a@ucsc.edu b@gmail.com c@ucsc.edu");
    expect(invitees.map((i) => i.email)).toEqual(["a@ucsc.edu", "c@ucsc.edu"]);
    expect(errors).toEqual(['Line 1: "b@gmail.com" is not a @ucsc.edu address.']);
  });
});

describe("isInterviewPast", () => {
  // 2026-10-07 10:00 Pacific (PDT) = 17:00Z
  it("is false before the interview ends and true after", () => {
    expect(isInterviewPast("2026-10-07", "10:00", new Date("2026-10-07T16:59:00Z"))).toBe(false);
    expect(isInterviewPast("2026-10-07", "10:00", new Date("2026-10-07T17:00:00Z"))).toBe(true);
    expect(isInterviewPast("2026-10-07", "10:00", new Date("2027-03-01T00:00:00Z"))).toBe(true);
  });
});
