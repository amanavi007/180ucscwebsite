import { describe, expect, it } from "vitest";
import {
  BIO_MAX,
  approvePending,
  formInitialValues,
  groupTeamMembers,
  isOwnedPhotoPath,
  memberSubtitle,
  normalizeLinkedinUrl,
  rejectPending,
  saveLive,
  sectionForRole,
  submitPending,
  teamPhotoUrl,
  validateSubmission,
  type PublicTeamMember,
  type TeamProfileRow,
  type ValidSubmission,
} from "./team-page";

const base: TeamProfileRow = {
  bio: null,
  linkedin_url: null,
  major: null,
  photo_path: null,
  listed: false,
  pending_bio: null,
  pending_linkedin_url: null,
  pending_major: null,
  pending_photo_path: null,
  pending_submitted_at: null,
};
const row = (o: Partial<TeamProfileRow> = {}): TeamProfileRow => ({ ...base, ...o });
const sub = (o: Partial<ValidSubmission> = {}): ValidSubmission => ({
  bio: "Hi",
  linkedinUrl: "https://linkedin.com/in/a",
  major: "Economics",
  photoPath: "u/new.jpg",
  ...o,
});
const NOW = "2026-10-02T00:00:00.000Z";

describe("normalizeLinkedinUrl", () => {
  it("keeps a clean https url", () => {
    expect(normalizeLinkedinUrl("https://www.linkedin.com/in/aman/")).toBe("https://www.linkedin.com/in/aman/");
  });
  it("adds a missing scheme, upgrades http, trims, drops the fragment", () => {
    expect(normalizeLinkedinUrl("  linkedin.com/in/aman  ")).toBe("https://linkedin.com/in/aman");
    expect(normalizeLinkedinUrl("http://linkedin.com/in/aman")).toBe("https://linkedin.com/in/aman");
    expect(normalizeLinkedinUrl("https://linkedin.com/in/aman#top")).toBe("https://linkedin.com/in/aman");
  });
  it("accepts a one-label subdomain", () => {
    expect(normalizeLinkedinUrl("https://uk.linkedin.com/in/x")).toBe("https://uk.linkedin.com/in/x");
  });
  it.each([
    "",
    "   ",
    "https://evil-linkedin.com/in/a",
    "https://linkedin.com.evil.com/in/a",
    "https://linkedin.com@evil.com/in/a",
    "javascript:alert(1)",
    "https://linkedin.com",
    "https://linkedin.com/",
    "not a url",
    "https://a.b.linkedin.com/in/x",
  ])("rejects %j", (input) => {
    expect(normalizeLinkedinUrl(input)).toBeNull();
  });
});

describe("validateSubmission", () => {
  const ok = { bio: "", linkedinUrl: "linkedin.com/in/a", major: " CS ", photoPath: "u/p.jpg" };
  it("normalizes and returns null for an empty bio", () => {
    expect(validateSubmission(ok)).toEqual({
      ok: true,
      value: { bio: null, linkedinUrl: "https://linkedin.com/in/a", major: "CS", photoPath: "u/p.jpg" },
    });
  });
  it("allows a bio of exactly BIO_MAX and rejects one more", () => {
    expect(validateSubmission({ ...ok, bio: "a".repeat(BIO_MAX) }).ok).toBe(true);
    expect(validateSubmission({ ...ok, bio: "a".repeat(BIO_MAX + 1) }).ok).toBe(false);
  });
  it("counts emoji as one character each", () => {
    expect(validateSubmission({ ...ok, bio: "😀".repeat(BIO_MAX) }).ok).toBe(true);
    expect(validateSubmission({ ...ok, bio: "😀".repeat(BIO_MAX + 1) }).ok).toBe(false);
  });
  it("requires major, linkedin and photo", () => {
    expect(validateSubmission({ ...ok, major: "  " })).toEqual({ ok: false, error: "Major is required." });
    expect(validateSubmission({ ...ok, linkedinUrl: "" })).toEqual({ ok: false, error: "LinkedIn is required." });
    expect(validateSubmission({ ...ok, linkedinUrl: "https://example.com/x" })).toEqual({
      ok: false,
      error: "Enter a valid linkedin.com profile link.",
    });
    expect(validateSubmission({ ...ok, photoPath: null })).toEqual({ ok: false, error: "A photo is required." });
  });
});

