import { describe, expect, it } from "vitest";
import {
  findDuplicatePairs,
  findMatches,
  MAYBE_MIN_SCORE,
  nameSimilarity,
  normalizeName,
  pairKey,
  type MatchableApplicant,
} from "./recruit-matching";

const person = (id: string, name: string, email: string | null = null, aliases: string[] = []): MatchableApplicant => ({
  id,
  name,
  email,
  aliases,
});

describe("normalizeName", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeName("  Jessica   KIM ")).toBe("jessica kim");
  });
  it("flips Last, First", () => {
    expect(normalizeName("Kim, Jessica")).toBe("jessica kim");
  });
  it("strips pronoun parentheticals", () => {
    expect(normalizeName("Jessica Kim (she/her)")).toBe("jessica kim");
    expect(normalizeName("Kim, Jessica (she/her)")).toBe("jessica kim");
  });
  it("strips a ' - device' Zoom suffix", () => {
    expect(normalizeName("Jessica Kim - iPhone")).toBe("jessica kim");
  });
  it("strips diacritics and apostrophes", () => {
    expect(normalizeName("JOSÉ O'Brien")).toBe("jose obrien");
  });
  it("treats hyphens in names as spaces", () => {
    expect(normalizeName("Mary-Jane Watson")).toBe("mary jane watson");
  });
  it("returns an empty string for junk", () => {
    expect(normalizeName("  ")).toBe("");
  });
});

describe("nameSimilarity", () => {
  it("is 100 for identical normalized names", () => {
    expect(nameSimilarity("jessica kim", "jessica kim")).toBe(100);
  });
  it("matches a nickname plus last initial to the full name", () => {
    expect(nameSimilarity("jess k", "jessica kim")).toBeGreaterThanOrEqual(MAYBE_MIN_SCORE);
  });
  it("matches a reordered name", () => {
    expect(nameSimilarity("kim jessica", "jessica kim")).toBeGreaterThanOrEqual(MAYBE_MIN_SCORE);
  });
  it("matches a one-letter typo in a long name", () => {
    expect(nameSimilarity("priya natarajan", "priya natarajn")).toBeGreaterThanOrEqual(MAYBE_MIN_SCORE);
  });
  it("keeps Jessica Kim and Jessica Kimball apart", () => {
    expect(nameSimilarity("jessica kim", "jessica kimball")).toBeLessThan(MAYBE_MIN_SCORE);
  });
  it("keeps different last names with the same first name apart", () => {
    expect(nameSimilarity("priya natarajan", "priya nair")).toBeLessThan(MAYBE_MIN_SCORE);
  });
  it("does not match a lone first name", () => {
    expect(nameSimilarity("jess", "jessica kim")).toBeLessThan(MAYBE_MIN_SCORE);
  });
  it("is 0 when either side is empty", () => {
    expect(nameSimilarity("", "jessica kim")).toBe(0);
  });
});

describe("findMatches", () => {
  const existing = [
    person("1", "Jessica Kim", "jkim@ucsc.edu"),
    person("2", "Daniel Ortiz", null, ["danny ortiz"]),
    person("3", "Aisha Rahman", "arahman@ucsc.edu"),
  ];

  it("flags an exact email as a hard duplicate regardless of name", () => {
    const [top] = findMatches({ name: "Totally Different", email: "JKim@ucsc.edu " }, existing);
    expect(top).toMatchObject({ applicantId: "1", kind: "duplicate", reason: "email", score: 100 });
  });

  it("flags an exact normalized name as likely", () => {
    const [top] = findMatches({ name: "Kim, Jessica (she/her)" }, existing);
    expect(top).toMatchObject({ applicantId: "1", kind: "likely", reason: "name", score: 100 });
  });

  it("matches through a saved alias", () => {
    const [top] = findMatches({ name: "Danny Ortiz" }, existing);
    expect(top).toMatchObject({ applicantId: "2", kind: "likely", reason: "alias" });
  });

  it("downgrades an identical name with a different email to maybe", () => {
    const [top] = findMatches({ name: "Jessica Kim", email: "other@ucsc.edu" }, existing);
    expect(top.kind).toBe("maybe");
    expect(top.score).toBeLessThan(100);
  });

  it("flags fuzzy matches as maybe", () => {
    const [top] = findMatches({ name: "Jess K." }, existing);
    expect(top).toMatchObject({ applicantId: "1", kind: "maybe", reason: "fuzzy" });
  });

  it("returns nothing for a genuinely new person", () => {
    expect(findMatches({ name: "Marcus Lee" }, existing)).toEqual([]);
  });

  it("returns nothing for a blank name and no email", () => {
    expect(findMatches({ name: "  " }, existing)).toEqual([]);
  });

  it("sorts best match first", () => {
    const list = [person("a", "Jess Kim"), person("b", "Jessica Kim")];
    const result = findMatches({ name: "Jessica Kim" }, list);
    expect(result.map((r) => r.applicantId)).toEqual(["b", "a"]);
  });
});

describe("findDuplicatePairs", () => {
  const list = [
    person("a", "Jessica Kim", "jkim@ucsc.edu"),
    person("b", "Jess K."),
    person("c", "Marcus Lee"),
  ];

  it("finds suspected pairs", () => {
    const pairs = findDuplicatePairs(list, new Set());
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ kind: "maybe" });
    expect([pairs[0].a, pairs[0].b].sort()).toEqual(["a", "b"]);
  });

  it("skips pairs the exec marked as not the same", () => {
    expect(findDuplicatePairs(list, new Set([pairKey("b", "a")]))).toEqual([]);
  });
});

describe("pairKey", () => {
  it("is order-independent", () => {
    expect(pairKey("x", "y")).toBe(pairKey("y", "x"));
  });
});
