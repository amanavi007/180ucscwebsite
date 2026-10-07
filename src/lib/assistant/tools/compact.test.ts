import { describe, expect, it } from "vitest";
import { compactForModel } from "./compact";

describe("compactForModel", () => {
  it("writes the column names once, then pipe-separated rows", () => {
    const text = compactForModel({
      items: [
        { task: "Write memo", project: "Acme", due: "2026-10-09", status: "in_progress" },
        { task: "Call client", project: null, due: null, status: "not_started" },
      ],
      total: 2,
      truncated: false,
    });
    expect(text).toBe(
      "2 results\ntask|project|due|status\nWrite memo|Acme|2026-10-09|in_progress\nCall client|||not_started",
    );
  });
  it("says how many were cut when truncated", () => {
    const text = compactForModel({ items: [{ a: 1 }], total: 9, truncated: true });
    expect(text.split("\n")[0]).toBe("showing 1 of 9");
  });
  it("returns just the note for an empty result", () => {
    expect(compactForModel({ items: [], total: 0, truncated: false, note: "No open tasks." })).toBe("No open tasks.");
  });
  it("is much smaller than the JSON it replaces", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ name: `Person ${i}`, team: "Acme", ratePct: 90 - i, unexcused: i, tardy: 0, excused: 0 }));
    const result = { items, total: 10, truncated: false };
    expect(compactForModel(result).length).toBeLessThan(JSON.stringify(result).length * 0.6);
  });
  it("describes single-object results (own attendance) as key=value", () => {
    expect(compactForModel({ ratePct: 88, unexcused: 1, tardy: 0, excused: 0 })).toBe("ratePct=88 unexcused=1 tardy=0 excused=0");
  });
});
