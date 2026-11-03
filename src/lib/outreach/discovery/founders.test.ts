import { describe, expect, it } from "vitest";
import { matchFounderToEmail, parseYcFounders, type Founder } from "./founders";

const page = (founders: unknown[]) => `<div id="app" data-page="${JSON.stringify({ props: { company: { founders } } }).replace(/"/g, "&quot;")}"></div>`;

describe("parseYcFounders", () => {
  it("reads founders with their titles and LinkedIn from a directory page", () => {
    const html = page([
      { full_name: "Jaber Jaber", title: "Founder", linkedin_url: "https://www.linkedin.com/in/jaber-jaber-b65246234" },
      { full_name: "Osama Jaber", title: "Founder/CMO", linkedin_url: "" },
    ]);
    expect(parseYcFounders(html)).toEqual([
      { name: "Jaber Jaber", title: "Founder", linkedinUrl: "https://www.linkedin.com/in/jaber-jaber-b65246234" },
      { name: "Osama Jaber", title: "Founder/CMO", linkedinUrl: null },
    ]);
  });
  it("only keeps http(s) LinkedIn links", () => {
    expect(parseYcFounders(page([{ full_name: "A B", title: "CEO", linkedin_url: "javascript:alert(1)" }]))[0].linkedinUrl).toBeNull();
  });
  it("skips entries with no name, and copes with a page that has no data", () => {
    expect(parseYcFounders(page([{ title: "CEO" }, { full_name: "  " }]))).toEqual([]);
    expect(parseYcFounders("<p>nothing</p>")).toEqual([]);
    expect(parseYcFounders('<div data-page="not json"></div>')).toEqual([]);
  });
});

describe("matchFounderToEmail", () => {
  const founders: Founder[] = [
    { name: "Jaber Jaber", title: "Founder", linkedinUrl: null },
    { name: "Osama Al-Rashid", title: "CTO", linkedinUrl: null },
    { name: "María García", title: "CEO", linkedinUrl: null },
  ];
  it("matches the first name, first.last, firstlast and first initial plus last name", () => {
    expect(matchFounderToEmail("osama@x.com", founders)?.name).toBe("Osama Al-Rashid");
    expect(matchFounderToEmail("osama.alrashid@x.com", founders)?.name).toBe("Osama Al-Rashid");
    expect(matchFounderToEmail("osama_al-rashid@x.com", founders)?.name).toBe("Osama Al-Rashid");
    expect(matchFounderToEmail("oalrashid@x.com", founders)?.name).toBe("Osama Al-Rashid");
    expect(matchFounderToEmail("osamaa@x.com", founders)?.name).toBe("Osama Al-Rashid");
  });
  it("ignores accents and case", () => {
    expect(matchFounderToEmail("Maria@x.com", founders)?.name).toBe("María García");
    expect(matchFounderToEmail("mgarcia@x.com", founders)?.name).toBe("María García");
  });
  it("does not match generic inboxes or strangers", () => {
    expect(matchFounderToEmail("hello@x.com", founders)).toBeNull();
    expect(matchFounderToEmail("founders@x.com", founders)).toBeNull();
    expect(matchFounderToEmail("sam@x.com", founders)).toBeNull();
  });
  it("does not guess when two founders share the first name", () => {
    const twins: Founder[] = [
      { name: "Alex Kim", title: "CEO", linkedinUrl: null },
      { name: "Alex Ruiz", title: "CTO", linkedinUrl: null },
    ];
    expect(matchFounderToEmail("alex@x.com", twins)).toBeNull();
    expect(matchFounderToEmail("alex.kim@x.com", twins)?.name).toBe("Alex Kim");
  });
});
