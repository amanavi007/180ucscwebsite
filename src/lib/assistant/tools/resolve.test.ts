import { describe, expect, it } from "vitest";
import { resolveByName, uniqueBy } from "./resolve";

const people = [{ n: "Sam Lee" }, { n: "Samantha Ortiz" }, { n: "Priya Patel" }, { n: "Sam Wong" }];
const name = (p: { n: string }) => p.n;

describe("resolveByName", () => {
  it("prefers an exact match", () => {
    expect(resolveByName("sam lee", people, name)).toEqual({ kind: "one", item: people[0] });
  });
  it("reports ambiguity instead of guessing", () => {
    const r = resolveByName("Sam", people, name);
    expect(r.kind).toBe("many");
  });
  it("matches a unique first name or last name", () => {
    expect(resolveByName("Priya", people, name)).toEqual({ kind: "one", item: people[2] });
    expect(resolveByName("Ortiz", people, name)).toEqual({ kind: "one", item: people[1] });
  });
  it("returns none for no match or empty input", () => {
    expect(resolveByName("Zed", people, name)).toEqual({ kind: "none" });
    expect(resolveByName("  ", people, name)).toEqual({ kind: "none" });
  });
  it("ignores punctuation and case", () => {
    expect(resolveByName("PRIYA, patel!", people, name).kind).toBe("one");
  });
});

describe("uniqueBy", () => {
  it("keeps the first row per key", () => {
    expect(uniqueBy([{ id: "a", t: 1 }, { id: "a", t: 2 }, { id: "b", t: 3 }], (x) => x.id).map((x) => x.t)).toEqual([1, 3]);
  });
});
