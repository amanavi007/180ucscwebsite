import { describe, expect, it } from "vitest";
import { cutoffDate } from "./retention";

describe("cutoffDate", () => {
  it("is 90 days before now by default", () => {
    expect(cutoffDate(new Date("2026-10-07T00:00:00.000Z"))).toBe("2026-07-09T00:00:00.000Z");
  });
  it("accepts a custom window", () => {
    expect(cutoffDate(new Date("2026-10-07T00:00:00.000Z"), 1)).toBe("2026-10-06T00:00:00.000Z");
  });
});
