import { describe, expect, it, vi } from "vitest";
import {
  computeQuota,
  exclusionsFrom,
  parseClaimCount,
  sourceProblem,
  submitProspects,
  submitTaskResult,
  type SubmitDeps,
  type SubmitResponse,
  type TaskCandidate,
  type TaskResultDeps,
} from "./agent";
import type { ProspectDraftRow } from "./types";
import type { ExistingProspectData } from "./verify";

const BATCH = "11111111-1111-4111-8111-111111111111";
const TOKEN = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-11-04T12:00:00Z");

const empty = (): ExistingProspectData => ({
  emails: new Set(),
  companyDomains: new Set(),
  clientNames: new Set(),
  suppressedEmails: new Set(),
  suppressedDomains: new Set(),
});

const row = (over: Record<string, unknown> = {}) => ({
  company: "Example Labs",
  website: "https://examplelabs.com",
  segment: "startup",
  niche: "tech",
  sizeStage: "12 people, seed",
  summary: "Builds scheduling software.",
  whyFit: "They are hiring their first product manager.",
  contactName: "Jo Founder",
  contactRole: "Co-founder & CEO",
  contactEmail: "jo@examplelabs.com",
  emailSourceUrl: "https://examplelabs.com/team",
  emailEvidence: "published_on_site",
  facts: [{ text: "Raised a seed round in 2026.", sourceUrl: "https://examplelabs.com/about" }],
  ...over,
});

function submitDeps(over: Partial<SubmitDeps> & { existing?: ExistingProspectData } = {}) {
  const inserted: ProspectDraftRow[][] = [];
  const stored = new Map<string, SubmitResponse | null>();
  const deps: SubmitDeps = {
    mode: "dry_run",
    loadExisting: async () => over.existing ?? empty(),
    quota: async () => ({ remaining: 15, backlogFull: false }),
    checkMx: async () => true,
    insertProspects: async (rows) => {
      inserted.push(rows);
      return rows.map((r, i) => ({ email: r.contactEmail, id: `p${inserted.length}-${i}` }));
    },
    claimBatch: async (id) => {
      if (stored.has(id)) return { claimed: false, stored: stored.get(id)! };
      stored.set(id, null);
      return { claimed: true, runId: `run-${id}` };
    },
    finishBatch: async (runId, response) => {
      stored.set(runId.replace("run-", ""), response);
    },
    releaseBatch: async (runId) => {
      stored.delete(runId.replace("run-", ""));
    },
    ...over,
  };
  return { deps, inserted };
}

const send = async (rows: unknown[], deps: SubmitDeps, batchId = BATCH) => {
  const outcome = await submitProspects({ batchId, rows }, deps);
  if (outcome.kind !== "done") throw new Error("batch not done");
  return outcome.body;
};

