import { describe, expect, it, vi } from "vitest";
import {
  addFacts,
  correctWebsite,
  decodeCursor,
  encodeCursor,
  page,
  parseListQuery,
  prospectView,
  requeueCandidate,
  tally,
  type AuditDeps,
  type CandidateRow,
  type FactsDeps,
  type RequeueDeps,
} from "./agent-audit";

const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const candidate = (over: Partial<CandidateRow> = {}): CandidateRow => ({
  id: ID,
  source: "yc",
  source_ref: "acme",
  company: "Acme Labs",
  website: "https://old-acme.example/",
  domain: "old-acme.example",
  outcome: "unreachable",
  reason: "Could not load the website.",
  prospect_id: null,
  email: null,
  email_source_url: null,
  founders: [],
  payload: null,
  agent_attempts: 2,
  agent_claimed_at: null,
  agent_last_reason: null,
  attempts: 3,
  last_attempt_at: null,
  created_at: "2026-11-03T10:00:00.123456+00:00",
  ...over,
});

describe("cursor and paging", () => {
  it("round-trips a cursor and rejects junk", () => {
    const c = encodeCursor({ created_at: "2026-11-03T10:00:00.123456+00:00", id: ID });
    expect(decodeCursor(c)).toEqual({ t: "2026-11-03T10:00:00.123456+00:00", id: ID });
    expect(decodeCursor("nope")).toBeNull();
    const evil = Buffer.from(JSON.stringify({ t: "2026-11-03T10:00:00Z),id.gt.x", id: ID })).toString("base64url");
    expect(decodeCursor(evil)).toBeNull();
  });

  it("caps the limit and validates filters", () => {
    const ok = parseListQuery(new URLSearchParams("limit=9999&outcome=no_email"), ["outcome", "source"]);
    expect(ok.ok && ok.query.limit).toBe(200);
    expect(ok.ok && ok.query.filters).toEqual({ outcome: "no_email" });
    expect(parseListQuery(new URLSearchParams(), ["outcome"]).ok && 100).toBe(100);
    expect(parseListQuery(new URLSearchParams("limit=0"), []).ok).toBe(false);
    expect(parseListQuery(new URLSearchParams("outcome=a,b)"), ["outcome"])).toEqual({ ok: false, error: "invalid_outcome" });
    expect(parseListQuery(new URLSearchParams("since=garbage"), [])).toEqual({ ok: false, error: "invalid_since" });
  });

  it("returns a next cursor only when another page exists", () => {
    const rows = [1, 2, 3].map((n) => ({ id: `${n}`, created_at: `t${n}` }));
    expect(page(rows, 3).nextCursor).toBeNull();
    const p = page(rows, 2);
    expect(p.rows).toHaveLength(2);
    expect(decodeCursor(p.nextCursor ?? "")).toBeNull(); // fake ids, so it is not a valid uuid cursor
    expect(p.nextCursor).toBe(encodeCursor(rows[1]));
  });
});

describe("views", () => {
  it("reads prospect facts the way drafting does", () => {
    const v = prospectView({
      id: ID, company: "A", website: "https://www.a.com/x", segment: null, niche: null, contact_name: null, contact_role: null,
      contact_email: "a@a.com", contact_domain: "a.com", status: "new", created_at: "t",
      facts: [{ text: "Fact", source_url: "https://a.com/f" }, { nope: 1 }],
    });
    expect(v.facts).toEqual([{ text: "Fact", sourceUrl: "https://a.com/f" }]);
    expect(v.domain).toBe("a.com");
  });

  it("counts whatever outcomes are stored", () => {
    expect(tally(["added", "added", "weird"])).toEqual({ added: 2, weird: 1 });
  });
});

function correctionDeps(over: Partial<AuditDeps> = {}, row: CandidateRow | null = candidate()) {
  const deps = {
    getCandidate: vi.fn(async () => row),
    domainOwner: vi.fn(async () => null as string | null),
    fetchPage: vi.fn(async () => "<html><body>Welcome to Acme Labs</body></html>" as string | null),
    saveCorrection: vi.fn(async () => "ok" as "ok" | "domain_taken"),
    recordCorrection: vi.fn(async () => {}),
    ...over,
  };
  return deps;
}
const body = { website: "https://acme.io/", evidenceUrl: "https://acme.io/about", note: "Moved." };

