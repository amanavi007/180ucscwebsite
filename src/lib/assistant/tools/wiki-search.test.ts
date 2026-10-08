import { describe, expect, it } from "vitest";
import { chunkBody, searchWiki, terms } from "./wiki-search";

const page = (title: string, body: string, slug = title.toLowerCase().replace(/\s+/g, "-")) => ({
  title, slug, section: "consultant", body, updated_at: "2026-09-01T00:00:00Z",
});

const pages = [
  page("Issue Trees", "# What is it\nA structure that breaks a problem into parts.\n\n# How to build one\nStart with the key question, then split it into mutually exclusive branches.\n\nCheck the branches are collectively exhaustive."),
  page("Slide Formatting", "Use the 180 template. Titles are action titles.\n\n## Fonts\nUse Arial 12pt for body text."),
  page("Client Emails", "Always CC your PM. Reply within 24 hours."),
];

describe("terms", () => {
  it("drops stop words and stems", () => {
    expect(terms("How do I write the issue trees?")).toHaveLength(3);
    expect(terms("writing trees")).toEqual(terms("write tree"));
  });
});

describe("chunkBody", () => {
  it("keeps the heading each piece sits under", () => {
    const c = chunkBody("# A\none\n\n# B\ntwo");
    expect(c).toEqual([{ heading: "A", text: "one" }, { heading: "B", text: "two" }]);
  });
});

describe("searchWiki", () => {
  it("finds the right page for a natural-language question", () => {
    const hits = searchWiki(pages, "how do I build an issue tree?");
    expect(hits[0].title).toBe("Issue Trees");
    expect(hits[0].excerpt).toMatch(/mutually exclusive/);
  });
  it("matches body text when the title does not", () => {
    expect(searchWiki(pages, "what font should slides use")[0].title).toBe("Slide Formatting");
  });
  it("returns nothing for unrelated or empty queries", () => {
    expect(searchWiki(pages, "quarterly tax filing")).toEqual([]);
    expect(searchWiki(pages, "the of and")).toEqual([]);
  });
  it("caps pages and excerpt size", () => {
    const long = page("Long", `# Topic\n${"issue tree ".repeat(400)}`);
    const hits = searchWiki([long, ...pages], "issue tree", { maxPages: 1, excerptChars: 100 });
    expect(hits).toHaveLength(1);
    expect(hits[0].excerpt.length).toBeLessThanOrEqual(100);
  });
});
