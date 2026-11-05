import { describe, expect, it } from "vitest";
import { companiesHref, legacyOutreachRedirect } from "./links";

describe("legacyOutreachRedirect", () => {
  it("does nothing for the Today page itself", () => {
    expect(legacyOutreachRedirect({})).toBeNull();
  });
  it("sends an old prospect link to Companies with the panel open", () => {
    expect(legacyOutreachRedirect({ prospect: "abc" })).toBe("/portal/admin/outreach/companies?prospect=abc");
  });
  it("keeps current stage keys and maps old ones", () => {
    expect(legacyOutreachRedirect({ stage: "needs-you" })).toBe("/portal/admin/outreach/companies?stage=needs-you");
    expect(legacyOutreachRedirect({ stage: "not-sent" })).toBe("/portal/admin/outreach/companies?stage=drafted");
    expect(legacyOutreachRedirect({ stage: "bogus" })).toBe("/portal/admin/outreach/companies?stage=all");
  });
  it("maps Discovery's old outcome filter and candidate", () => {
    expect(legacyOutreachRedirect({ outcome: "skipped" })).toBe("/portal/admin/outreach/companies?stage=skipped");
    expect(legacyOutreachRedirect({ outcome: "ready", candidate: "c1" })).toBe("/portal/admin/outreach/companies?stage=found&candidate=c1");
    expect(legacyOutreachRedirect({ outcome: "all" })).toBeNull();
  });
});

describe("companiesHref", () => {
  it("builds the Companies address", () => {
    expect(companiesHref()).toBe("/portal/admin/outreach/companies");
    expect(companiesHref({ stage: "sent" })).toBe("/portal/admin/outreach/companies?stage=sent");
    expect(companiesHref({ prospect: "p1" })).toBe("/portal/admin/outreach/companies?prospect=p1");
  });
});
