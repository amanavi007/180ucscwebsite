import { describe, expect, it } from "vitest";
import { parseProspectCsv } from "./csv";

const HEADER =
  "Company,Website,What they do,Size,Stage,Niche,Contact name,Contact role,Contact email,Why they'd need consulting,Source URLs";

describe("parseProspectCsv", () => {
  it("parses a full row with sources split on semicolons", () => {
    const text = `${HEADER}\nAcme Health,https://acme.com,"Remote patient monitoring, for clinics",12,Seed,med-tech,Jo Lee,CEO,JO@acme.com ,Needs a go-to-market plan,https://acme.com/about; https://news.com/acme`;
    const { rows, errors } = parseProspectCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      company: "Acme Health",
      website: "https://acme.com",
      niche: "med-tech",
      sizeStage: "12, Seed",
      summary: "Remote patient monitoring, for clinics",
      whyFit: "Needs a go-to-market plan",
      contactName: "Jo Lee",
      contactRole: "CEO",
      contactEmail: "jo@acme.com",
    });
    expect(rows[0].facts).toEqual([
      { text: "Remote patient monitoring, for clinics", sourceUrl: "https://acme.com/about" },
      { text: "Needs a go-to-market plan", sourceUrl: "https://acme.com/about" },
    ]);
  });

  it("matches headers regardless of case, spacing and punctuation, and handles BOM and quoted newlines", () => {
    const text = `﻿company , WEBSITE,what they do,size,stage,niche,contact name,contact role,CONTACT EMAIL,why theyd need consulting,source urls\nZed,,"line one\nline two",,,tech,,,a@zed.io,,`;
    const { rows, errors } = parseProspectCsv(text);
    expect(errors).toEqual([]);
    expect(rows[0].summary).toBe("line one\nline two");
    expect(rows[0].contactEmail).toBe("a@zed.io");
    expect(rows[0].website).toBeNull();
    expect(rows[0].facts).toEqual([{ text: "line one\nline two", sourceUrl: "" }]);
  });

  it("reports a missing email or company with the CSV line number and skips the row", () => {
    const text = `${HEADER}\nGood Co,,,,,,,,ok@good.co,,\nNo Email,,,,,,,,,,\n,,,,,,,,x@y.co,,`;
    const { rows, errors } = parseProspectCsv(text);
    expect(rows.map((r) => r.company)).toEqual(["Good Co"]);
    expect(errors).toEqual([
      { line: 3, message: "Missing contact email." },
      { line: 4, message: "Missing company." },
    ]);
  });

  it("errors on every row when a required column is missing from the header", () => {
    const { rows, errors } = parseProspectCsv("Name,Email\nA,a@b.co");
    expect(rows).toEqual([]);
    expect(errors[0].message).toMatch(/Company/);
  });

  it("drops a repeated contact email inside the same file", () => {
    const text = `${HEADER}\nA,,,,,,,,dup@x.co,,\nB,,,,,,,,DUP@x.co,,`;
    const { rows, errors } = parseProspectCsv(text);
    expect(rows).toHaveLength(1);
    expect(errors).toEqual([{ line: 3, message: "Duplicate email in this file." }]);
  });

  it("returns nothing for empty input", () => {
    expect(parseProspectCsv("")).toEqual({ rows: [], errors: [{ line: 1, message: "The file is empty." }] });
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("docs/outreach-research-prompt.md", () => {
  it("asks for exactly the headers the importer accepts", () => {
    const doc = readFileSync(join(process.cwd(), "docs/outreach-research-prompt.md"), "utf8");
    const header = doc.split("\n").find((line) => line.startsWith("Company,Website,"));
    expect(header).toBeTruthy();
    const columns = header!.split(",").length;
    const row = ["Acme", "https://acme.com", "Does things", "10", "Seed", "tech", "Jo", "CEO", "jo@acme.com", "Needs help", "https://acme.com/about"];
    expect(row).toHaveLength(columns);
    const { rows, errors } = parseProspectCsv(`${header}\n${row.join(",")}`);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ company: "Acme", contactEmail: "jo@acme.com", niche: "tech", sizeStage: "10, Seed", summary: "Does things", whyFit: "Needs help" });
    expect(rows[0].facts[0].sourceUrl).toBe("https://acme.com/about");
  });
});
