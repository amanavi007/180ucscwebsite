import { describe, expect, it, vi } from "vitest";
import { backfillPool, evaluateCandidate, evaluateListLead, prospectFromYc, runDiscovery, stageLeads, type CandidateRecord, type DiscoveryDeps } from "./runner";
import type { Founder } from "./founders";
import type { YcCompany } from "./yc";

const company = (over: Partial<YcCompany> = {}): YcCompany => ({
  id: 1,
  name: "Acme Health",
  slug: "acme-health",
  website: "https://acmehealth.com",
  one_liner: "Remote monitoring for rural clinics",
  long_description: "Acme Health builds remote patient monitoring so rural clinics can follow patients at home.",
  team_size: 12,
  all_locations: "San Francisco, CA, USA",
  industries: ["Healthcare"],
  batch: "Summer 2025",
  status: "Active",
  url: "https://www.ycombinator.com/companies/acme-health",
  ...over,
});

const filter = { regions: ["San Francisco"], industries: ["Healthcare"], maxTeamSize: 50 };

function makeDeps(over: Partial<DiscoveryDeps> = {}) {
  const records: CandidateRecord[] = [];
  const added: { company: string; email: string; facts: { text: string; sourceUrl: string }[]; niche: string | null; contactName?: string | null }[] = [];
  const pages: Record<string, string> = {
    "https://acmehealth.com/": '<meta name="description" content="Remote monitoring built for rural clinics and care teams."><p>Welcome</p>',
    "https://acmehealth.com/contact": "<p>Email us: hello@acmehealth.com</p>",
  };
  const fetchPage = vi.fn(async (url: string) => (url in pages ? pages[url] : null));
  const deps: DiscoveryDeps = {
    enabled: true,
    perDay: 10,
    maxAttempts: 50,
    budgetMs: 240_000,
    backlogLimit: 100,
    filter,
    now: () => 0,
    loadDataset: async () => [company()],
    seenDomains: async () => new Set(),
    addedToday: async () => 0,
    backlog: async () => 0,
    findDuplicate: async () => null,
    emailTaken: async () => null,
    fetchRobots: async () => "",
    fetchFounders: async () => [],
    readyPool: async () => [],
    fetchPage,
    recordCandidate: async (r) => void records.push(r),
    addProspect: async (p) => {
      added.push({ company: p.company, email: p.email, facts: p.facts, niche: p.niche, contactName: p.contactName });
      return "prospect-1";
    },
    ...over,
  };
  return { deps, records, added, fetchPage };
}

