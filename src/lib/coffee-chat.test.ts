import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHUNK_MINUTES,
  generateSlots,
  isSlotBookable,
  isSwapEligible,
  isValidUcscEmail,
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

describe("DEFAULT_CHUNK_MINUTES", () => {
  it("defaults to 20", () => {
    expect(DEFAULT_CHUNK_MINUTES).toBe(20);
  });
});