describe("submitProspects", () => {
  it("accepts a named contact whose email is published on the company's site", async () => {
    const { deps, inserted } = submitDeps();
    const body = await send([row()], deps);
    expect(body.accepted).toBe(1);
    expect(body.results[0]).toMatchObject({ company: "Example Labs", status: "accepted" });
    const saved = inserted[0][0];
    expect(saved.segment).toBe("startup");
    expect(saved.contactEmail).toBe("jo@examplelabs.com");
    // The source is kept with the facts, next to the sourced facts themselves.
    expect(saved.facts.map((f) => f.sourceUrl)).toContain("https://examplelabs.com/team");
    expect(saved.facts).toHaveLength(2);
  });

  it("rejects a guessed email that names no source", async () => {
    const { deps, inserted } = submitDeps();
    const body = await send([row({ emailSourceUrl: undefined }), row({ company: "B", contactEmail: "b@examplelabs.com", emailEvidence: undefined })], deps);
    expect(body.results.map((r) => r.reason)).toEqual(["no_source", "no_source"]);
    expect(inserted).toHaveLength(0);
  });

  it("rejects a source that is not https, or evidence it does not recognise", async () => {
    const { deps } = submitDeps();
    const body = await send([row({ emailSourceUrl: "http://examplelabs.com/team" }), row({ company: "B", contactEmail: "b@x.org", emailEvidence: "guessed" })], deps);
    expect(body.results.map((r) => r.reason)).toEqual(["no_source", "no_source"]);
  });

  it("rejects 'published on site' when the source page is on another site", async () => {
    const { deps } = submitDeps();
    const body = await send([row({ emailSourceUrl: "https://elsewhere.com/list" })], deps);
    expect(body.results[0].reason).toBe("no_source");
  });

  it("takes a directory or filing source on another site when it says so", async () => {
    const { deps } = submitDeps();
    const body = await send([row({ emailSourceUrl: "https://directory.example.org/labs", emailEvidence: "published_directory" })], deps);
    expect(body.accepted).toBe(1);
  });

  it("rejects free-mail addresses", async () => {
    const { deps } = submitDeps();
    const body = await send([row({ contactEmail: "jo.founder@gmail.com" })], deps);
    expect(body.results[0].reason).toBe("free_mail");
  });

  it("rejects role inboxes like sales@ but allows founders@, hello@, contact@ and info@", async () => {
    const { deps } = submitDeps();
    const rows = ["sales", "careers", "founders", "hello", "contact", "info"].map((local, i) => row({ company: `Co ${i}`, contactEmail: `${local}@examplelabs${i}.com`, website: `https://examplelabs${i}.com`, emailSourceUrl: `https://examplelabs${i}.com/contact` }));
    const body = await send(rows, deps);
    expect(body.results.map((r) => r.reason ?? "ok")).toEqual(["role_inbox", "role_inbox", "ok", "ok", "ok", "ok"]);
  });

  it("rejects an address on a domain that cannot receive mail", async () => {
    const { deps } = submitDeps({ checkMx: async () => false });
    expect((await send([row()], deps)).results[0].reason).toBe("mx_failed");
  });

  it("never bypasses the do-not-contact list, by address or by domain", async () => {
    const existing = empty();
    existing.suppressedEmails.add("jo@examplelabs.com");
    existing.suppressedDomains.add("blocked.org");
    const { deps, inserted } = submitDeps({ existing });
    const body = await send([row(), row({ company: "Blocked", contactEmail: "a@blocked.org", website: "https://blocked.org", emailSourceUrl: "https://blocked.org/team" })], deps);
    expect(body.results.map((r) => r.reason)).toEqual(["suppressed", "suppressed"]);
    expect(inserted).toHaveLength(0);
  });

  it("skips a company whose domain is already a prospect, and a past client by name", async () => {
    const existing = empty();
    existing.companyDomains.add("examplelabs.com");
    existing.clientNames.add("old client");
    const { deps } = submitDeps({ existing });
    const body = await send([row(), row({ company: "Old Client", contactEmail: "x@oldclient.com", website: "https://oldclient.com", emailSourceUrl: "https://oldclient.com/team" })], deps);
    expect(body.results.map((r) => r.reason)).toEqual(["duplicate_company", "past_client"]);
  });

  it("catches duplicates inside the same batch", async () => {
    const { deps, inserted } = submitDeps();
    const body = await send([row(), row({ company: "Example Labs 2", contactEmail: "kim@examplelabs.com" })], deps);
    expect(body.results.map((r) => r.reason ?? "ok")).toEqual(["ok", "duplicate_company"]);
    expect(inserted[0]).toHaveLength(1);
  });

  it("rejects rows with no sourced facts, and malformed rows, without failing the batch", async () => {
    const { deps } = submitDeps();
    const body = await send([row({ facts: [] }), { nope: true }, row({ company: "Good", contactEmail: "g@good.com", website: "https://good.com", emailSourceUrl: "https://good.com/team" })], deps);
    expect(body.results.map((r) => r.reason ?? "ok")).toEqual(["no_facts", "invalid_row", "ok"]);
    expect(body.accepted).toBe(1);
  });

  it("accepts rows in order up to the quota and skips the rest", async () => {
    const { deps, inserted } = submitDeps({ quota: async () => ({ remaining: 2, backlogFull: false }) });
    const rows = [1, 2, 3].map((i) => row({ company: `Co ${i}`, contactEmail: `a@co${i}.com`, website: `https://co${i}.com`, emailSourceUrl: `https://co${i}.com/team` }));
    const body = await send(rows, deps);
    expect(body.results.map((r) => r.reason ?? "ok")).toEqual(["ok", "ok", "quota"]);
    expect(inserted[0]).toHaveLength(2);
  });

  it("takes nothing while sending is backed up", async () => {
    const { deps, inserted } = submitDeps({ quota: async () => ({ remaining: 0, backlogFull: true }) });
    const body = await send([row(), row({ company: "B" })], deps);
    expect(body.accepted).toBe(0);
    expect(body.results.every((r) => r.reason === "backlog_full")).toBe(true);
    expect(inserted).toHaveLength(0);
  });

  it("inserts nothing while outreach is off", async () => {
    const { deps, inserted } = submitDeps({ mode: "off" });
    const body = await send([row()], deps);
    expect(body).toEqual({ accepted: 0, mode: "off", results: [] });
    expect(inserted).toHaveLength(0);
  });

  it("answers a repeated batch with the same result and inserts nothing more", async () => {
    const { deps, inserted } = submitDeps();
    const first = await send([row()], deps);
    const second = await send([row()], deps);
    expect(second).toEqual(first);
    expect(inserted).toHaveLength(1);
  });

  it("reports a batch still being processed instead of running it twice", async () => {
    const { deps, inserted } = submitDeps({ claimBatch: async () => ({ claimed: false, stored: null }) });
    expect(await submitProspects({ batchId: BATCH, rows: [row()] }, deps)).toEqual({ kind: "in_progress" });
    expect(inserted).toHaveLength(0);
  });

  it("frees the batch id when storing fails, so the agent can send it again", async () => {
    const release = vi.fn(async () => {});
    const { deps } = submitDeps({ insertProspects: async () => { throw new Error("db down"); }, releaseBatch: release });
    await expect(submitProspects({ batchId: BATCH, rows: [row()] }, deps)).rejects.toThrow("db down");
    expect(release).toHaveBeenCalled();
  });

  it("marks an address someone else took a moment ago as a duplicate", async () => {
    const { deps } = submitDeps({ insertProspects: async (rows) => rows.map((r) => ({ email: r.contactEmail, id: null })) });
    const body = await send([row()], deps);
    expect(body.results[0]).toMatchObject({ status: "skipped", reason: "duplicate_email" });
  });
});

