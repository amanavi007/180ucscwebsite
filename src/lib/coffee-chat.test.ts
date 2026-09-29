import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHUNK_MINUTES,
  expandAvailabilityEntry,
  formatTime12h,
  generateSlots,
  isSlotBookable,
  isSwapEligible,
  isValidUcscEmail,
  normalizeTime,
  type AvailabilityBlock,
  type ExistingSlotAssignment,
} from "./coffee-chat";

describe("generateSlots", () => {
  it("pairs two execs free at the same time into one slot", () => {
    const availability: AvailabilityBlock[] = [
      { execId: "a", date: "2026-10-06", startTime: "14:00", endTime: "14:20" },
      { execId: "b", date: "2026-10-06", startTime: "14:00", endTime: "14:20" },
    ];
    const slots = generateSlots(availability, 20);
    expect(slots).toEqual([
      { date: "2026-10-06", startTime: "14:00", endTime: "14:20", execId1: "a", execId2: "b" },
    ]);
  });

  it("creates two parallel slots when four execs are free at the same time", () => {
    const availability: AvailabilityBlock[] = ["a", "b", "c", "d"].map((execId) => ({
      execId,
      date: "2026-10-06",
      startTime: "14:00",
      endTime: "14:20",
    }));
    const slots = generateSlots(availability, 20);
    expect(slots).toHaveLength(2);
    const pairedExecs = slots.flatMap((s) => [s.execId1, s.execId2]).sort();
    expect(pairedExecs).toEqual(["a", "b", "c", "d"]);
  });

  it("leaves an odd exec out unpaired (execId2 null) instead of dropping them", () => {
    const availability: AvailabilityBlock[] = ["a", "b", "c"].map((execId) => ({
      execId,
      date: "2026-10-06",
      startTime: "14:00",
      endTime: "14:20",
    }));
    const slots = generateSlots(availability, 20);
    expect(slots).toHaveLength(2);
    expect(slots.some((s) => s.execId2 === null)).toBe(true);
  });

  it("splits a 40-minute block into two 20-minute chunks", () => {
    const availability: AvailabilityBlock[] = [
      { execId: "a", date: "2026-10-06", startTime: "14:00", endTime: "14:40" },
      { execId: "b", date: "2026-10-06", startTime: "14:00", endTime: "14:40" },
    ];
    const slots = generateSlots(availability, 20);
    expect(slots.map((s) => s.startTime).sort()).toEqual(["14:00", "14:20"]);
  });

  it("does not pair execs whose windows don't overlap", () => {
    const availability: AvailabilityBlock[] = [
      { execId: "a", date: "2026-10-06", startTime: "14:00", endTime: "14:20" },
      { execId: "b", date: "2026-10-06", startTime: "15:00", endTime: "15:20" },
    ];
    const slots = generateSlots(availability, 20);
    expect(slots).toHaveLength(2);
    expect(slots.every((s) => s.execId2 === null)).toBe(true);
  });
});

describe("isSwapEligible", () => {
  const target: ExistingSlotAssignment = {
    slotId: "slot-1",
    date: "2026-10-06",
    startTime: "14:00",
    endTime: "14:20",
    execId1: "a",
    execId2: "b",
  };

  it("allows a candidate who is free at that exact window and not booked elsewhere", () => {
    const candidateAvailability: AvailabilityBlock[] = [
      { execId: "c", date: "2026-10-06", startTime: "13:00", endTime: "15:00" },
    ];
    expect(isSwapEligible(target, "c", candidateAvailability, [target])).toBe(true);
  });

  it("rejects a candidate with no matching availability", () => {
    expect(isSwapEligible(target, "c", [], [target])).toBe(false);
  });

  it("rejects a candidate already assigned to a different slot at the same overlapping time", () => {
    const candidateAvailability: AvailabilityBlock[] = [
      { execId: "c", date: "2026-10-06", startTime: "13:00", endTime: "15:00" },
    ];
    const otherSlot: ExistingSlotAssignment = {
      slotId: "slot-2",
      date: "2026-10-06",
      startTime: "14:00",
      endTime: "14:20",
      execId1: "c",
      execId2: null,
    };
    expect(isSwapEligible(target, "c", candidateAvailability, [target, otherSlot])).toBe(false);
  });
});

