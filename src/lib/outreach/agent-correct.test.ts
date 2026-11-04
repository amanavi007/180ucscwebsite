import { describe, expect, it, vi } from "vitest";
import { correctCandidateContact, correctProspectContact, invalidateProspect, retireCandidate, type ProspectForCorrection } from "./agent-correct";
import type { CandidateRow } from "./agent-audit";
import { planRescreen } from "./rescreen";
import { isBlockedInbox } from "./discovery/emails";
import { partitionImport, type ExistingProspectData } from "./verify";

const ID = "11111111-1111-4111-8111-111111111111";
const empty = (): ExistingProspectData => ({ emails: new Set(), companyDomains: new Set(), clientNames: new Set(), suppressedEmails: new Set(), suppressedDomains: new Set() });

const candidate = (over: Partial<CandidateRow> = {}): CandidateRow =>
  ({
    id: ID, source: "yc", source_ref: null, company: "Acme", website: "https://acme.com", domain: "acme.com", outcome: "ready", reason: null, prospect_id: null,
    email: "admin@acme.com", email_source_url: null, founders: [], payload: { prospect: { email: "admin@acme.com", contactName: null, contactRole: null, facts: [] }, meta: null, priority: 1 },
    agent_attempts: 2, agent_claimed_at: null, agent_last_reason: null, attempts: 0, last_attempt_at: null, created_at: "2026-01-01T00:00:00Z", ...over,
  }) as CandidateRow;

function candidateDeps(c: CandidateRow | null, page = "<p>Reach jane@acme.com</p>") {
  return {
    getCandidate: vi.fn(async () => c),
    existing: async () => empty(),
    fetchPage: vi.fn(async () => page),
    checkMx: async () => true,
    saveContact: vi.fn(async (_id: string, _change: Record<string, unknown>) => {}),
    record: vi.fn(async () => {}),
  };
}

const good = { contactName: "Jane Doe", contactRole: "CEO", contactEmail: "jane@acme.com", emailSourceUrl: "https://acme.com/privacy", emailEvidence: "published_on_site" };

describe("candidate contact correction", () => {
  it("replaces a ready candidate's contact with a published email and logs it", async () => {
    const deps = candidateDeps(candidate());
    const r = await correctCandidateContact(ID, good, deps);
    expect(r.status).toBe(200);
    const saved = deps.saveContact.mock.calls[0][1] as unknown as { email: string; payload: { prospect: { email: string; contactName: string } } };
    expect(saved.email).toBe("jane@acme.com");
    expect(saved.payload.prospect).toMatchObject({ email: "jane@acme.com", contactName: "Jane Doe" });
    expect(deps.record).toHaveBeenCalledWith(expect.objectContaining({ action: "contact_correction", oldEmail: "admin@acme.com", newEmail: "jane@acme.com" }));
  });
  it("rejects an admin@ address as blocked_inbox", async () => {
    const r = await correctCandidateContact(ID, { ...good, contactEmail: "admin@acme.com" }, candidateDeps(candidate()));
    expect(r.status).toBe(422);
    expect(r.body.reason).toBe("blocked_inbox");
  });
  it("rejects an email the source page does not show", async () => {
    const r = await correctCandidateContact(ID, good, candidateDeps(candidate(), "<p>nothing here</p>"));
    expect(r).toMatchObject({ status: 422, body: { reason: "no_source" } });
  });
  it("rejects a missing source and a free-mail address", async () => {
    expect((await correctCandidateContact(ID, { ...good, emailSourceUrl: null }, candidateDeps(candidate()))).body.reason).toBe("no_source");
    expect((await correctCandidateContact(ID, { ...good, contactEmail: "jane@gmail.com" }, candidateDeps(candidate()))).body.reason).toBe("free_mail");
  });
  it("invalidates: clears contact, back to no_email, agent attempts reset", async () => {
    const deps = candidateDeps(candidate());
    const r = await correctCandidateContact(ID, { invalidateEmail: true, reason: "junk placeholder" }, deps);
    expect(r.status).toBe(200);
    expect(deps.saveContact.mock.calls[0][1]).toMatchObject({ email: null, outcome: "no_email", resetAgent: true });
  });
  it("409s for a promoted candidate and 404s for a missing one", async () => {
    expect((await correctCandidateContact(ID, good, candidateDeps(candidate({ outcome: "added", prospect_id: ID })))).body.error).toBe("already_added");
    expect((await correctCandidateContact(ID, good, candidateDeps(null))).status).toBe(404);
  });
});

