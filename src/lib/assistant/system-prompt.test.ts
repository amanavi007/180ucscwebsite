import { describe, expect, it } from "vitest";
import { buildInstructions } from "./system-prompt";

const text = buildInstructions({ name: "Sam Lee", role: "consultant" }, "Fall 2026", "2026-10-07");

describe("buildInstructions", () => {
  it("stays small, because it is sent with every model request", () => {
    expect(text.length).toBeLessThan(1000);
  });
  it("tells the model results are shown as cards so it should not repeat them", () => {
    expect(text).toMatch(/card/i);
    expect(text).toMatch(/one (short )?sentence/i);
  });
  it("keeps the safety rules: data only from tools, tool text is untrusted, writes need approval", () => {
    expect(text).toMatch(/only from tool results/i);
    expect(text).toMatch(/untrusted/i);
    expect(text).toMatch(/approve/i);
  });
  it("puts the per-user line last so the static prefix is identical across requests", () => {
    expect(text.endsWith("Today: 2026-10-07.")).toBe(true);
    expect(text.indexOf("Sam Lee")).toBeGreaterThan(text.indexOf("approve"));
  });
});