describe("isSlotBookable", () => {
  const now = new Date("2026-10-06T18:00:00.000Z"); // 11:00 PDT

  it("is bookable when published, unbooked, and past the minimum lead time", () => {
    expect(
      isSlotBookable(
        { date: "2026-10-06", startTime: "14:00", published: true, hasConfirmedBooking: false },
        now,
        120,
      ),
    ).toBe(true);
  });

  it("is not bookable when unpublished", () => {
    expect(
      isSlotBookable(
        { date: "2026-10-06", startTime: "14:00", published: false, hasConfirmedBooking: false },
        now,
        120,
      ),
    ).toBe(false);
  });

  it("is not bookable once it has a confirmed booking", () => {
    expect(
      isSlotBookable(
        { date: "2026-10-06", startTime: "14:00", published: true, hasConfirmedBooking: true },
        now,
        120,
      ),
    ).toBe(false);
  });

  it("is not bookable within the minimum lead time", () => {
    expect(
      isSlotBookable(
        { date: "2026-10-06", startTime: "11:30", published: true, hasConfirmedBooking: false },
        now,
        120,
      ),
    ).toBe(false);
  });
});

describe("isValidUcscEmail", () => {
  it("accepts a ucsc.edu address", () => {
    expect(isValidUcscEmail("student@ucsc.edu")).toBe(true);
  });

  it("rejects a non-ucsc address", () => {
    expect(isValidUcscEmail("student@gmail.com")).toBe(false);
  });

  it("rejects a malformed address", () => {
    expect(isValidUcscEmail("not-an-email")).toBe(false);
  });
});

describe("expandAvailabilityEntry", () => {
  it("expands several days and several time blocks into one row per day and block", () => {
    const result = expandAvailabilityEntry(
      ["2026-10-06", "2026-10-07"],
      [
        { startTime: "10:00", endTime: "11:00" },
        { startTime: "14:00", endTime: "15:30" },
      ],
    );
    expect(result).toEqual({
      rows: [
        { date: "2026-10-06", startTime: "10:00", endTime: "11:00" },
        { date: "2026-10-06", startTime: "14:00", endTime: "15:30" },
        { date: "2026-10-07", startTime: "10:00", endTime: "11:00" },
        { date: "2026-10-07", startTime: "14:00", endTime: "15:30" },
      ],
    });
  });

  it("ignores duplicate days and returns them sorted", () => {
    const result = expandAvailabilityEntry(["2026-10-07", "2026-10-06", "2026-10-07"], [{ startTime: "10:00", endTime: "11:00" }]);
    expect("rows" in result && result.rows.map((r) => r.date)).toEqual(["2026-10-06", "2026-10-07"]);
  });

  it("rejects an entry with no days", () => {
    expect(expandAvailabilityEntry([], [{ startTime: "10:00", endTime: "11:00" }])).toEqual({ error: "Pick at least one day." });
  });

  it("rejects an entry with no time blocks", () => {
    expect(expandAvailabilityEntry(["2026-10-06"], [])).toEqual({ error: "Add at least one time block." });
  });

  it("rejects a block that ends before it starts or is missing a time", () => {
    expect(expandAvailabilityEntry(["2026-10-06"], [{ startTime: "11:00", endTime: "10:00" }])).toEqual({
      error: "Each block needs an end time after its start time.",
    });
    expect(expandAvailabilityEntry(["2026-10-06"], [{ startTime: "", endTime: "10:00" }])).toEqual({
      error: "Each block needs an end time after its start time.",
    });
  });

  it("rejects blocks that overlap each other", () => {
    expect(
      expandAvailabilityEntry(
        ["2026-10-06"],
        [
          { startTime: "10:00", endTime: "11:00" },
          { startTime: "10:30", endTime: "12:00" },
        ],
      ),
    ).toEqual({ error: "Your time blocks overlap. Adjust them so each is separate." });
  });
});

describe("formatTime12h", () => {
  it("formats afternoon, morning, noon and midnight times as 12-hour AM/PM", () => {
    expect(formatTime12h("14:00")).toBe("2:00 PM");
    expect(formatTime12h("09:05")).toBe("9:05 AM");
    expect(formatTime12h("12:30")).toBe("12:30 PM");
    expect(formatTime12h("00:00")).toBe("12:00 AM");
  });

  it("accepts Postgres HH:MM:SS values", () => {
    expect(formatTime12h("14:20:00")).toBe("2:20 PM");
  });
});

