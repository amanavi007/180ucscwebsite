import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHUNK_MINUTES,
  expandAvailabilityEntry,
  formatTime12h,
  formatTimeRange,
  generateSlots,
  isSlotBookable,
  locationGroupsForSlot,
  isSwapEligible,
  isValidUcscEmail,
  mapsSearchUrl,
  openUntilLabel,
  COFFEE_CHAT_LOCATIONS,
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

  it("sits one exec out when an odd number are free, instead of creating an unbookable solo slot", () => {
    const availability: AvailabilityBlock[] = ["a", "b", "c"].map((execId) => ({
      execId,
      date: "2026-10-06",
      startTime: "14:00",
      endTime: "14:20",
    }));
    const slots = generateSlots(availability, 20);
    expect(slots).toHaveLength(1);
    expect(slots[0].execId2).not.toBeNull();
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
    expect(generateSlots(availability, 20)).toEqual([]);
  });
});

describe("generateSlots balancing", () => {
  const D = "2026-10-06";
  const free = (execIds: string[], startTime: string, endTime: string): AvailabilityBlock[] =>
    execIds.map((execId) => ({ execId, date: D, startTime, endTime }));

  function loads(slots: { execId1: string; execId2: string | null }[]) {
    const counts = new Map<string, number>();
    for (const s of slots) for (const id of [s.execId1, s.execId2]) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  }

  it("spreads chats evenly: with three execs free for three windows, everyone gets two", () => {
    const slots = generateSlots(free(["a", "b", "c"], "14:00", "15:00"), 20);
    expect(slots).toHaveLength(3);
    expect([...loads(slots).values()]).toEqual([2, 2, 2]);
  });

  it("does not repeat a pair across windows when other pairings are possible", () => {
    const slots = generateSlots(free(["a", "b", "c", "d"], "14:00", "15:00"), 20);
    const pairs = slots.map((s) => [s.execId1, s.execId2].sort().join("+"));
    expect(slots).toHaveLength(6); // 2 parallel slots x 3 windows
    // Each of the 3 windows uses a different way of splitting four execs into two pairs.
    const byWindow = new Map<string, string[]>();
    slots.forEach((s, i) => byWindow.set(s.startTime, [...(byWindow.get(s.startTime) ?? []), pairs[i]]));
    const windowSignatures = [...byWindow.values()].map((p) => p.sort().join("|"));
    expect(new Set(windowSignatures).size).toBe(3);
  });

  it("prefers execs who have had fewer chats so far, using existing slots as history", () => {
    // a and b already have three chats each; c and d have none. Only three execs free now (a, c, d): a should sit out.
    const existing: ExistingSlotAssignment[] = [1, 2, 3].map((n) => ({
      slotId: `h${n}`,
      date: "2026-10-05",
      startTime: `1${n}:00`,
      endTime: `1${n}:20`,
      execId1: "a",
      execId2: "b",
    }));
    const slots = generateSlots(free(["a", "c", "d"], "14:00", "14:20"), 20, existing);
    expect(slots).toHaveLength(1);
    expect([slots[0].execId1, slots[0].execId2].sort()).toEqual(["c", "d"]);
  });

  it("looks at the whole window, so it doesn't box itself into a forced repeat", () => {
    // Window 1 pairs a+b. In window 2 (a, b, c, d free) taking c+d first would force a+b together again.
    const availability: AvailabilityBlock[] = [
      ...free(["a", "b"], "14:00", "14:20"),
      ...free(["a", "b", "c", "d"], "14:20", "14:40"),
    ];
    const slots = generateSlots(availability, 20);
    const window2 = slots.filter((s) => s.startTime === "14:20").map((s) => [s.execId1, s.execId2].sort().join("+"));
    expect(window2).toHaveLength(2);
    expect(window2).not.toContain("a+b");
  });

  it("avoids re-pairing two execs who already met, when it can", () => {
    const existing: ExistingSlotAssignment[] = [
      { slotId: "h1", date: "2026-10-05", startTime: "10:00", endTime: "10:20", execId1: "a", execId2: "b" },
      { slotId: "h2", date: "2026-10-05", startTime: "11:00", endTime: "11:20", execId1: "c", execId2: "d" },
    ];
    const slots = generateSlots(free(["a", "b", "c", "d"], "14:00", "14:20"), 20, existing);
    const pairs = slots.map((s) => [s.execId1, s.execId2].sort().join("+")).sort();
    expect(pairs).not.toContain("a+b");
    expect(pairs).not.toContain("c+d");
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
        { date: "2026-10-06", startTime: "14:00", published: true, hasConfirmedBooking: false, hasTwoExecs: true },
        now,
        120,
      ),
    ).toBe(true);
  });

  it("is not bookable while the slot only has one exec (applicants are promised two)", () => {
    expect(
      isSlotBookable(
        { date: "2026-10-06", startTime: "14:00", published: true, hasConfirmedBooking: false, hasTwoExecs: false },
        now,
        120,
      ),
    ).toBe(false);
  });

  it("is not bookable when unpublished", () => {
    expect(
      isSlotBookable(
        { date: "2026-10-06", startTime: "14:00", published: false, hasConfirmedBooking: false, hasTwoExecs: true },
        now,
        120,
      ),
    ).toBe(false);
  });

  it("is not bookable once it has a confirmed booking", () => {
    expect(
      isSlotBookable(
        { date: "2026-10-06", startTime: "14:00", published: true, hasConfirmedBooking: true, hasTwoExecs: true },
        now,
        120,
      ),
    ).toBe(false);
  });

  it("is not bookable within the minimum lead time", () => {
    expect(
      isSlotBookable(
        { date: "2026-10-06", startTime: "11:30", published: true, hasConfirmedBooking: false, hasTwoExecs: true },
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
    // a is free at 14:00 but alone (b is busy on the swapped slot), so no slot is created for that window.
    expect(created.filter((s) => s.startTime === "14:00")).toEqual([]);
  });

  it("aligns chunks to a shared grid so off-grid blocks still pair and don't overlap", () => {
    const availability: AvailabilityBlock[] = [
      { execId: "a", date: "2026-10-06", startTime: "14:00", endTime: "15:00" },
      { execId: "b", date: "2026-10-06", startTime: "14:10", endTime: "15:00" },
    ];
    const slots = generateSlots(availability, 20);
    // b starts at 14:10, so the first window with both free is 14:20.
    expect(slots.map((s) => `${s.startTime}|${s.execId1}|${s.execId2}`).sort()).toEqual([
      "14:20|a|b",
      "14:40|a|b",
    ]);
  });

  it("does not create overlapping slots for one exec from overlapping availability blocks", () => {
    const availability: AvailabilityBlock[] = [
      { execId: "a", date: "2026-10-06", startTime: "14:00", endTime: "15:00" },
      { execId: "a", date: "2026-10-06", startTime: "14:10", endTime: "14:50" },
      { execId: "b", date: "2026-10-06", startTime: "14:00", endTime: "15:00" },
    ];
    const slots = generateSlots(availability, 20);
    expect(slots.map((s) => s.startTime).sort()).toEqual(["14:00", "14:20", "14:40"]);
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

describe("locationGroupsForSlot", () => {
  const names = (slot: { date: string; startTime: string; endTime: string }) =>
    locationGroupsForSlot(slot).flatMap((g) => g.locations.map((l) => l.name));

  it("offers every place for a weekday midday slot", () => {
    const all = names({ date: "2026-10-06", startTime: "12:00", endTime: "12:20" }); // Tuesday
    expect(all).toContain("Oakes Cafe");
    expect(all).toContain("Cafe Iveta (Westside)");
    expect(all).toContain("McHenry Library");
  });

  it("drops cafes that have closed by a late-afternoon slot but keeps libraries", () => {
    const late = names({ date: "2026-10-06", startTime: "16:40", endTime: "17:00" });
    expect(late).not.toContain("Cafe Iveta (Westside)");
    expect(late).not.toContain("University Center Cafe");
    expect(late).toContain("Verve Coffee Roasters (Westside)");
    expect(late).toContain("McHenry Library");
  });

  it("drops weekday-only cafes on a Saturday", () => {
    const saturday = names({ date: "2026-10-10", startTime: "12:00", endTime: "12:20" });
    expect(saturday).not.toContain("Oakes Cafe");
    expect(saturday).not.toContain("University Center Cafe");
    expect(saturday).toContain("Cat & Cloud Coffee (Westside)");
  });

  it("requires the whole slot to end before closing", () => {
    expect(names({ date: "2026-10-06", startTime: "14:50", endTime: "15:10" })).not.toContain("Cafe Iveta (Westside)");
  });
});

describe("openUntilLabel", () => {
  const find = (name: string) => COFFEE_CHAT_LOCATIONS.find((l) => l.name === name)!;

  it("drops :00 from a closing time on the hour", () => {
    expect(openUntilLabel(find("Oakes Cafe"), "2026-10-06")).toBe("Open until 8 PM"); // Tuesday
  });

  it("keeps minutes when the cafe closes off the hour", () => {
    expect(openUntilLabel(find("The 11th Hour Coffee"), "2026-10-06")).toBe("Open until 6:30 PM");
  });

  it("uses that weekday's hours", () => {
    expect(openUntilLabel(find("University Center Cafe"), "2026-10-09")).toBe("Open until 2 PM"); // Friday
  });

  it("returns null for places with no listed hours, or closed that day", () => {
    expect(openUntilLabel(find("McHenry Library"), "2026-10-06")).toBeNull();
    expect(openUntilLabel(find("Oakes Cafe"), "2026-10-10")).toBeNull(); // Saturday
  });
});

describe("formatTimeRange", () => {
  it("shows the meridiem once when both ends share it", () => {
    expect(formatTimeRange("14:00", "14:20")).toBe("2:00 \u2013 2:20 PM");
    expect(formatTimeRange("09:40:00", "10:00:00")).toBe("9:40 \u2013 10:00 AM");
  });

  it("shows both meridiems when the range crosses noon", () => {
    expect(formatTimeRange("11:50", "12:10")).toBe("11:50 AM \u2013 12:10 PM");
  });
});

describe("mapsSearchUrl", () => {
  it("builds a Google Maps search for the place, scoped to Santa Cruz", () => {
    expect(mapsSearchUrl("Oakes Cafe")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Oakes%20Cafe%2C%20Santa%20Cruz%2C%20CA",
    );
  });

  it("encodes characters that would break the query string", () => {
    expect(mapsSearchUrl("Cat & Cloud Coffee (Westside)")).toContain("Cat%20%26%20Cloud%20Coffee%20(Westside)");
  });
});
