import { describe, expect, it } from "vitest";
import { compactForModel } from "./compact";
import { runKnowledge } from "./knowledge-tool";

const deps = { rowCap: 20 };

describe("runKnowledge", () => {
  it("returns the best chunks in the standard result shape", () => {
    const r = runKnowledge(deps, "what is MECE");
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.length).toBeLessThanOrEqual(2);
    expect(r.items[0]).toMatchObject({ title: expect.any(String), section: expect.any(String), source: expect.any(String), updated: expect.any(String), excerpt: expect.any(String) });
    expect(r.truncated).toBe(false);
  });
  it("never includes ids or Drive urls in what the model sees", () => {
    const text = compactForModel(runKnowledge(deps, "what is MECE"));
    expect(text).not.toMatch(/docs\.google|drive\.google|kb-\d+/);
  });
  it("says so (and tells the model not to invent) when nothing matches", () => {
    const r = runKnowledge(deps, "quarterly tax filing");
    expect(r.items).toEqual([]);
    expect(r.note).toMatch(/doesn't cover/i);
    expect(r.note).toMatch(/do not invent/i);
    expect(compactForModel(r)).toBe(r.note);
  });
  it("respects the row cap", () => {
    expect(runKnowledge({ rowCap: 1 }, "consulting").items).toHaveLength(1);
  });
});
