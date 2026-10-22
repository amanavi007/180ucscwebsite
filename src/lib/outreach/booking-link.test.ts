import { describe, expect, it } from "vitest";
import { buildBookingUrl } from "./booking-link";

describe("buildBookingUrl", () => {
  it("adds the prospect token to the booking page", () => {
    expect(buildBookingUrl("https://ucsc180dc.org", "abc123")).toBe("https://ucsc180dc.org/services/book?lead=abc123");
  });
  it("tolerates a trailing slash on the site url", () => {
    expect(buildBookingUrl("https://ucsc180dc.org/", "abc")).toBe("https://ucsc180dc.org/services/book?lead=abc");
  });
});