describe("evaluateCandidate", () => {
  it("adds a prospect with the published email and sourced facts", async () => {
    const { deps, added } = makeDeps();
    const result = await evaluateCandidate(company(), deps);
    expect(result.outcome).toBe("added");
    expect(added).toHaveLength(1);
    expect(added[0].email).toBe("hello@acmehealth.com");
    expect(added[0].niche).toBe("med-tech");
    expect(added[0].facts.every((f) => f.sourceUrl.startsWith("http"))).toBe(true);
    expect(added[0].facts.some((f) => f.sourceUrl === "https://acmehealth.com/" && f.text.includes("rural clinics and care teams"))).toBe(true);
    expect(result.email).toBe("hello@acmehealth.com");
    expect(result.emailSourceUrl).toBe("https://acmehealth.com/contact");
  });

  it("stops fetching pages once it has an email", async () => {
    const { deps, fetchPage } = makeDeps();
    await evaluateCandidate(company(), deps);
    const urls = fetchPage.mock.calls.map((c) => c[0]);
    expect(urls).toEqual(["https://acmehealth.com/", "https://acmehealth.com/contact"]);
  });

  it("skips a company that is already a prospect, a client or suppressed, and says why", async () => {
    const { deps, added } = makeDeps({ findDuplicate: async () => "Already a prospect." });
    const result = await evaluateCandidate(company(), deps);
    expect(result).toMatchObject({ outcome: "duplicate", reason: "Already a prospect." });
    expect(added).toHaveLength(0);
  });

  it("skips when the chosen email is already taken", async () => {
    const { deps } = makeDeps({ emailTaken: async () => "That address is on the do-not-contact list." });
    expect(await evaluateCandidate(company(), deps)).toMatchObject({ outcome: "duplicate", reason: "That address is on the do-not-contact list." });
  });

  it("reports no_email when the site publishes none, and lists role inboxes it refused", async () => {
    const none = makeDeps({ fetchPage: async (u) => (u === "https://acmehealth.com/" ? "<p>no email</p>" : null) });
    expect((await evaluateCandidate(company(), none.deps)).outcome).toBe("no_email");
    const roles = makeDeps({ fetchPage: async (u) => (u === "https://acmehealth.com/" ? "careers@acmehealth.com security@acmehealth.com" : null) });
    const r = await evaluateCandidate(company(), roles.deps);
    expect(r.outcome).toBe("no_email");
    expect(r.reason).toMatch(/careers@acmehealth.com/);
  });

  it("reports unreachable when no page loads", async () => {
    const { deps } = makeDeps({ fetchPage: async () => null });
    expect((await evaluateCandidate(company(), deps)).outcome).toBe("unreachable");
  });

  it("does not fetch pages that robots.txt disallows", async () => {
    const { deps, fetchPage } = makeDeps({ fetchRobots: async () => "User-agent: *\nDisallow: /contact" });
    const result = await evaluateCandidate(company(), deps);
    expect(fetchPage.mock.calls.map((c) => c[0])).not.toContain("https://acmehealth.com/contact");
    expect(result.outcome).toBe("no_email");
  });

  it("reports unreachable when robots.txt blocks everything", async () => {
    const { deps, fetchPage } = makeDeps({ fetchRobots: async () => "User-agent: *\nDisallow: /" });
    const result = await evaluateCandidate(company(), deps);
    expect(fetchPage).not.toHaveBeenCalled();
    expect(result).toMatchObject({ outcome: "unreachable", reason: expect.stringMatching(/robots/i) });
  });

  it("reports no_facts when there is nothing true to say about the company", async () => {
    const { deps } = makeDeps({
      fetchPage: async (u) => (u === "https://acmehealth.com/" ? "hello@acmehealth.com" : null),
    });
    const thin = company({ one_liner: "", long_description: "", team_size: null, batch: "" });
    expect((await evaluateCandidate(thin, deps)).outcome).toBe("no_facts");
  });

  it("turns a crash on one company into an error outcome instead of throwing", async () => {
    const { deps } = makeDeps({
      fetchPage: async () => {
        throw new Error("boom");
      },
    });
    expect(await evaluateCandidate(company(), deps)).toMatchObject({ outcome: "error", reason: "boom" });
  });

  it("skips companies whose website is a platform page, not their own domain", async () => {
    const { deps } = makeDeps();
    const result = await evaluateCandidate(company({ website: "https://www.linkedin.com/company/acme" }), deps);
    expect(result.outcome).toBe("unreachable");
  });
});