describe("correctWebsite", () => {
  it("updates website and domain, resets an unreachable company and logs it", async () => {
    const deps = correctionDeps();
    const res = await correctWebsite(ID, body, deps);
    expect(res.status).toBe(200);
    expect(deps.saveCorrection).toHaveBeenCalledWith(ID, expect.objectContaining({ website: "https://acme.io/", domain: "acme.io", outcome: "unreachable", reset: true, reason: "Website corrected by research agent: Moved." }));
    expect(deps.recordCorrection).toHaveBeenCalledWith(expect.objectContaining({ action: "website", oldDomain: "old-acme.example", newDomain: "acme.io", evidenceUrl: "https://acme.io/about", note: "Moved." }));
  });

  it("moves a failed company back to unreachable so repair retries it", async () => {
    const deps = correctionDeps({}, candidate({ outcome: "failed", reason: "The listed website is a profile page." }));
    await correctWebsite(ID, body, deps);
    expect(deps.saveCorrection).toHaveBeenCalledWith(ID, expect.objectContaining({ outcome: "unreachable", reset: true }));
  });

  it("keeps an added company's outcome and only changes the site", async () => {
    const deps = correctionDeps({}, candidate({ outcome: "added", prospect_id: OTHER, reason: "Email added." }));
    const res = await correctWebsite(ID, body, deps);
    expect(res.status).toBe(200);
    expect(deps.saveCorrection).toHaveBeenCalledWith(ID, expect.objectContaining({ outcome: "added", reset: false, reason: "Email added." }));
  });

  it("changes nothing when the evidence does not mention the company", async () => {
    const deps = correctionDeps({ fetchPage: vi.fn(async () => "<html>This domain is for sale</html>") });
    expect(await correctWebsite(ID, body, deps)).toEqual({ status: 422, body: { error: "evidence_mismatch" } });
    expect(deps.saveCorrection).not.toHaveBeenCalled();
    expect(deps.recordCorrection).not.toHaveBeenCalled();
    const unreadable = correctionDeps({ fetchPage: vi.fn(async () => null) });
    expect((await correctWebsite(ID, body, unreadable)).status).toBe(422);
  });

  it("refuses a domain another candidate owns, before fetching anything", async () => {
    const deps = correctionDeps({ domainOwner: vi.fn(async () => OTHER) });
    expect(await correctWebsite(ID, body, deps)).toEqual({ status: 409, body: { error: "domain_taken", conflictingCandidateId: OTHER } });
    expect(deps.fetchPage).not.toHaveBeenCalled();
    expect(deps.saveCorrection).not.toHaveBeenCalled();
  });

  it("answers domain_taken when the index refuses at write time", async () => {
    const owner = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(OTHER);
    const deps = correctionDeps({ domainOwner: owner, saveCorrection: vi.fn(async () => "domain_taken" as const) });
    const res = await correctWebsite(ID, body, deps);
    expect(res.status).toBe(409);
    expect(deps.recordCorrection).not.toHaveBeenCalled();
  });

  it("rejects bad input: http evidence, IP hosts, platform pages, missing note, unknown id", async () => {
    expect((await correctWebsite(ID, { ...body, evidenceUrl: "http://acme.io/" }, correctionDeps())).status).toBe(400);
    expect((await correctWebsite(ID, { ...body, website: "https://10.0.0.1/" }, correctionDeps())).status).toBe(400);
    expect((await correctWebsite(ID, { ...body, website: "https://www.linkedin.com/company/acme" }, correctionDeps())).status).toBe(400);
    expect((await correctWebsite(ID, { ...body, note: "" }, correctionDeps())).status).toBe(400);
    expect((await correctWebsite(ID, body, correctionDeps({}, null))).status).toBe(404);
  });

  it("keeps a pooled payload's website in step", async () => {
    const payload = { prospect: { website: "https://old-acme.example/", facts: [] }, meta: null, priority: 1 };
    const deps = correctionDeps({}, candidate({ outcome: "ready", payload }));
    await correctWebsite(ID, body, deps);
    expect(deps.saveCorrection).toHaveBeenCalledWith(ID, expect.objectContaining({ outcome: "ready", payload: { ...payload, prospect: { ...payload.prospect, website: "https://acme.io/" } } }));
  });
});

function factsDeps(row: CandidateRow | null, prospectFacts: { text: string; sourceUrl: string }[] | null = null) {
  return {
    getCandidate: vi.fn(async () => row),
    getProspectFacts: vi.fn(async () => prospectFacts),
    saveFacts: vi.fn(async () => {}),
    recordFacts: vi.fn(async () => {}),
  } satisfies FactsDeps;
}
const withFacts = (facts: unknown[], over: Partial<CandidateRow> = {}) => candidate({ outcome: "ready", payload: { prospect: { facts } }, ...over });

