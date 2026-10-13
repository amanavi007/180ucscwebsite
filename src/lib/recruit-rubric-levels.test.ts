import { describe, expect, it } from "vitest";
import { parseLevels, readingMinutes, splitParagraphs, wordCount } from "./recruit-rubric-levels";

describe("parseLevels", () => {
  it("reads one score per line", () => {
    const l = parseLevels("1 = Hard to follow\n2 = Thin\n5 = Clear, structured");
    expect([...l.entries()]).toEqual([[1, "Hard to follow"], [2, "Thin"], [5, "Clear, structured"]]);
  });
  it("still reads the older one-line form", () => {
    const l = parseLevels("1 = generic or unclear reason, 5 = specific, genuine motivation");
    expect(l.get(1)).toBe("generic or unclear reason");
    expect(l.get(5)).toBe("specific, genuine motivation");
  });
  it("ignores plain text", () => {
    expect(parseLevels("Look for clear writing").size).toBe(0);
  });
});

describe("answer helpers", () => {
  it("splits on blank lines and joins soft line breaks", () => {
    expect(splitParagraphs("One\nstill one\n\nTwo\r\n\r\nThree")).toEqual(["One still one", "Two", "Three"]);
  });
  it("counts words and reading time", () => {
    expect(wordCount(null)).toBe(0);
    expect(wordCount(" a  b\nc ")).toBe(3);
    expect(readingMinutes(10)).toBe(1);
    expect(readingMinutes(450)).toBe(2);
  });
});