describe("normalizeTime", () => {
  it("trims Postgres time values (HH:MM:SS) to HH:MM and leaves HH:MM alone", () => {
    expect(normalizeTime("14:00:00")).toBe("14:00");
    expect(normalizeTime("14:00")).toBe("14:00");
  });
});

describe("generateSlots against existing slots and off-grid blocks", () => {
  const twoExecs: AvailabilityBlock[] = [
    { execId: "a", date: "2026-10-06", startTime: "14:00", endTime: "15:00" },
    { execId: "b", date: "2026-10-06", startTime: "14:00", endTime: "15:00" },
  ];

  it("creates nothing when re-run against slots it already made, even with HH:MM:SS times from the DB", () => {
    const first = generateSlots(twoExecs, 20);
    const existing: ExistingSlotAssignment[] = first.map((s, i) => ({
      slotId: `s${i}`,
      date: s.date,
      startTime: `${s.startTime}:00`,
      endTime: `${s.endTime}:00`,
      execId1: s.execId1,
      execId2: s.execId2,
    }));
    expect(generateSlots(twoExecs, 20, existing)).toEqual([]);
  });

  it("never re-assigns an exec who was swapped onto another slot at an overlapping time", () => {
    // Slot 14:00 was (a,b) but a was swapped out for d; a must not get re-paired into a new 14:00 slot.
    const existing: ExistingSlotAssignment[] = [
      { slotId: "s1", date: "2026-10-06", startTime: "14:00", endTime: "14:20", execId1: "d", execId2: "b" },
      { slotId: "s2", date: "2026-10-06", startTime: "14:20", endTime: "14:40", execId1: "a", execId2: "b" },
      { slotId: "s3", date: "2026-10-06", startTime: "14:40", endTime: "15:00", execId1: "a", execId2: "b" },
    ];
    const created = generateSlots(twoExecs, 20, existing);
    const at1400 = created.filter((s) => s.startTime === "14:00");
    expect(at1400).toEqual([{ date: "2026-10-06", startTime: "14:00", endTime: "14:20", execId1: "a", execId2: null }]);
  });

  it("aligns chunks to a shared grid so off-grid blocks still pair and don't overlap", () => {
    const availability: AvailabilityBlock[] = [
      { execId: "a", date: "2026-10-06", startTime: "14:00", endTime: "15:00" },
      { execId: "b", date: "2026-10-06", startTime: "14:10", endTime: "15:00" },
    ];
    const slots = generateSlots(availability, 20);
    expect(slots.map((s) => `${s.startTime}|${s.execId1}|${s.execId2}`).sort()).toEqual([
      "14:00|a|null",
      "14:20|a|b",
      "14:40|a|b",
    ]);
  });

  it("does not create overlapping slots for one exec from overlapping availability blocks", () => {
    const availability: AvailabilityBlock[] = [
      { execId: "a", date: "2026-10-06", startTime: "14:00", endTime: "15:00" },
      { execId: "a", date: "2026-10-06", startTime: "14:10", endTime: "14:50" },
    ];
    const starts = generateSlots(availability, 20).map((s) => s.startTime).sort();
    expect(starts).toEqual(["14:00", "14:20", "14:40"]);
  });
});

describe("isSwapEligible on the target slot itself", () => {
  const target: ExistingSlotAssignment = {
    slotId: "slot-1",
    date: "2026-10-06",
    startTime: "14:00",
    endTime: "14:20",
    execId1: "a",
    execId2: "b",
  };
  const availability: AvailabilityBlock[] = [
    { execId: "a", date: "2026-10-06", startTime: "13:00", endTime: "15:00" },
    { execId: "b", date: "2026-10-06", startTime: "13:00", endTime: "15:00" },
  ];

  it("rejects putting the exec already in the other position onto this slot (no A,A slot)", () => {
    expect(isSwapEligible(target, "a", availability, [target])).toBe(false);
  });
});

describe("DEFAULT_CHUNK_MINUTES", () => {
  it("defaults to 20", () => {
    expect(DEFAULT_CHUNK_MINUTES).toBe(20);
  });
});
