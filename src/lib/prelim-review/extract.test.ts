import { describe, expect, it } from "vitest";
import { docFacts, extractUrls, isEffectivelyEmpty, slideFacts } from "./extract";

describe("extractUrls", () => {
  it("finds urls and strips trailing punctuation", () => {
    expect(extractUrls("See https://a.com/x, and (http://b.org/y).")).toEqual(["https://a.com/x", "http://b.org/y"]);
  });
});

describe("docFacts", () => {
  const text = `Market overview\n\nThe market grew 12% (Smith, 2023). More at https://example.com/report.\n\nThis claim has nothing.\n\nReferences\nSmith, J. (2023). Report.`;
  it("counts words, urls, citations and detects a references heading", () => {
    const f = docFacts(text);
    expect(f.urls).toEqual(["https://example.com/report"]);
    expect(f.citationCount).toBeGreaterThanOrEqual(1);
    expect(f.hasReferencesHeading).toBe(true);
    expect(f.wordCount).toBeGreaterThan(10);
  });
  it("reports no references heading when absent", () => {
    expect(docFacts("Just prose with no sources at all.").hasReferencesHeading).toBe(false);
  });
});

describe("slideFacts", () => {
  it("flags slides with no source line (1-based; pass 1 does not exempt title slides, the model does)", () => {
    const f = slideFacts(["Title slide", "Growth is 12%\nSource: Smith 2023", "Churn is high", "Fact (Lee, 2022)"]);
    expect(f.slideCount).toBe(4);
    expect(f.slides[1].hasSource).toBe(true);
    expect(f.slides[3].hasSource).toBe(true);
    expect(f.slidesMissingSource).toEqual([1, 3]);
  });
});

describe("isEffectivelyEmpty", () => {
  it("treats whitespace and tiny text as empty", () => {
    expect(isEffectivelyEmpty("  \n ")).toBe(true);
    expect(isEffectivelyEmpty("Hello")).toBe(true);
    expect(isEffectivelyEmpty("word ".repeat(30))).toBe(false);
  });
});