describe("isOwnedPhotoPath", () => {
  const owner = "11111111-1111-4111-8111-111111111111";
  const file = "22222222-2222-4222-8222-222222222222.jpg";
  it("accepts the owner's own folder", () => {
    expect(isOwnedPhotoPath(`${owner}/${file}`, owner)).toBe(true);
  });
  it("rejects another member's folder, traversal, nesting and other extensions", () => {
    expect(isOwnedPhotoPath(`33333333-3333-4333-8333-333333333333/${file}`, owner)).toBe(false);
    expect(isOwnedPhotoPath(`${owner}/../${file}`, owner)).toBe(false);
    expect(isOwnedPhotoPath(`${owner}/x/${file}`, owner)).toBe(false);
    expect(isOwnedPhotoPath(`${owner}/${file.replace(".jpg", ".png")}`, owner)).toBe(false);
    expect(isOwnedPhotoPath("", owner)).toBe(false);
  });
});

describe("submitPending", () => {
  it("first submission: creates an unlisted row with only pending fields", () => {
    const { row: r, deletePaths } = submitPending(null, sub(), NOW);
    expect(r.listed).toBe(false);
    expect(r.photo_path).toBeNull();
    expect(r.pending_photo_path).toBe("u/new.jpg");
    expect(r.pending_submitted_at).toBe(NOW);
    expect(deletePaths).toEqual([]);
  });
  it("bio-only edit keeps the live photo referenced and deletes nothing", () => {
    const before = row({ photo_path: "u/live.jpg", listed: true, major: "CS" });
    const { row: r, deletePaths } = submitPending(before, sub({ photoPath: "u/live.jpg" }), NOW);
    expect(r.photo_path).toBe("u/live.jpg");
    expect(r.pending_photo_path).toBe("u/live.jpg");
    expect(r.listed).toBe(true);
    expect(deletePaths).toEqual([]);
  });
  it("a second submission deletes the first pending photo but never the live one", () => {
    const before = row({ photo_path: "u/live.jpg", listed: true, pending_photo_path: "u/p1.jpg", pending_submitted_at: NOW });
    const { row: r, deletePaths } = submitPending(before, sub({ photoPath: "u/p2.jpg" }), NOW);
    expect(r.photo_path).toBe("u/live.jpg");
    expect(r.pending_photo_path).toBe("u/p2.jpg");
    expect(deletePaths).toEqual(["u/p1.jpg"]);
  });
});

describe("approvePending", () => {
  const pending = row({
    photo_path: "u/live.jpg",
    bio: "old",
    listed: false,
    pending_bio: "new",
    pending_linkedin_url: "https://linkedin.com/in/n",
    pending_major: "Math",
    pending_photo_path: "u/p.jpg",
    pending_submitted_at: NOW,
  });
  it("copies pending to live, clears pending, lists, deletes the superseded live photo", () => {
    const t = approvePending(pending)!;
    expect(t.row).toMatchObject({
      bio: "new",
      linkedin_url: "https://linkedin.com/in/n",
      major: "Math",
      photo_path: "u/p.jpg",
      listed: true,
      pending_bio: null,
      pending_linkedin_url: null,
      pending_major: null,
      pending_photo_path: null,
      pending_submitted_at: null,
    });
    expect(t.deletePaths).toEqual(["u/live.jpg"]);
  });
  it("bio-only approval (pending photo === live photo) deletes nothing", () => {
    const t = approvePending({ ...pending, pending_photo_path: "u/live.jpg" })!;
    expect(t.row.photo_path).toBe("u/live.jpg");
    expect(t.deletePaths).toEqual([]);
  });
  it("returns null when there is nothing pending", () => {
    expect(approvePending(row())).toBeNull();
    expect(approvePending(null)).toBeNull();
  });
});

describe("rejectPending", () => {
  it("deletes only the unapproved new photo", () => {
    const before = row({ photo_path: "u/live.jpg", listed: true, pending_photo_path: "u/p.jpg", pending_submitted_at: NOW, pending_bio: "x" });
    const t = rejectPending(before)!;
    expect(t.row.pending_submitted_at).toBeNull();
    expect(t.row.pending_bio).toBeNull();
    expect(t.row.photo_path).toBe("u/live.jpg");
    expect(t.row.listed).toBe(true);
    expect(t.deletePaths).toEqual(["u/p.jpg"]);
  });
  it("never deletes the live photo when the pending photo is the same object", () => {
    const before = row({ photo_path: "u/live.jpg", listed: true, pending_photo_path: "u/live.jpg", pending_submitted_at: NOW });
    expect(rejectPending(before)!.deletePaths).toEqual([]);
  });
  it("returns null when nothing is pending", () => {
    expect(rejectPending(row())).toBeNull();
  });
});