describe("runDiscovery", () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => company({ id: i + 1, slug: `co-${i}`, name: `Co ${i}`, website: `https://co${i}.com`, batch: "Summer 2025" }));
  const sites = () => async (url: string) => {
    const m = /^https:\/\/co(\d+)\.com\/$/.exec(url);
    return m ? `<p>hello@co${m[1]}.com</p>` : null;
  };

  it("does nothing when discovery is switched off", async () => {
    const { deps, records } = makeDeps({ enabled: false });
    expect(await runDiscovery(deps)).toMatchObject({ skipped: "disabled", added: 0 });
    expect(records).toHaveLength(0);
  });

  it("stops when it has added the daily target, counting what was already added today", async () => {
    const { deps, added } = makeDeps({ perDay: 4, addedToday: async () => 1, loadDataset: async () => many(20), fetchPage: sites() });
    const result = await runDiscovery(deps);
    expect(result.added).toBe(3);
    expect(added).toHaveLength(3);
  });

  it("does nothing once the daily target is already met", async () => {
    const { deps } = makeDeps({ perDay: 5, addedToday: async () => 5 });
    expect(await runDiscovery(deps)).toMatchObject({ skipped: "target_met", added: 0 });
  });

  it("pauses while the unsent backlog is large, so discovery never outruns sending", async () => {
    const { deps } = makeDeps({ backlog: async () => 101, backlogLimit: 100 });
    expect(await runDiscovery(deps)).toMatchObject({ skipped: "backlog_full", added: 0 });
  });

  it("never re-evaluates a domain it has already looked at", async () => {
    const { deps, records } = makeDeps({ loadDataset: async () => many(3), fetchPage: sites(), seenDomains: async () => new Set(["co0.com", "co1.com"]) });
    const result = await runDiscovery(deps);
    expect(records.map((r) => r.domain)).toEqual(["co2.com"]);
    expect(result.evaluated).toBe(1);
  });

  it("filters the dataset by region, industry and size before looking at any site", async () => {
    const { deps, records } = makeDeps({
      loadDataset: async () => [company({ slug: "a", website: "https://a.com", all_locations: "Austin, TX" }), company({ slug: "b", website: "https://b.com", team_size: 500 })],
    });
    await runDiscovery(deps);
    expect(records).toHaveLength(0);
  });

  it("caps how many companies it will look at in one run", async () => {
    const { deps, records } = makeDeps({ maxAttempts: 5, perDay: 100, loadDataset: async () => many(30), fetchPage: async () => null });
    await runDiscovery(deps);
    expect(records).toHaveLength(5);
  });

  it("stops when the time budget runs out", async () => {
    let t = 0;
    const { deps, records } = makeDeps({
      budgetMs: 1000,
      perDay: 100,
      now: () => t,
      loadDataset: async () => many(30),
      fetchPage: async () => {
        t += 400;
        return null;
      },
    });
    await runDiscovery(deps);
    expect(records.length).toBeGreaterThan(0);
    expect(records.length).toBeLessThan(30);
  });

  it("records every outcome, so the portal can show what was skipped and why", async () => {
    const { deps, records } = makeDeps({ loadDataset: async () => many(2), fetchPage: async (u) => (u === "https://co0.com/" ? "hello@co0.com" : null) });
    await runDiscovery(deps);
    expect(records.map((r) => r.outcome).sort()).toEqual(["added", "unreachable"]);
    expect(records.find((r) => r.outcome === "added")).toMatchObject({ source: "yc", company: "Co 0", domain: "co0.com", prospectId: "prospect-1", email: "hello@co0.com" });
  });
});

describe("prospectFromYc", () => {
  it("builds a prospect from the directory entry with every fact sourced", () => {
    const p = prospectFromYc(company(), "jo@acmehealth.com");
    expect(p).toMatchObject({ company: "Acme Health", website: "https://acmehealth.com", niche: "med-tech", email: "jo@acmehealth.com", summary: "Remote monitoring for rural clinics", sizeStage: "12 people, YC Summer 2025" });
    expect(p.facts.length).toBeGreaterThan(2);
    expect(p.facts.every((f) => f.sourceUrl.startsWith("http"))).toBe(true);
  });
  it("adds extra sourced facts after the directory ones", () => {
    const p = prospectFromYc(company(), "jo@acmehealth.com", [{ text: "They describe themselves well.", sourceUrl: "https://acmehealth.com/" }]);
    expect(p.facts.at(-1)).toEqual({ text: "They describe themselves well.", sourceUrl: "https://acmehealth.com/" });
  });
  it("has no facts when the directory has nothing to say", () => {
    expect(prospectFromYc(company({ one_liner: "", long_description: "", team_size: null, batch: "" }), "a@b.co").facts).toEqual([]);
  });
});

const founders: Founder[] = [
  { name: "Jo Lee", title: "CEO", linkedinUrl: "https://www.linkedin.com/in/jolee" },
  { name: "Sam Park", title: "CTO", linkedinUrl: null },
];

