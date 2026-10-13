import { describe, expect, it } from "vitest";
import { leadSentence, readingMinutes, splitParagraphs, splitSentences, wordCount } from "./recruit-answer-text";

const sentence = (n: number) => `This is sentence number ${n} and it has about a dozen words in it.`;

describe("splitSentences", () => {
  it("splits at sentence ends", () => {
    expect(splitSentences("I like data. Do you? Yes! Great.")).toEqual(["I like data.", "Do you?", "Yes!", "Great."]);
  });
  it("does not split after abbreviations or initials", () => {
    expect(splitSentences("I met Dr. Lee at the U.S. office. Then I left.")).toEqual(["I met Dr. Lee at the U.S. office.", "Then I left."]);
    expect(splitSentences("We worked with J. Smith on it. It went well.")).toEqual(["We worked with J. Smith on it.", "It went well."]);
  });
  it("keeps decimals and lowercase continuations together", () => {
    expect(splitSentences("We grew 3.5 times in the fall, e.g. in sales.")).toEqual(["We grew 3.5 times in the fall, e.g. in sales."]);
    expect(splitSentences("It cost 3.5 million. then it fell.")).toEqual(["It cost 3.5 million. then it fell."]);
  });
});

describe("splitParagraphs", () => {
  it("keeps the applicant's own paragraphs and joins soft line breaks", () => {
    expect(splitParagraphs("One\nstill one\n\nTwo\r\n\r\nThree")).toEqual(["One still one", "Two", "Three"]);
  });
  it("leaves a short block alone", () => {
    const text = [sentence(1), sentence(2), sentence(3)].join(" ");
    expect(splitParagraphs(text)).toEqual([text]);
  });
  it("breaks a long block at sentence ends without changing the words", () => {
    const text = Array.from({ length: 12 }, (_, i) => sentence(i + 1)).join(" ");
    const out = splitParagraphs(text);
    expect(out.length).toBeGreaterThan(1);
    expect(out.join(" ")).toBe(text);
    for (const p of out) expect(p.endsWith(".")).toBe(true);
  });
  it("does not leave a tiny last paragraph", () => {
    const text = [...Array.from({ length: 5 }, (_, i) => sentence(i + 1)), "Thanks."].join(" ");
    const out = splitParagraphs(text);
    expect(out[out.length - 1]).not.toBe("Thanks.");
  });
});

describe("leadSentence", () => {
  it("separates the opening sentence", () => {
    expect(leadSentence("First thing. Second thing. Third.")).toEqual({ lead: "First thing.", rest: "Second thing. Third." });
  });
});

describe("counts", () => {
  it("counts words and reading time", () => {
    expect(wordCount(null)).toBe(0);
    expect(wordCount(" a  b\nc ")).toBe(3);
    expect(readingMinutes(10)).toBe(1);
    expect(readingMinutes(450)).toBe(2);
  });
});
