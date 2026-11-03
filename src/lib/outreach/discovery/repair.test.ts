import { describe, expect, it, vi } from "vitest";
import { findNewWebsite, guessHosts, pageMentions, repairOne, runRepair, websiteVariants, type RepairDeps, type RepairItem } from "./repair";
import type { CandidateRecord } from "./runner";
import type { YcCompany } from "./yc";

const yc: YcCompany = {
  id: 1, name: "Acme Health", slug: "acme-health", website: "https://acmehealth.com", one_liner: "Remote monitoring for rural clinics",
  long_description: null, team_size: 12, all_locations: "San Francisco, CA, USA", industries: ["Healthcare"], batch: "Summer 2025", status: "Active",
  url: "https://www.ycombinator.com/companies/acme-health",
};
const dataset = new Map([[yc.slug, yc]]);

const record = (over: Partial<CandidateRecord> = {}): CandidateRecord => ({
  source: "yc", sourceRef: "acme-health", company: "Acme Health", website: "https://acmehealth.com", domain: "acmehealth.com",
  outcome: "unreachable", reason: "Could not load the website.", prospectId: null, email: null, emailSourceUrl: null, founders: [], payload: null, ...over,
});
const item = (over: Partial<CandidateRecord> = {}, attempts = 0): RepairItem => ({ id: "c1", attempts, record: record(over) });

function deps(pages: Record<string, string>, resolving: string[] = []): RepairDeps {
  return {
    enabled: true, perDay: 10, maxAttempts: 50, budgetMs: 240_000, backlogLimit: 100,
    filter: { regions: ["San Francisco"], industries: ["Healthcare"], maxTeamSize: 50 },
    now: () => 0,
    loadDataset: async () => [yc],
    seenDomains: async () => new Set(),
    readyPool: async () => [],
    addedToday: async () => 0,
    backlog: async () => 0,
    findDuplicate: async () => null,
    emailTaken: async () => null,
    fetchRobots: async () => "",
    fetchPage: vi.fn(async (url: string) => pages[url] ?? null),
    fetchFounders: async () => [],
    recordCandidate: async () => {},
    addProspect: async () => "p1",
    repairQueue: async () => [],
    saveRepair: vi.fn(async () => {}),
    resolves: async (host) => resolving.includes(host),
  };
}

describe("helpers", () => {
  it("offers the same site on the other scheme and with or without www", () => {
    expect(websiteVariants("https://www.acme.com")).toEqual(["https://acme.com", "http://acme.com", "http://www.acme.com"]);
  });
  it("guesses names a moved company might use, plain ones first, never the current host", () => {
    const hosts = guessHosts("Acme Health", "acme-health", ["acmehealth.com"]);
    expect(hosts).not.toContain("acmehealth.com");
    expect(hosts).toContain("acmehealth.io");
    expect(hosts).toContain("getacmehealth.com");
    expect(hosts.indexOf("acmehealth.io")).toBeLessThan(hosts.indexOf("getacmehealthapp.com"));
  });
  it("only accepts a page that names the company", () => {
    expect(pageMentions("<title>Acme Health | Remote monitoring</title>", "Acme Health")).toBe(true);
    expect(pageMentions("<h1>This domain is for sale</h1>", "Acme Health")).toBe(false);
  });
  it("finds the new website of a company that moved, and ignores a parked one", async () => {
    const d = deps({ "https://acmehealth.io/": "<title>Acme Health</title>", "https://acmehealth.ai/": "<h1>for sale</h1>" }, ["acmehealth.ai", "acmehealth.io"]);
    expect(await findNewWebsite(record(), d)).toBe("https://acmehealth.io");
  });
});

describe("repairOne: the website would not load", () => {
  it("recovers when the same site loads on another address", async () => {
    const d = deps({ "https://www.acmehealth.com/contact": "<p>hello@acmehealth.com</p>", "https://www.acmehealth.com/": "<meta name=\"description\" content=\"Remote monitoring built for rural clinics.\">" });
    const out = await repairOne(item(), dataset, d);
    expect(out.record).toMatchObject({ outcome: "ready", email: "hello@acmehealth.com" });
  });
  it("tries again tomorrow after the first failure, and says which try it was", async () => {
    const out = await repairOne(item(), dataset, deps({}));
    expect(out.attempts).toBe(1);
    expect(out.record.outcome).toBe("unreachable");
    expect(out.record.reason).toContain("Try 1 of 3");
  });
  it("looks for a new website on the second try and uses it", async () => {
    const d = deps({ "https://acmehealth.io/": "<title>Acme Health</title>", "https://acmehealth.io/contact": "<p>team@acmehealth.io</p>" }, ["acmehealth.io"]);
    const out = await repairOne(item({}, 1), dataset, d);
    expect(out.record).toMatchObject({ outcome: "ready", email: "team@acmehealth.io", domain: "acmehealth.io" });
  });
  it("gives up after the third failed try", async () => {
    const out = await repairOne(item({}, 2), dataset, deps({}));
    expect(out.record.outcome).toBe("failed");
    expect(out.record.reason).toContain("3 tries");
  });
  it("gives up at once on a site that asks bots to stay out", async () => {
    const out = await repairOne(item({ reason: "The site's robots.txt does not allow it." }), dataset, deps({}));
    expect(out.record.outcome).toBe("failed");
  });
  it("gives up when the company has left the directory", async () => {
    const out = await repairOne(item({ sourceRef: "gone" }), dataset, deps({}));
    expect(out.record).toMatchObject({ outcome: "failed", reason: "No longer listed in the directory." });
  });
});

describe("repairOne: no email was published", () => {
  const noEmail = { outcome: "no_email" as const, reason: "No email address published on the company's site." };
  it("finds an email on a page the first look skipped", async () => {
    const d = deps({ "https://acmehealth.com/": "<a href=\"/legal-notice-contact\">Contact us</a>", "https://acmehealth.com/legal-notice-contact": "<p>Write to partnerships@acmehealth.com</p>", "https://acmehealth.com/privacy": "<p>questions to hello@acmehealth.com</p>" });
    const out = await repairOne(item(noEmail), dataset, d);
    expect(out.record).toMatchObject({ outcome: "ready", email: "partnerships@acmehealth.com" });
  });
  it("moves to Gave up, with the reason, when the deeper search finds nothing", async () => {
    const out = await repairOne(item(noEmail), dataset, deps({ "https://acmehealth.com/": "<p>Hi</p>" }));
    expect(out.record.outcome).toBe("failed");
    expect(out.record.reason).toContain("deeper search");
  });
});

describe("runRepair", () => {
  it("saves every company's new state and counts the outcomes", async () => {
    const d = deps({ "https://acmehealth.com/": "<p>Hi</p>" });
    d.repairQueue = async () => [item({ outcome: "no_email" }), { ...item({}, 2), id: "c2" }];
    const result = await runRepair(d, { limit: 10, concurrency: 2, budgetMs: 10_000 });
    expect(result).toMatchObject({ tried: 2, recovered: 0, gaveUp: 2 });
    expect(d.saveRepair).toHaveBeenCalledTimes(2);
  });
  it("does nothing when nothing is due", async () => {
    expect(await runRepair(deps({}), { limit: 10, concurrency: 2, budgetMs: 10_000 })).toMatchObject({ tried: 0 });
  });
});