describe("founders", () => {
  it("keeps the directory's founders on the record, even when no email was found", async () => {
    const { deps } = makeDeps({ fetchFounders: async () => founders, fetchPage: async () => "<p>no email</p>" });
    const result = await evaluateCandidate(company(), deps);
    expect(result.outcome).toBe("no_email");
    expect(result.founders).toEqual(founders);
  });
  it("addresses the email to a founder when the address plainly belongs to them", async () => {
    const { deps, added } = makeDeps({ fetchFounders: async () => founders, fetchPage: async (u) => (u === "https://acmehealth.com/" ? "jo@acmehealth.com" : null) });
    await evaluateCandidate(company(), deps);
    expect(added[0].contactName).toBe("Jo Lee");
  });
  it("leaves the contact blank for a generic inbox", async () => {
    const { deps, added } = makeDeps({ fetchFounders: async () => founders });
    await evaluateCandidate(company(), deps);
    expect(added[0].contactName).toBeNull();
  });
  it("still works when the founders cannot be read", async () => {
    const { deps } = makeDeps({
      fetchFounders: async () => {
        throw new Error("down");
      },
    });
    const result = await evaluateCandidate(company(), deps);
    expect(result.outcome).toBe("added");
    expect(result.founders).toEqual([]);
  });
});

describe("stage mode", () => {
  it("stores a ready result with everything needed to add it later, and adds nothing", async () => {
    const { deps, added } = makeDeps();
    const result = await evaluateCandidate(company(), deps, "stage");
    expect(result.outcome).toBe("ready");
    expect(added).toHaveLength(0);
    expect(result.prospectId).toBeNull();
    expect(result.payload?.prospect).toMatchObject({ company: "Acme Health", email: "hello@acmehealth.com", niche: "med-tech" });
    expect(result.payload?.meta).toMatchObject({ teamSize: 12 });
    expect(result.payload?.priority).toBeGreaterThan(0);
  });
});

describe("evaluateListLead", () => {
  const lead = { name: "Beta Labs", website: "https://betalabs.io", summary: "Builds scheduling for clinics.", niche: "tech" as const, sources: ["https://news.example.com/beta"] };
  const betaPages: Record<string, string> = {
    "https://betalabs.io/": '<meta name="description" content="Scheduling software for busy clinics and care teams.">',
    "https://betalabs.io/contact": "hello@betalabs.io",
  };
  const betaDeps = (over: Partial<DiscoveryDeps> = {}) => makeDeps({ fetchPage: async (u) => betaPages[u] ?? null, ...over });

  it("stages a pasted company with the email its own site publishes and sourced facts", async () => {
    const { deps } = betaDeps();
    const result = await evaluateListLead(lead, deps, "stage");
    expect(result).toMatchObject({ source: "list", outcome: "ready", company: "Beta Labs", domain: "betalabs.io", email: "hello@betalabs.io" });
    const facts = result.payload!.prospect.facts;
    expect(facts).toContainEqual({ text: "Builds scheduling for clinics.", sourceUrl: "https://news.example.com/beta" });
    expect(facts.some((f) => f.sourceUrl === "https://betalabs.io/" && f.text.includes("busy clinics"))).toBe(true);
    expect(result.payload!.meta).toBeNull();
  });
  it("credits the website as the source when no source URL was given", async () => {
    const { deps } = betaDeps();
    const result = await evaluateListLead({ ...lead, sources: [] }, deps, "stage");
    expect(result.payload!.prospect.facts[0].sourceUrl).toBe("https://betalabs.io");
  });
  it("reports no_facts when the company has no description at all", async () => {
    const { deps } = makeDeps({ fetchPage: async (u) => (u === "https://betalabs.io/" ? "hello@betalabs.io" : null) });
    expect((await evaluateListLead({ ...lead, summary: null }, deps, "stage")).outcome).toBe("no_facts");
  });
  it("skips companies that are already known, and ones with no published email", async () => {
    const dup = makeDeps({ findDuplicate: async () => "Already a prospect." });
    expect((await evaluateListLead(lead, dup.deps, "stage")).outcome).toBe("duplicate");
    const none = makeDeps({ fetchPage: async () => "<p>nothing</p>" });
    expect((await evaluateListLead(lead, none.deps, "stage")).outcome).toBe("no_email");
  });
  it("adds straight away in add mode", async () => {
    const { deps, added } = betaDeps();
    expect((await evaluateListLead(lead, deps, "add")).outcome).toBe("added");
    expect(added).toHaveLength(1);
  });
});