describe("addFacts", () => {
  it("adds a new sourced fact and reports the total", async () => {
    const deps = factsDeps(withFacts([{ text: "Founded 2020", sourceUrl: "https://a.com/about" }]));
    const res = await addFacts(ID, { facts: [{ text: "Serves 40 clinics", sourceUrl: "https://a.com/customers" }] }, deps);
    expect(res).toEqual({ status: 200, body: { added: 1, rejected: 0, factsTotal: 2 } });
    expect(deps.saveFacts).toHaveBeenCalledWith(ID, null, [
      { text: "Founded 2020", sourceUrl: "https://a.com/about" },
      { text: "Serves 40 clinics", sourceUrl: "https://a.com/customers" },
    ]);
  });

  it("adds nothing for a duplicate, ignoring case and spacing", async () => {
    const deps = factsDeps(withFacts([{ text: "Founded 2020", sourceUrl: "https://a.com/about" }]));
    const res = await addFacts(ID, { facts: [{ text: "  founded   2020 ", sourceUrl: "https://a.com/x" }] }, deps);
    expect(res.body).toEqual({ added: 0, rejected: 0, factsTotal: 1 });
    expect(deps.saveFacts).not.toHaveBeenCalled();
  });

  it("rejects facts without an https source", async () => {
    const deps = factsDeps(withFacts([]));
    const res = await addFacts(ID, { facts: [{ text: "Claim", sourceUrl: "http://a.com" }, { text: "Other", sourceUrl: "" }] }, deps);
    expect(res.body).toEqual({ added: 0, rejected: 2, factsTotal: 0 });
  });

  it("writes to the linked prospect for an added company, deduping against it", async () => {
    const stored = [{ text: "On the prospect", sourceUrl: "https://a.com/p" }];
    const deps = factsDeps(withFacts([], { outcome: "added", prospect_id: OTHER }), stored);
    const res = await addFacts(ID, { facts: [{ text: "on the prospect", sourceUrl: "https://a.com/p" }, { text: "New", sourceUrl: "https://a.com/n" }] }, deps);
    expect(res.body).toEqual({ added: 1, rejected: 0, factsTotal: 2 });
    expect(deps.saveFacts).toHaveBeenCalledWith(ID, OTHER, [...stored, { text: "New", sourceUrl: "https://a.com/n" }]);
  });

  it("only applies to ready and added companies", async () => {
    const res = await addFacts(ID, { facts: [{ text: "x", sourceUrl: "https://a.com" }] }, factsDeps(candidate({ outcome: "unreachable" })));
    expect(res).toEqual({ status: 409, body: { error: "facts_not_applicable", outcome: "unreachable" } });
    expect((await addFacts(ID, { facts: [] }, factsDeps(withFacts([])))).status).toBe(400);
    expect((await addFacts(ID, { facts: [{ text: "x", sourceUrl: "https://a.com" }] }, factsDeps(null))).status).toBe(404);
  });
});

function requeueDeps(row: CandidateRow | null) {
  return { getCandidate: vi.fn(async () => row), saveRequeue: vi.fn(async () => {}), recordCorrection: vi.fn(async () => {}) } satisfies RequeueDeps;
}

describe("requeueCandidate", () => {
  it("hands a failed company back and logs it", async () => {
    const deps = requeueDeps(candidate({ outcome: "failed" }));
    const res = await requeueCandidate(ID, { note: "Site is live now." }, deps);
    expect(res).toEqual({ status: 200, body: { id: ID, outcome: "unreachable" } });
    expect(deps.saveRequeue).toHaveBeenCalledWith(ID, { outcome: "unreachable", reason: "Requeued by research agent: Site is live now." });
    expect(deps.recordCorrection).toHaveBeenCalledWith(expect.objectContaining({ action: "requeue" }));
  });

  it("keeps no_email as it is and accepts an empty body", async () => {
    const deps = requeueDeps(candidate({ outcome: "no_email" }));
    expect((await requeueCandidate(ID, {}, deps)).status).toBe(200);
    expect(deps.saveRequeue).toHaveBeenCalledWith(ID, { outcome: "no_email", reason: "Requeued by research agent." });
  });

  it("refuses added and other outcomes the repair job cannot retry", async () => {
    for (const outcome of ["added", "ready", "duplicate", "no_facts"]) {
      const deps = requeueDeps(candidate({ outcome }));
      expect((await requeueCandidate(ID, {}, deps)).status).toBe(409);
      expect(deps.saveRequeue).not.toHaveBeenCalled();
    }
    expect((await requeueCandidate(ID, {}, requeueDeps(null))).status).toBe(404);
  });
});
