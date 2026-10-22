import { describe, expect, it } from "vitest";
import {
  ADMIN_AREA_LABELS,
  defaultQuarterId,
  getAdminLocation,
  parseMembersAction,
  resolveQuarterId,
  withQuarterParam,
  type AdminNavItem,
} from "./admin-nav";

const LINKS: AdminNavItem[] = [
  { href: "/portal/admin/members", label: "Members", group: "admin-people" },
  { href: "/portal/admin/team-builder", label: "Team Builder", group: "admin-people", quarterScoped: true },
  { href: "/portal/admin/quarters", label: "Quarters", group: "admin-setup" },
  { href: "/portal/admin/coffee-chats", label: "Coffee Chats", group: "admin-scheduling" },
];

describe("getAdminLocation", () => {
  it("returns the page, its area label and sibling pages", () => {
    const loc = getAdminLocation("/portal/admin/team-builder", LINKS);
    expect(loc?.page.label).toBe("Team Builder");
    expect(loc?.areaKey).toBe("admin-people");
    expect(loc?.areaLabel).toBe(ADMIN_AREA_LABELS["admin-people"]);
    expect(loc?.siblings.map((l) => l.label)).toEqual(["Members", "Team Builder"]);
  });

  it("matches nested paths under a page", () => {
    expect(getAdminLocation("/portal/admin/members/anything", LINKS)?.page.label).toBe("Members");
  });

  it("picks the most specific page when one page's address sits inside another's", () => {
    const links: AdminNavItem[] = [
      { href: "/portal/admin/outreach", label: "Pipeline", group: "admin-outreach" },
      { href: "/portal/admin/outreach/settings", label: "Settings", group: "admin-outreach" },
    ];
    expect(getAdminLocation("/portal/admin/outreach/settings", links)?.page.label).toBe("Settings");
    expect(getAdminLocation("/portal/admin/outreach", links)?.page.label).toBe("Pipeline");
    expect(getAdminLocation("/portal/admin/outreach/other", links)?.page.label).toBe("Pipeline");
  });

  it("returns a single-page area with itself as the only sibling", () => {
    expect(getAdminLocation("/portal/admin/coffee-chats", LINKS)?.siblings).toHaveLength(1);
  });

  it("returns null for the hub and for unknown paths", () => {
    expect(getAdminLocation("/portal/admin", LINKS)).toBeNull();
    expect(getAdminLocation("/portal/admin/nope", LINKS)).toBeNull();
  });

  it("does not match a path that merely shares a prefix", () => {
    expect(getAdminLocation("/portal/admin/members-archive", LINKS)).toBeNull();
  });
});

describe("withQuarterParam", () => {
  it("appends ?quarter= when an id is given", () => {
    expect(withQuarterParam("/portal/admin/stats", "q1")).toBe("/portal/admin/stats?quarter=q1");
  });
  it("uses & when the href already has a query", () => {
    expect(withQuarterParam("/portal/admin/coffee-chats?tab=schedule", "q1")).toBe(
      "/portal/admin/coffee-chats?tab=schedule&quarter=q1",
    );
  });
  it("returns the href untouched with no quarter", () => {
    expect(withQuarterParam("/portal/admin/stats", null)).toBe("/portal/admin/stats");
    expect(withQuarterParam("/portal/admin/stats", undefined)).toBe("/portal/admin/stats");
  });
});

describe("resolveQuarterId", () => {
  const quarters = [{ id: "a" }, { id: "b" }];
  it("keeps a valid param", () => expect(resolveQuarterId("b", quarters, "a")).toBe("b"));
  it("falls back for a garbage or deleted quarter id", () => {
    expect(resolveQuarterId("zzz", quarters, "a")).toBe("a");
  });
  it("falls back when there is no param", () => expect(resolveQuarterId(null, quarters, "a")).toBe("a"));
  it("returns null when there are no quarters at all", () => {
    expect(resolveQuarterId("a", [], null)).toBeNull();
  });
});

describe("parseMembersAction", () => {
  it("accepts the two known actions", () => {
    expect(parseMembersAction("bulk-add")).toBe("bulk-add");
    expect(parseMembersAction("find")).toBe("find");
  });
  it("ignores unknown, array and missing values", () => {
    expect(parseMembersAction("delete-everyone")).toBeNull();
    expect(parseMembersAction(["bulk-add"])).toBeNull();
    expect(parseMembersAction(undefined)).toBeNull();
    expect(parseMembersAction(null)).toBeNull();
  });
});

describe("defaultQuarterId", () => {
  it("prefers the active quarter", () => {
    expect(defaultQuarterId([{ id: "a", is_active: false }, { id: "b", is_active: true }])).toBe("b");
  });
  it("falls back to the first quarter when none is active", () => {
    expect(defaultQuarterId([{ id: "a", is_active: false }, { id: "b", is_active: false }])).toBe("a");
  });
  it("returns null when there are no quarters", () => {
    expect(defaultQuarterId([])).toBeNull();
  });
});
