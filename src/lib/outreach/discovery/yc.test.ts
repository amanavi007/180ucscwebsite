import { describe, expect, it } from "vitest";
import { nicheForIndustries, rankYcCompanies, ycFacts, type YcCompany } from "./yc";

const base: YcCompany = {
  id: 1,
  name: "AgileMD",
  slug: "agilemd",
  website: "https://agilemd.com",
  one_liner: "Predictive analytics and clinical pathways for hospitals",
  long_description: "AgileMD helps hospitals turn clinical guidelines into pathways inside the EHR. Teams use it to reduce unwarranted variation in care.",
  team_size: 19,
  all_locations: "San Francisco, CA, USA; Remote",
  industries: ["Healthcare", "Healthcare IT"],
  batch: "Summer 2024",
  status: "Active",
  url: "https://www.ycombinator.com/companies/agilemd",
  nonprofit: false,
};
const config = {
  regions: ["San Francisco", "Palo Alto"],
  industries: ["Healthcare", "B2B"],
  maxTeamSize: 50,
};
const co = (over: Partial<YcCompany>): YcCompany => ({ ...base, ...over });

describe("rankYcCompanies", () => {
  it("keeps active, small, in-region, in-industry companies that have a website", () => {
    expect(rankYcCompanies([base], config)).toEqual([base]);
  });
  it("drops inactive, too big, out of region, wrong industry, and site-less companies", () => {
    const rows = [
      co({ id: 2, status: "Acquired" }),
      co({ id: 3, team_size: 120 }),
      co({ id: 4, all_locations: "New York, NY, USA" }),
      co({ id: 5, industries: ["Consumer"] }),
      co({ id: 6, website: "" }),
    ];
    expect(rankYcCompanies(rows, config)).toEqual([]);
  });
  it("accepts a team size given as a string, as the dataset sometimes does, and treats an unknown size as small", () => {
    expect(rankYcCompanies([co({ team_size: "19" as unknown as number })], config)).toHaveLength(1);
    expect(rankYcCompanies([co({ team_size: null })], config)).toHaveLength(1);
  });
  it("puts the newest batches first", () => {
    const rows = [co({ id: 10, batch: "Winter 2021" }), co({ id: 11, batch: "Summer 2026" }), co({ id: 12, batch: "Winter 2026" })];
    expect(rankYcCompanies(rows, config).map((c) => c.id)).toEqual([11, 12, 10]);
  });
  it("alternates healthcare companies with the rest, so med-tech is not crowded out by newer batches", () => {
    const rows = [
      co({ id: 20, batch: "Winter 2027", industries: ["B2B"] }),
      co({ id: 21, batch: "Fall 2026", industries: ["B2B"] }),
      co({ id: 22, batch: "Summer 2026", industries: ["B2B"] }),
      co({ id: 23, batch: "Winter 2024", industries: ["Healthcare"] }),
      co({ id: 24, batch: "Winter 2023", industries: ["Healthcare"] }),
    ];
    expect(rankYcCompanies(rows, config).map((c) => c.id)).toEqual([23, 20, 24, 21, 22]);
  });
  it("matches regions and industries case-insensitively", () => {
    expect(rankYcCompanies([co({ all_locations: "palo alto, ca" })], config)).toHaveLength(1);
  });
});

describe("ycFacts", () => {
  const facts = ycFacts(base);
  it("states each fact once, with the directory page as its source", () => {
    expect(facts.map((f) => f.text)).toContain("AgileMD: Predictive analytics and clinical pathways for hospitals.");
    expect(facts.every((f) => f.sourceUrl.length > 0)).toBe(true);
    expect(facts.find((f) => f.text.includes("team of 19"))?.sourceUrl).toBe(base.url);
  });
  it("includes the batch and the longer description", () => {
    expect(facts.map((f) => f.text).join(" ")).toContain("Y Combinator Summer 2024");
    expect(facts.map((f) => f.text).join(" ")).toContain("clinical guidelines into pathways");
  });
  it("keeps the description short", () => {
    const long = ycFacts(co({ long_description: "Word. ".repeat(300) }));
    expect(Math.max(...long.map((f) => f.text.length))).toBeLessThanOrEqual(420);
  });
  it("skips facts the data does not have", () => {
    const thin = ycFacts(co({ one_liner: "", long_description: "", team_size: null, batch: "" }));
    expect(thin).toEqual([]);
  });
});

describe("nicheForIndustries", () => {
  it("calls healthcare med-tech and everything else tech", () => {
    expect(nicheForIndustries(["Healthcare", "Healthcare IT"])).toBe("med-tech");
    expect(nicheForIndustries(["B2B"])).toBe("tech");
    expect(nicheForIndustries([])).toBe("tech");
  });
});
