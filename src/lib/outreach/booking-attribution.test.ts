import { describe, expect, it, vi } from "vitest";
import { attributeBooking } from "./booking-attribution";

const deps = (over = {}) => ({
  findByToken: vi.fn(async (t: string) => (t === "good" ? { id: "p1" } : null)),
  findByEmail: vi.fn(async (e: string) => (e === "jo@acme.com" ? { id: "p2" } : null)),
  markBooked: vi.fn(async () => {}),
  ...over,
});

describe("attributeBooking", () => {
  it("matches by the lead token first", async () => {
    const d = deps();
    await attributeBooking({ leadToken: "good", email: "jo@acme.com" }, d);
    expect(d.markBooked).toHaveBeenCalledWith("p1");
    expect(d.findByEmail).not.toHaveBeenCalled();
  });
  it("falls back to the booking email when the token is unknown or missing", async () => {
    const d = deps();
    await attributeBooking({ leadToken: "bogus", email: "Jo@Acme.com" }, d);
    expect(d.markBooked).toHaveBeenCalledWith("p2");
    const d2 = deps();
    await attributeBooking({ leadToken: undefined, email: "jo@acme.com" }, d2);
    expect(d2.markBooked).toHaveBeenCalledWith("p2");
  });
  it("does nothing when nobody matches", async () => {
    const d = deps();
    await attributeBooking({ leadToken: "bogus", email: "x@y.co" }, d);
    expect(d.markBooked).not.toHaveBeenCalled();
  });
  it("swallows its own errors so a booking can never fail because of outreach", async () => {
    const d = deps({ markBooked: vi.fn(async () => { throw new Error("db down"); }) });
    await expect(attributeBooking({ leadToken: "good", email: "a@b.co" }, d)).resolves.toBeUndefined();
  });
});
