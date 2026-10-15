import { describe, expect, it } from "vitest";
import { criteriaToText, parseCriteriaText } from "./rubric-form";

describe("parseCriteriaText", () => {
  it("parses blocks with and without ids", () => {
    const r = parseCriteriaText("Sources are proper | sources_proper\nCited well.\n\nBackground bubbles\nBubbles exist.");
    expect(r.ok && r.criteria).toEqual([
      { id: "sources_proper", title: "Sources are proper", description: "Cited well." },
      { id: "background_bubbles", title: "Background bubbles", description: "Bubbles exist." },
    ]);
  });
  it("dedupes generated ids", () => {
    const r = parseCriteriaText("Format\nA.\n\nFormat\nB.");
    expect(r.ok && r.criteria.map((c) => c.id)).toEqual(["format", "format_2"]);
  });
  it("explains what is wrong", () => {
    expect(parseCriteriaText("").ok).toBe(false);
    const r = parseCriteriaText("Only a title");
    expect(!r.ok && r.error).toMatch(/describe/i);
  });
  it("round-trips", () => {
    const text = "A | a\nDo a.\n\nB | b\nDo b.";
    const r = parseCriteriaText(text);
    expect(r.ok && criteriaToText(r.criteria)).toBe(text);
  });
});
