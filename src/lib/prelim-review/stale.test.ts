import { describe, expect, it } from "vitest";
import { effectiveStatus } from "./stale";

const now = new Date("2026-10-15T12:10:00Z");

describe("effectiveStatus", () => {
  it("keeps a recent running review running", () => {
    expect(effectiveStatus({ status: "running", createdAt: "2026-10-15T12:08:00Z" }, now)).toEqual({ status: "running", errorMessage: null });
  });
  it("turns a running review older than 5 minutes into an error with a plain message", () => {
    const r = effectiveStatus({ status: "running", createdAt: "2026-10-15T12:00:00Z" }, now);
    expect(r.status).toBe("error");
    expect(r.errorMessage).toMatch(/took too long/i);
  });
  it("leaves finished reviews alone", () => {
    expect(effectiveStatus({ status: "done", createdAt: "2026-10-15T09:00:00Z" }, now).status).toBe("done");
  });
});