describe("saveLive (exec edit)", () => {
  it("new row is listed", () => {
    const t = saveLive(null, sub());
    expect(t.row.listed).toBe(true);
    expect(t.row.photo_path).toBe("u/new.jpg");
    expect(t.row.pending_submitted_at).toBeNull();
  });
  it("existing hidden row stays hidden; pending is cleared; replaced photos are deleted", () => {
    const before = row({ photo_path: "u/live.jpg", listed: false, pending_photo_path: "u/p.jpg", pending_submitted_at: NOW });
    const t = saveLive(before, sub({ photoPath: "u/exec.jpg" }));
    expect(t.row.listed).toBe(false);
    expect(t.row.pending_submitted_at).toBeNull();
    expect(t.deletePaths.sort()).toEqual(["u/live.jpg", "u/p.jpg"]);
  });
});

describe("formInitialValues", () => {
  it("prefers pending over live, falls back to profile linkedin, then empty", () => {
    expect(formInitialValues(null, "https://linkedin.com/in/z")).toEqual({
      bio: "",
      linkedinUrl: "https://linkedin.com/in/z",
      major: "",
      photoPath: null,
    });
    const r = row({ bio: "live", major: "A", photo_path: "u/l.jpg", pending_bio: "pend", pending_major: "B", pending_photo_path: "u/p.jpg", pending_linkedin_url: "https://linkedin.com/in/p", pending_submitted_at: NOW });
    expect(formInitialValues(r, null)).toEqual({ bio: "pend", linkedinUrl: "https://linkedin.com/in/p", major: "B", photoPath: "u/p.jpg" });
    expect(formInitialValues(row({ bio: "live", major: "A", photo_path: "u/l.jpg", linkedin_url: "https://linkedin.com/in/l" }), null)).toEqual({
      bio: "live",
      linkedinUrl: "https://linkedin.com/in/l",
      major: "A",
      photoPath: "u/l.jpg",
    });
  });
});

describe("sections and ordering", () => {
  const m = (name: string, role: PublicTeamMember["role"]): PublicTeamMember => ({
    id: name,
    name,
    role,
    bio: null,
    linkedinUrl: "https://linkedin.com/in/x",
    major: "CS",
    photoUrl: "https://x/y.jpg",
  });
  it("maps roles to sections", () => {
    expect(sectionForRole("president")).toBe("exec");
    expect(sectionForRole("director_of_marketing")).toBe("exec");
    expect(sectionForRole("project_manager")).toBe("project_manager");
    for (const r of ["senior_consultant", "consultant", "junior_consultant"] as const) {
      expect(sectionForRole(r)).toBe("consultant");
    }
  });
  it("orders the exec board by the fixed role order and the rest alphabetically", () => {
    const g = groupTeamMembers([
      m("Zed", "director_of_marketing"),
      m("Amy", "director_of_training"),
      m("Pat", "president"),
      m("Dee", "director_of_projects"),
      m("bob", "consultant"),
      m("Alice", "junior_consultant"),
      m("Cy", "senior_consultant"),
      m("Pm2", "project_manager"),
      m("Pm1", "project_manager"),
    ]);
    expect(g.exec.map((x) => x.name)).toEqual(["Pat", "Dee", "Amy", "Zed"]);
    expect(g.consultant.map((x) => x.name)).toEqual(["Alice", "bob", "Cy"]);
    expect(g.project_manager.map((x) => x.name)).toEqual(["Pm1", "Pm2"]);
  });
  it("returns empty arrays for empty sections", () => {
    expect(groupTeamMembers([])).toEqual({ exec: [], project_manager: [], consultant: [] });
  });
  it("subtitle is the role label for exec and the major otherwise", () => {
    expect(memberSubtitle("exec", m("A", "president"))).toBe("President");
    expect(memberSubtitle("consultant", m("A", "consultant"))).toBe("CS");
  });
});

describe("teamPhotoUrl", () => {
  it("builds the public storage url and tolerates a trailing slash", () => {
    expect(teamPhotoUrl("https://abc.supabase.co/", "u/p.jpg")).toBe(
      "https://abc.supabase.co/storage/v1/object/public/team-photos/u/p.jpg",
    );
  });
});