describe("stageLeads", () => {
  const leads = Array.from({ length: 6 }, (_, i) => ({ name: `Co ${i}`, website: `https://co${i}.com`, summary: "Does a real thing for people.", niche: null, sources: [] }));
  const site = async (url: string) => {
    const m = /^https:\/\/co(\d+)\.com\/$/.exec(url);
    return m ? `hello@co${m[1]}.com` : null;
  };

  it("stages every new company and reports what happened to each", async () => {
    const { deps, records } = makeDeps({ fetchPage: site });
    const result = await stageLeads(leads, deps, { concurrency: 3, budgetMs: 60_000 });
    expect(result).toMatchObject({ staged: 6, skippedKnown: 0, notReached: 0 });
    expect(records.filter((r) => r.outcome === "ready")).toHaveLength(6);
  });
  it("skips companies discovery has already looked at", async () => {
    const { deps, records } = makeDeps({ fetchPage: site, seenDomains: async () => new Set(["co0.com", "co1.com"]) });
    const result = await stageLeads(leads, deps, { concurrency: 3, budgetMs: 60_000 });
    expect(result.skippedKnown).toBe(2);
    expect(records).toHaveLength(4);
  });
  it("stops starting new companies when time is up and says how many were left", async () => {
    let t = 0;
    const { deps } = makeDeps({
      now: () => t,
      fetchPage: async (u) => {
        t += 600;
        return site(u);
      },
    });
    const result = await stageLeads(leads, deps, { concurrency: 1, budgetMs: 1000 });
    expect(result.notReached).toBeGreaterThan(0);
    expect(result.staged + result.notReached).toBe(6);
  });
  it("counts companies that could not be staged by their outcome", async () => {
    const { deps } = makeDeps({ fetchPage: async () => null });
    const result = await stageLeads(leads, deps, { concurrency: 3, budgetMs: 60_000 });
    expect(result.staged).toBe(0);
    expect(result.byOutcome.unreachable).toBe(6);
  });
});

describe("backfillPool", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => company({ id: i + 1, slug: `co-${i}`, name: `Co ${i}`, website: `https://co${i}.com`, team_size: 10 }));
  const site = async (url: string) => {
    const m = /^https:\/\/co(\d+)\.com\/$/.exec(url);
    return m ? `hello@co${m[1]}.com` : null;
  };

  it("looks at every eligible company not yet seen, staging each as ready", async () => {
    const { deps, records, added } = makeDeps({ loadDataset: async () => many(8), fetchPage: site, seenDomains: async () => new Set(["co0.com"]) });
    const result = await backfillPool(deps, { concurrency: 4, limit: 100, budgetMs: 60_000 });
    expect(result.evaluated).toBe(7);
    expect(records.every((r) => r.outcome === "ready")).toBe(true);
    expect(added).toHaveLength(0);
  });
  it("never evaluates the same company twice with several workers", async () => {
    const { deps, records } = makeDeps({ loadDataset: async () => many(20), fetchPage: site });
    await backfillPool(deps, { concurrency: 6, limit: 100, budgetMs: 60_000 });
    const domains = records.map((r) => r.domain);
    expect(new Set(domains).size).toBe(domains.length);
  });
  it("honors a limit", async () => {
    const { deps, records } = makeDeps({ loadDataset: async () => many(20), fetchPage: site });
    await backfillPool(deps, { concurrency: 4, limit: 5, budgetMs: 60_000 });
    expect(records).toHaveLength(5);
  });
});

