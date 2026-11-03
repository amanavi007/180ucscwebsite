import { describe, expect, it } from "vitest";
import { MAX_LIST_COMPANIES, parseCompanyList } from "./list";

describe("parseCompanyList: CSV with a header", () => {
  const csv = [
    "Company,Website,What they do,Niche,Source URLs",
    'Acme Health,https://www.acmehealth.com/about,"Remote monitoring, for rural clinics",med-tech,https://news.example.com/acme; https://acmehealth.com',
    "Beta Labs,betalabs.io,,tech,",
  ].join("\n");
  it("reads the columns it knows and ignores the rest", () => {
    const { leads, errors } = parseCompanyList(csv);
    expect(errors).toEqual([]);
    expect(leads).toEqual([
      { name: "Acme Health", website: "https://www.acmehealth.com", summary: "Remote monitoring, for rural clinics", niche: "med-tech", sources: ["https://news.example.com/acme", "https://acmehealth.com"] },
      { name: "Beta Labs", website: "https://betalabs.io", summary: null, niche: "tech", sources: [] },
    ]);
  });
  it("accepts the research CSV with extra columns, such as contact email, and never reads them", () => {
    const { leads } = parseCompanyList("Company,Website,Contact email\nAcme,acme.com,ceo@acme.com");
    expect(leads).toHaveLength(1);
    expect(JSON.stringify(leads)).not.toContain("ceo@acme.com");
  });
  it("turns an unknown niche into none", () => {
    expect(parseCompanyList("Company,Website,Niche\nAcme,acme.com,crypto").leads[0].niche).toBeNull();
  });
  it("reports rows with no usable website, and keeps going", () => {
    const { leads, errors } = parseCompanyList("Company,Website\nAcme,acme.com\nNoSite,\nBad,not a url");
    expect(leads.map((l) => l.name)).toEqual(["Acme"]);
    expect(errors.map((e) => e.line)).toEqual([3, 4]);
  });
});

describe("parseCompanyList: plain lines", () => {
  it("reads 'Company, website' lines, tabs and dashes", () => {
    const { leads } = parseCompanyList("Acme Health, acmehealth.com\nBeta Labs\thttps://betalabs.io/\nGamma Co - https://gamma.co/team");
    expect(leads.map((l) => [l.name, l.website])).toEqual([
      ["Acme Health", "https://acmehealth.com"],
      ["Beta Labs", "https://betalabs.io"],
      ["Gamma Co", "https://gamma.co"],
    ]);
  });
  it("accepts a bare URL and names the company from its domain", () => {
    const { leads } = parseCompanyList("https://www.sunflowerclinic.com\nacme-health.com");
    expect(leads.map((l) => l.name)).toEqual(["Sunflowerclinic", "Acme Health"]);
  });
  it("skips blank lines and removes duplicates by domain", () => {
    const { leads } = parseCompanyList("\nAcme, acme.com\n\nAcme again, https://www.acme.com/x\n");
    expect(leads).toHaveLength(1);
  });
  it("reports a line with no website", () => {
    const { leads, errors } = parseCompanyList("Just a name");
    expect(leads).toEqual([]);
    expect(errors).toEqual([{ line: 1, message: "No website found on this line." }]);
  });
});

describe("parseCompanyList: limits", () => {
  it("refuses an empty paste", () => {
    expect(parseCompanyList("   ").errors[0].message).toMatch(/empty/i);
  });
  it("keeps at most the allowed number and says it stopped", () => {
    const text = Array.from({ length: MAX_LIST_COMPANIES + 5 }, (_, i) => `Co ${i}, co${i}.com`).join("\n");
    const { leads, errors } = parseCompanyList(text);
    expect(leads).toHaveLength(MAX_LIST_COMPANIES);
    expect(errors.at(-1)?.message).toMatch(/first 150/);
  });
  it("only accepts http(s) websites", () => {
    expect(parseCompanyList("Evil, javascript:alert(1)").leads).toEqual([]);
    expect(parseCompanyList("Evil, ftp://x.com").leads).toEqual([]);
  });
});
