import { describe, expect, it } from "vitest";
import { attendanceTone, barPercent, deadlineLabel, humanize } from "./card-format";

describe("humanize", () => {
  it("turns snake_case into a sentence-case label", () => {
    expect(humanize("initial_research")).toBe("Initial research");
    expect(humanize("on_track")).toBe("On track");
    expect(humanize("")).toBe("");
  });
});

describe("attendanceTone", () => {
  it("bands the rate: 80+ good, 60-79 warn, below 60 bad", () => {
    expect(attendanceTone(100)).toBe("good");
    expect(attendanceTone(80)).toBe("good");
    expect(attendanceTone(79)).toBe("warn");
    expect(attendanceTone(60)).toBe("warn");
    expect(attendanceTone(59)).toBe("bad");
    expect(attendanceTone(0)).toBe("bad");
  });
});

describe("deadlineLabel", () => {
  it("describes the gap in calendar days", () => {
    expect(deadlineLabel("2026-10-12", "2026-10-07")).toEqual({ text: "in 5 days", overdue: false });
    expect(deadlineLabel("2026-10-08", "2026-10-07")).toEqual({ text: "tomorrow", overdue: false });
    expect(deadlineLabel("2026-10-07", "2026-10-07")).toEqual({ text: "today", overdue: false });
    expect(deadlineLabel("2026-10-06", "2026-10-07")).toEqual({ text: "1 day overdue", overdue: true });
    expect(deadlineLabel("2026-10-01", "2026-10-07")).toEqual({ text: "6 days overdue", overdue: true });
  });
  it("handles a missing deadline", () => {
    expect(deadlineLabel(null, "2026-10-07")).toEqual({ text: "No deadline", overdue: false });
  });
});

describe("barPercent", () => {
  it("scales to the max and clamps to 0-100", () => {
    expect(barPercent(5, 10)).toBe(50);
    expect(barPercent(15, 10)).toBe(100);
    expect(barPercent(-3, 10)).toBe(0);
    expect(barPercent(5, 0)).toBe(0);
  });
});
