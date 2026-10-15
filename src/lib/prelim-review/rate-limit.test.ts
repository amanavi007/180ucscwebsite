import { describe, expect, it } from "vitest";
import { hourAgoIso, isOverLimit } from "./rate-limit";

describe("rate limit", () => {
  it("blocks at 10 reviews in the last hour", () => {
    expect(isOverLimit(9)).toBe(false);
    expect(isOverLimit(10)).toBe(true);
  });
  it("computes one hour ago", () => {
    expect(hourAgoIso(new Date("2026-10-15T12:00:00Z"))).toBe("2026-10-15T11:00:00.000Z");
  });
});
