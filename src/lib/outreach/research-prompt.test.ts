import { describe, expect, it } from "vitest";
import { buildResearchPrompt, RESEARCH_CSV_HEADER } from "./research-prompt";
import { parseProspectCsv } from "./csv";

describe("RESEARCH_CSV_HEADER", () => {
  it("is exactly what the importer accepts", () => {
    const columns = RESEARCH_CSV_HEADER.split(",").length;
    const row = ["Acme", "https://acme.com", "Does things", "10", "Seed", "tech", "Jo", "CEO", "jo@acme.com", "Needs help", "https://acme.com/about"];
    expect(row).toHaveLength(columns);
    const { rows, errors } = parseProspectCsv(`${RESEARCH_CSV_HEADER}\n${row.join(",")}`);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ company: "Acme", contactEmail: "jo@acme.com", niche: "tech", sizeStage: "10, Seed", summary: "Does things", whyFit: "Needs help" });
    expect(rows[0].facts[0].sourceUrl).toBe("https://acme.com/about");
  });
});

describe("buildResearchPrompt", () => {
  const prompt = buildResearchPrompt({ niche: "seed-stage med-tech startups in the Bay Area", needs: "a go-to-market plan", exclude: "" });

  it("puts the niche, the need and the header row in the prompt", () => {
    expect(prompt).toContain("seed-stage med-tech startups in the Bay Area");
    expect(prompt).toContain("a go-to-market plan");
    expect(prompt.split("\n")).toContain(RESEARCH_CSV_HEADER);
  });
  it("says none when no companies are excluded, and lists them when given", () => {
    expect(prompt).toMatch(/already worked with: none/);
    expect(buildResearchPrompt({ niche: "n", needs: "x", exclude: "Acme, Zed Inc" })).toMatch(/already worked with: Acme, Zed Inc/);
  });
  it("forbids guessing and personal email domains", () => {
    expect(prompt).toMatch(/never invent/i);
    expect(prompt).toMatch(/gmail\.com/);
  });
  it("trims whitespace and falls back to placeholders when blank", () => {
    const blank = buildResearchPrompt({ niche: "  ", needs: "", exclude: "" });
    expect(blank).toContain("[describe the kind of company]");
    expect(blank).toContain("[what they might need]");
  });
});