describe("retire", () => {
  it("retires a defunct candidate", async () => {
    const saveRetired = vi.fn(async (_id: string, _reason: string) => {});
    const r = await retireCandidate(ID, { reason: "defunct", detail: "site gone" }, { getCandidate: async () => candidate({ outcome: "no_email" }), saveRetired, record: async () => {} });
    expect(r.status).toBe(200);
    expect(saveRetired).toHaveBeenCalledWith(ID, expect.stringContaining("defunct"));
  });
  it("409s for added and rejects an unknown reason", async () => {
    const deps = { getCandidate: async () => candidate({ outcome: "added" }), saveRetired: async () => {}, record: async () => {} };
    expect((await retireCandidate(ID, { reason: "defunct" }, deps)).body.error).toBe("already_added");
    expect((await retireCandidate(ID, { reason: "bored" }, deps)).status).toBe(400);
  });
});

const prospect = (over: Partial<ProspectForCorrection> = {}): ProspectForCorrection => ({ id: ID, company: "Energent AI", website: "https://energent.ai", contactEmail: "admin@energent.ai", contactName: null, contactRole: null, status: "verified", lastSentAt: null, ...over });
function prospectDeps(p: ProspectForCorrection | null, engaged = false) {
  return {
    getProspect: async () => p,
    isEngaged: async () => engaged,
    existing: async () => empty(),
    fetchPage: async () => "jane@energent.ai",
    checkMx: async () => true,
    saveContact: vi.fn(async () => "ok" as const),
    markInvalid: vi.fn(async () => {}),
    record: vi.fn(async () => {}),
  };
}

describe("prospect corrections", () => {
  it("invalidating a contact marks the prospect invalid", async () => {
    const deps = prospectDeps(prospect());
    const r = await correctProspectContact(ID, { invalidateEmail: true, reason: "junk admin@" }, deps);
    expect(r).toMatchObject({ status: 200, body: { status: "invalid" } });
    expect(deps.markInvalid).toHaveBeenCalled();
  });
  it("replacing a verified prospect's contact resets it to new", async () => {
    const deps = prospectDeps(prospect());
    const r = await correctProspectContact(ID, { ...good, contactEmail: "jane@energent.ai", emailSourceUrl: "https://energent.ai/about" }, deps);
    expect(r.body.status).toBe("new");
    expect(deps.saveContact).toHaveBeenCalledWith(ID, expect.objectContaining({ resetToNew: true }));
  });
  it("never changes an engaged prospect", async () => {
    expect((await correctProspectContact(ID, { invalidateEmail: true, reason: "x" }, prospectDeps(prospect({ status: "replied" })))).body.error).toBe("already_engaged");
    expect((await invalidateProspect(ID, { reason: "defunct" }, prospectDeps(prospect(), true))).status).toBe(409);
  });
  it("invalidate endpoint sets invalid and is idempotent", async () => {
    const deps = prospectDeps(prospect());
    expect((await invalidateProspect(ID, { reason: "acquired", detail: "bought" }, deps)).status).toBe(200);
    expect((await invalidateProspect(ID, { reason: "acquired" }, prospectDeps(prospect({ status: "invalid" })))).body.unchanged).toBe(true);
  });
});

describe("blocklist and re-screen", () => {
  it("blocks the junk local parts", () => {
    for (const l of ["admin", "superadmin", "root", "postmaster", "webmaster", "example", "demo", "test", "noreply", "no-reply", "donotreply", "mailer-daemon", "abuse"]) expect(isBlockedInbox(`${l}@x.com`)).toBe(true);
    expect(isBlockedInbox("jane@x.com")).toBe(false);
  });
  it("the CSV import refuses them too", () => {
    const row = { company: "A", website: null, niche: "tech", sizeStage: null, summary: null, whyFit: null, facts: [], contactName: null, contactRole: null, contactEmail: "root@a.com" } as never;
    expect(partitionImport([row], empty()).skipped[0].reason).toBe("invalid_email");
  });
  it("flags junk prospects and ready candidates, and leaves engaged ones", () => {
    const plan = planRescreen(
      [
        { id: "1", company: "Energent AI", contactEmail: "admin@energent.ai", status: "verified", lastSentAt: null },
        { id: "2", company: "Sent Co", contactEmail: "admin@sent.com", status: "sent", lastSentAt: "2026-01-01" },
        { id: "3", company: "Fine", contactEmail: "jane@fine.com", status: "new", lastSentAt: null },
      ],
      [
        { id: "a", company: "R1", outcome: "ready", email: null, payload: { prospect: { email: "example@r1.com", contactName: null, contactRole: null } } },
        { id: "b", company: "R2", outcome: "ready", email: null, payload: { prospect: { email: "ok@r2.com" } } },
      ],
    );
    expect(plan.prospects.map((p) => p.id)).toEqual(["1"]);
    expect(plan.engaged.map((p) => p.id)).toEqual(["2"]);
    expect(plan.candidates.map((c) => c.id)).toEqual(["a"]);
  });
});
