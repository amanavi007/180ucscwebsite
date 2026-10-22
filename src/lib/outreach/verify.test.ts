import { describe, expect, it } from "vitest";
import { checkEmailSyntax, checkMx, classifyEmail, normalizeEmail, partitionImport } from "./verify";
import type { ProspectDraftRow } from "./types";

const row = (over: Partial<ProspectDraftRow> = {}): ProspectDraftRow => ({
  company: "Acme",
  website: null,
  niche: null,
  sizeStage: null,
  summary: null,
  whyFit: null,
  facts: [],
  contactName: null,
  contactRole: null,
  contactEmail: "jo@acme.com",
  ...over,
});

const none = {
  emails: new Set<string>(),
  companyDomains: new Set<string>(),
  clientNames: new Set<string>(),
  suppressedEmails: new Set<string>(),
  suppressedDomains: new Set<string>(),
};

describe("normalizeEmail", () => {
  it("trims and lowercases", () => expect(normalizeEmail("  Jo@X.com ")).toBe("jo@x.com"));
});

describe("checkEmailSyntax", () => {
  it("accepts a normal address", () => expect(checkEmailSyntax("jo@acme.com").ok).toBe(true));
  it("rejects a missing domain dot", () => expect(checkEmailSyntax("a@b")).toEqual({ ok: false, reason: "Not a valid email address." }));
  it("rejects spaces and double @", () => {
    expect(checkEmailSyntax("a b@c.com").ok).toBe(false);
    expect(checkEmailSyntax("a@@c.com").ok).toBe(false);
  });
});

describe("classifyEmail", () => {
  it("flags role inboxes", () => expect(classifyEmail("info@acme.com").roleInbox).toBe(true));
  it("does not flag people", () => expect(classifyEmail("jo@acme.com").roleInbox).toBe(false));
  it("flags disposable domains", () => expect(classifyEmail("a@mailinator.com").disposable).toBe(true));
  it("flags free mail", () => expect(classifyEmail("a@gmail.com").freeMail).toBe(true));
});

describe("checkMx", () => {
  it("is true when the resolver returns an exchange", async () => {
    expect(await checkMx("acme.com", async () => [{ exchange: "mx.acme.com" }])).toBe(true);
  });
  it("is false when there are no records", async () => {
    expect(await checkMx("nope.example", async () => [])).toBe(false);
  });
  it("is false when the resolver throws", async () => {
    expect(
      await checkMx("nope.example", async () => {
        throw new Error("ENOTFOUND");
      }),
    ).toBe(false);
  });
});

describe("partitionImport", () => {
  it("accepts a clean row", () => {
    const { accept, skipped } = partitionImport([row()], none);
    expect(accept).toHaveLength(1);
    expect(skipped).toEqual([]);
  });

  it("skips invalid, duplicate, suppressed and past-client rows with a reason", () => {
    const existing = {
      ...none,
      emails: new Set(["dup@x.co"]),
      companyDomains: new Set(["samedomain.com"]),
      clientNames: new Set(["habitat for humanity"]),
      suppressedEmails: new Set(["gone@y.co"]),
      suppressedDomains: new Set(["blocked.com"]),
    };
    const rows = [
      row({ contactEmail: "bad" }),
      row({ contactEmail: "DUP@x.co" }),
      row({ contactEmail: "a@samedomain.com" }),
      row({ company: "Habitat for Humanity", contactEmail: "h@hfh.org" }),
      row({ contactEmail: "gone@y.co" }),
      row({ contactEmail: "z@blocked.com" }),
      row({ contactEmail: "fine@ok.com", company: "Fine" }),
    ];
    const { accept, skipped } = partitionImport(rows, existing);
    expect(accept.map((r) => r.contactEmail)).toEqual(["fine@ok.com"]);
    expect(skipped.map((s) => s.reason)).toEqual([
      "invalid_email",
      "duplicate_email",
      "duplicate_company",
      "past_client",
      "suppressed",
      "suppressed",
    ]);
  });

  it("does not treat a shared free-mail domain as the same company", () => {
    const existing = { ...none, companyDomains: new Set(["gmail.com"]) };
    expect(partitionImport([row({ contactEmail: "a@gmail.com" })], existing).accept).toHaveLength(1);
  });

  it("does not mutate its inputs", () => {
    const existing = { ...none };
    const before = JSON.stringify([...existing.emails]);
    partitionImport([row()], existing);
    expect(JSON.stringify([...existing.emails])).toBe(before);
  });
});