describe("quota and exclusions", () => {
  it("is the daily target minus what the agent already added today", () => {
    expect(computeQuota({ dailyTarget: 15, acceptedToday: 4, backlog: 10, backlogLimit: 120 })).toBe(11);
    expect(computeQuota({ dailyTarget: 15, acceptedToday: 20, backlog: 10, backlogLimit: 120 })).toBe(0);
  });
  it("is zero while the backlog is over the limit", () => {
    expect(computeQuota({ dailyTarget: 15, acceptedToday: 0, backlog: 121, backlogLimit: 120 })).toBe(0);
    expect(computeQuota({ dailyTarget: 15, acceptedToday: 0, backlog: 120, backlogLimit: 120 })).toBe(15);
  });
  it("lists prospect and suppressed domains and emails, and past client names", () => {
    const e = empty();
    e.companyDomains.add("a.com");
    e.suppressedDomains.add("b.com");
    e.emails.add("x@a.com");
    e.suppressedEmails.add("y@b.com");
    e.clientNames.add("old client");
    expect(exclusionsFrom(e)).toEqual({ domains: ["a.com", "b.com"], emails: ["x@a.com", "y@b.com"], companyNames: ["old client"] });
  });
});

describe("sourceProblem", () => {
  it("needs an https page", () => {
    expect(sourceProblem({ email: "a@b.com", website: null, sourceUrl: "https://b.com/team", evidence: "published_on_site" })).toBeNull();
    expect(sourceProblem({ email: "a@b.com", website: null, sourceUrl: "javascript:alert(1)", evidence: "published_other" })).toBe("no_source");
    expect(sourceProblem({ email: "a@b.com", website: null, sourceUrl: "", evidence: "published_other" })).toBe("no_source");
  });
  it("accepts a subdomain of the company site for on-site evidence", () => {
    expect(sourceProblem({ email: "a@b.com", website: "https://www.b.com", sourceUrl: "https://team.b.com/", evidence: "published_on_site" })).toBeNull();
  });
});

describe("parseClaimCount", () => {
  it("defaults to 20 and never goes over 25", () => {
    expect(parseClaimCount(null)).toBe(20);
    expect(parseClaimCount("abc")).toBe(20);
    expect(parseClaimCount("100")).toBe(25);
    expect(parseClaimCount("5")).toBe(5);
    expect(parseClaimCount("0")).toBe(1);
  });
});

/* ── Task results ─────────────────────────────────────────────────────────────────────────────────────────── */

const candidate = (over: Partial<TaskCandidate> = {}): TaskCandidate => ({
  id: "c1",
  company: "Green Fields Co-op",
  website: "https://greenfields.org",
  domain: "greenfields.org",
  segment: "nonprofit",
  outcome: "no_email",
  reason: "No email published on the site.",
  founders: [],
  knownFacts: [{ text: "A food co-op in Santa Cruz.", sourceUrl: "https://greenfields.org/about" }],
  niche: "strategy",
  sizeStage: null,
  summary: "A food co-op.",
  claimToken: TOKEN,
  claimedAt: new Date(NOW.getTime() - 3_600_000).toISOString(),
  attempts: 1,
  ...over,
});

