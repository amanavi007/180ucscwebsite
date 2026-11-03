import { describe, expect, it, vi } from "vitest";
import { evaluateCandidate, runDiscovery, type CandidateRecord, type DiscoveryDeps } from "./runner";
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
  const added: { company: string; email: string; facts: { text: string; sourceUrl: string }[]; niche: string }[] = [];
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
    fetchPage,
    recordCandidate: async (r) => void records.push(r),
    addProspect: async (p) => {
      added.push({ company: p.company, email: p.email, facts: p.facts, niche: p.niche });
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