describe("runDiscovery draws from the pool first", () => {
  const entry = (n: number, over: Partial<CandidateRecord> = {}): CandidateRecord => ({
    source: "yc",
    sourceRef: `p${n}`,
    company: `Pool ${n}`,
    website: `https://pool${n}.com`,
    domain: `pool${n}.com`,
    outcome: "ready",
    reason: null,
    prospectId: null,
    email: `hello@pool${n}.com`,
    emailSourceUrl: `https://pool${n}.com/`,
    founders: [],
    payload: {
      prospect: { company: `Pool ${n}`, website: `https://pool${n}.com`, niche: "tech", sizeStage: null, summary: null, facts: [{ text: "A fact.", sourceUrl: "https://x.com" }], email: `hello@pool${n}.com`, contactName: null, contactRole: null },
      meta: { industries: ["Healthcare"], locations: "San Francisco, CA", teamSize: 10 },
      priority: 1_000_000 + n,
    },
    ...over,
  });

  it("adds ready companies without crawling any website", async () => {
    const { deps, added, fetchPage, records } = makeDeps({ perDay: 3, readyPool: async () => [entry(1), entry(2), entry(3), entry(4)] });
    const result = await runDiscovery(deps);
    expect(result).toMatchObject({ added: 3, fromPool: 3 });
    expect(added).toHaveLength(3);
    expect(fetchPage).not.toHaveBeenCalled();
    expect(records.every((r) => r.outcome === "added")).toBe(true);
  });
  it("takes pasted companies before directory ones, then the highest priority", async () => {
    const pasted = entry(9, { source: "list", payload: { ...entry(9).payload!, meta: null, priority: 10_000_000 } });
    const { deps, added } = makeDeps({ perDay: 2, readyPool: async () => [entry(1), pasted, entry(3)] });
    await runDiscovery(deps);
    expect(added.map((a) => a.company)).toEqual(["Pool 9", "Pool 3"]);
  });
  it("applies today's settings to the stored companies", async () => {
    const outOfRegion = entry(1, { payload: { ...entry(1).payload!, meta: { industries: ["Healthcare"], locations: "Austin, TX", teamSize: 10 } } });
    const { deps, added } = makeDeps({ perDay: 5, loadDataset: async () => [], readyPool: async () => [outOfRegion, entry(2)] });
    await runDiscovery(deps);
    expect(added.map((a) => a.company)).toEqual(["Pool 2"]);
  });
  it("checks again that a stored company is still new, and records why one is skipped", async () => {
    const { deps, added, records } = makeDeps({
      perDay: 2,
      loadDataset: async () => [],
      readyPool: async () => [entry(1), entry(2)],
      findDuplicate: async ({ domain }) => (domain === "pool1.com" ? "Already a prospect." : null),
    });
    await runDiscovery(deps);
    expect(added.map((a) => a.company)).toEqual(["Pool 2"]);
    expect(records.find((r) => r.domain === "pool1.com")).toMatchObject({ outcome: "duplicate", reason: "Already a prospect." });
  });
  it("crawls live only for what the pool could not cover", async () => {
    const live = Array.from({ length: 4 }, (_, i) => company({ id: 50 + i, slug: `live-${i}`, name: `Live ${i}`, website: `https://live${i}.com` }));
    const { deps, added } = makeDeps({
      perDay: 3,
      readyPool: async () => [entry(1)],
      loadDataset: async () => live,
      fetchPage: async (u) => {
        const m = /^https:\/\/(live\d)\.com\/$/.exec(u);
        return m ? `hello@${m[1]}.com` : null;
      },
    });
    const result = await runDiscovery(deps);
    expect(result).toMatchObject({ added: 3, fromPool: 1 });
    expect(added).toHaveLength(3);
  });
  it("does nothing from the pool once the target is met", async () => {
    const { deps } = makeDeps({ perDay: 3, addedToday: async () => 3, readyPool: async () => [entry(1)] });
    expect(await runDiscovery(deps)).toMatchObject({ skipped: "target_met", added: 0 });
  });
});