function taskDeps(c: TaskCandidate | null, over: Partial<TaskResultDeps> = {}) {
  const promoted: { id: string; row: ProspectDraftRow }[] = [];
  const released: { id: string; reason: string }[] = [];
  const deps: TaskResultDeps = {
    getCandidate: async () => c,
    loadExisting: async () => empty(),
    checkMx: async () => true,
    promote: async (id, r) => {
      promoted.push({ id, row: r });
      return { prospectId: "prospect-1" };
    },
    releaseClaim: async (id, reason) => {
      released.push({ id, reason });
    },
    now: () => NOW,
    ...over,
  };
  return { deps, promoted, released };
}

const success = (over: Record<string, unknown> = {}) => ({
  claimToken: TOKEN,
  contactName: "Dana Director",
  contactRole: "Executive Director",
  contactEmail: "dana@greenfields.org",
  emailSourceUrl: "https://greenfields.org/staff",
  emailEvidence: "published_on_site",
  facts: [{ text: "Runs a weekly farm stand.", sourceUrl: "https://greenfields.org/programs" }],
  ...over,
});

describe("submitTaskResult", () => {
  it("promotes a list-source (non-YC) candidate from its stored facts and the submitted ones", async () => {
    const { deps, promoted } = taskDeps(candidate());
    const res = await submitTaskResult("c1", success(), deps);
    expect(res).toEqual({ status: 200, body: { status: "accepted", prospectId: "prospect-1" } });
    const saved = promoted[0].row;
    expect(saved.company).toBe("Green Fields Co-op");
    expect(saved.segment).toBe("nonprofit");
    expect(saved.contactName).toBe("Dana Director");
    expect(saved.facts.map((f) => f.text)).toEqual(expect.arrayContaining(["A food co-op in Santa Cruz.", "Runs a weekly farm stand."]));
  });

  it("refuses a wrong claim token with 409 and changes nothing", async () => {
    const { deps, promoted } = taskDeps(candidate());
    const res = await submitTaskResult("c1", success({ claimToken: "33333333-3333-4333-8333-333333333333" }), deps);
    expect(res.status).toBe(409);
    expect(promoted).toHaveLength(0);
  });

  it("refuses an answer after the 24 hour lease ran out", async () => {
    const { deps } = taskDeps(candidate({ claimedAt: new Date(NOW.getTime() - 25 * 3_600_000).toISOString() }));
    expect((await submitTaskResult("c1", success(), deps)).status).toBe(409);
  });

  it("applies the same email rules as a new prospect", async () => {
    const { deps, promoted } = taskDeps(candidate());
    expect((await submitTaskResult("c1", success({ emailSourceUrl: undefined }), deps)).body).toEqual({ status: "rejected", reason: "no_source" });
    expect((await submitTaskResult("c1", success({ contactEmail: "dana@gmail.com" }), deps)).body).toEqual({ status: "rejected", reason: "free_mail" });
    expect((await submitTaskResult("c1", success({ contactEmail: "sales@greenfields.org" }), deps)).body).toEqual({ status: "rejected", reason: "role_inbox" });
    expect(promoted).toHaveLength(0);
  });

  it("never bypasses the do-not-contact list", async () => {
    const existing = empty();
    existing.suppressedDomains.add("greenfields.org");
    const { deps, promoted } = taskDeps(candidate(), { loadExisting: async () => existing });
    expect((await submitTaskResult("c1", success(), deps)).body).toEqual({ status: "rejected", reason: "suppressed" });
    expect(promoted).toHaveLength(0);
  });

  it("records 'nothing found' by clearing the lease and remembering why", async () => {
    const { deps, released, promoted } = taskDeps(candidate({ attempts: 1 }));
    const res = await submitTaskResult("c1", { claimToken: TOKEN, outcome: "not_found", reason: "no_published_email", detail: "Staff page lists names only." }, deps);
    expect(res).toEqual({ status: 200, body: { status: "recorded", attemptsLeft: 2 } });
    expect(released).toEqual([{ id: "c1", reason: "no_published_email: Staff page lists names only." }]);
    expect(promoted).toHaveLength(0);
  });

  it("says no attempts are left after the third", async () => {
    const { deps } = taskDeps(candidate({ attempts: 3 }));
    const res = await submitTaskResult("c1", { claimToken: TOKEN, outcome: "not_found", reason: "site_down", detail: "" }, deps);
    expect(res.body).toEqual({ status: "recorded", attemptsLeft: 0 });
  });

  it("404s an unknown candidate and 400s a malformed body", async () => {
    expect((await submitTaskResult("nope", success(), taskDeps(null).deps)).status).toBe(404);
    expect((await submitTaskResult("c1", { claimToken: "x" }, taskDeps(candidate()).deps)).status).toBe(400);
  });
});
