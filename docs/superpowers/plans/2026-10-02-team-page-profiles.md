# Team Page Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let members submit their own photo/bio/LinkedIn/major from the portal, let execs approve them in one screen, and render the public `/team` page from the portal roster instead of hardcoded arrays.

**Architecture:** A new `team_profiles` table (live + `pending_*` columns, one row per member) holds only the self-supplied fields; name, role and section are joined from `profiles` at render time. All writes go through server actions that use the service-role client after checking the caller. All state transitions (submit / approve / reject / exec-save) are pure functions in `src/lib/team-page.ts` that also compute which storage objects became orphaned. Photos are cropped (fixed 4:5) and HEIC-converted in the browser, then uploaded as JPEG to a public `team-photos` Supabase bucket.

**Tech Stack:** Next.js 16.2 (App Router, read `node_modules/next/dist/docs/` before touching framework APIs), React 19, Supabase (Postgres + Storage + RLS), Tailwind 4, shadcn/Base UI components, Vitest, new deps `react-easy-crop` and `heic-to`.

**Spec:** `docs/superpowers/specs/2026-10-02-team-page-profiles-design.md`

## Global Constraints

- Bio max **120** characters, counted as Unicode code points (`Array.from(s).length`) so JS matches Postgres `char_length`. Major max 80. Photo, LinkedIn and major are **required**; bio is optional.
- LinkedIn must normalize to `https://linkedin.com/...` or `https://<one-label>.linkedin.com/...` with a non-empty path. Anything else is rejected (no `javascript:`, no lookalike domains).
- Photos: fixed **4:5** crop, output **800x1000 JPEG**, bucket `team-photos` (public, JPEG only, 1 MB max), object path `{profile_id}/{uuid}.jpg`. HEIC/HEIF accepted as input and converted in the browser; input cap 15 MB.
- Members never write to `team_profiles` directly: RLS has **no** write policies for `authenticated`; every write is a server action using `createAdminClient()` after an explicit caller check.
- Member edits go to `pending_*` only. Exec edits (including an exec editing their own profile) apply live. Hide and self-removal are instant. `listed` becomes true on approve, or when an exec's save creates the row; an exec save on an existing row leaves `listed` unchanged.
- The public page selects only `name, role, bio, linkedin_url, major, photo_path`, only for `listed = true` and `profiles.archived_at is null`.
- Follow existing code style: server actions in `src/actions/*.ts` returning `{ error?: string }`, `"use server"`, `revalidatePath`, `logAudit` for exec actions; UI built from `src/components/ui/*`; `sonner` toasts; `useTransition` + `router.refresh()`.
- Git: **no Co-Authored-By / Claude attribution in commits** (project memory rule). Stage only the files named in each task; `package-lock.json` already has one unrelated pending change from the user, so only stage it in Task 4 where dependencies change.
- Pushing the migration to the hosted Supabase project is outward-facing: **ask the user before running `supabase db push`**.

## Review Focus

1. A member edits only their bio while a live photo exists (form carries the live path as the pending path): reject and approve must **never delete the live photo**. (Task 1 tests)
2. A member submits twice before an exec acts: the first pending photo is deleted, the live photo is untouched. (Task 1 tests)
3. A listed member who is archived must vanish from `/team`, and reappear if restored. (Task 3 data filter + Task 8 manual check)
4. A caller passes another member's photo path (or `../` tricks) to `saveTeamProfile`: rejected. (Task 1 `isOwnedPhotoPath` tests)
5. LinkedIn inputs a person would actually paste: no scheme, `http://`, trailing space, tracking `#fragment`, lookalike `evil-linkedin.com`, `linkedin.com.evil.com`, `javascript:`. (Task 1 tests)
6. Bio of exactly 120 characters, 121 characters, and 120 emoji code points. (Task 1 tests)
7. Zero listed members in a section: the public page shows the "coming soon" line, not an empty grid. (Task 7)

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/team-page.ts` (new) | Pure logic: validation, LinkedIn normalization, path ownership, state transitions + orphan computation, grouping/ordering, form initial values, photo URL |
| `src/lib/team-page.test.ts` (new) | Vitest tests for the above |
| `supabase/migrations/20261002000001_team_profiles.sql` (new) | Table, RLS, trigger, storage bucket + policy |
| `src/lib/supabase/database.types.ts` (modify) | Add `team_profiles` types |
| `src/lib/audit-labels.ts` (modify) | Labels for new audit actions |
| `next.config.ts` (modify) | `images.remotePatterns` for the Supabase bucket |
| `src/lib/data/team-page.ts` (new) | Server reads: public members, my row, admin roster, pending count |
| `src/actions/team-profiles.ts` (new) | Server actions: save / approve / reject / approveAll / setListed / removeMyListing |
| `src/lib/supabase/client.ts` (new) | Browser Supabase client (needed for direct photo upload) |
| `src/components/team/crop-image.ts` (new) | Canvas crop to 800x1000 JPEG |
| `src/components/team/photo-field.tsx` (new) | File pick, HEIC convert, crop dialog, upload |
| `src/components/team/team-profile-form.tsx` (new) | Shared form (member + exec modes) and `RemoveListingButton` |
| `src/app/portal/(app)/profile/page.tsx` (new) | Member "My public profile" page |
| `src/components/layout/nav-links.ts` (modify) | Sidebar + admin nav entries |
| `src/app/portal/(app)/admin/team-page/page.tsx` (new) | Exec page (server) |
| `src/app/portal/(app)/admin/team-page/team-page-panel.tsx` (new) | Pending queue + roster (client) |
| `src/app/portal/(app)/admin/admin-nav.tsx`, `admin/layout.tsx` (modify) | Pending-count badge |
| `src/components/marketing/team-member-card.tsx` (new) | Public card w/ tap-safe overlay incl. bio |
| `src/app/(marketing)/team/page.tsx` (modify) | Render from DB |

---

### Task 1: Pure team-page logic (TDD)

**Files:**
- Create: `src/lib/team-page.ts`
- Test: `src/lib/team-page.test.ts`

**Interfaces:**
- Produces (all exported from `src/lib/team-page.ts`):
  - consts `BIO_MAX = 120`, `MAJOR_MAX = 80`, `TEAM_PHOTO_BUCKET = "team-photos"`
  - `normalizeLinkedinUrl(input: string): string | null`
  - `interface SubmissionInput { bio: string; linkedinUrl: string; major: string; photoPath: string | null }`
  - `interface ValidSubmission { bio: string | null; linkedinUrl: string; major: string; photoPath: string }`
  - `validateSubmission(input: SubmissionInput): { ok: true; value: ValidSubmission } | { ok: false; error: string }`
  - `isOwnedPhotoPath(path: string, ownerId: string): boolean`
  - `interface TeamProfileRow` (snake_case columns: `bio, linkedin_url, major, photo_path, listed, pending_bio, pending_linkedin_url, pending_major, pending_photo_path, pending_submitted_at`)
  - `hasPending(row: TeamProfileRow | null): boolean`
  - `interface Transition { row: TeamProfileRow; deletePaths: string[] }`
  - `submitPending(before: TeamProfileRow | null, v: ValidSubmission, now: string): Transition`
  - `saveLive(before: TeamProfileRow | null, v: ValidSubmission): Transition`
  - `approvePending(before: TeamProfileRow | null): Transition | null`
  - `rejectPending(before: TeamProfileRow | null): Transition | null`
  - `formInitialValues(row: TeamProfileRow | null, profileLinkedin: string | null): { bio: string; linkedinUrl: string; major: string; photoPath: string | null }`
  - `type TeamSection = "exec" | "project_manager" | "consultant"`, `sectionForRole(role: UserRole): TeamSection`
  - `interface PublicTeamMember { id: string; name: string; role: UserRole; bio: string | null; linkedinUrl: string; major: string; photoUrl: string }`
  - `groupTeamMembers(members: PublicTeamMember[]): Record<TeamSection, PublicTeamMember[]>`
  - `memberSubtitle(section: TeamSection, m: PublicTeamMember): string`
  - `teamPhotoUrl(supabaseUrl: string, path: string): string`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/team-page.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/team-page.test.ts`
Expected: FAIL (`Failed to resolve import "./team-page"`).

- [ ] **Step 3: Implement `src/lib/team-page.ts`**

```ts
import type { UserRole } from "./supabase/database.types";
import { EXEC_ROLES, roleLabel } from "./auth/roles";

export const BIO_MAX = 120;
export const MAJOR_MAX = 80;
export const TEAM_PHOTO_BUCKET = "team-photos";

const codePoints = (s: string) => Array.from(s).length;

// ---------- validation ----------

const LINKEDIN_HOST = /^([a-z0-9-]+\.)?linkedin\.com$/;

/** Returns a canonical https linkedin.com URL, or null if the input isn't one. */
export function normalizeLinkedinUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let candidate: string;
  if (/^https?:\/\//i.test(trimmed)) candidate = trimmed;
  else if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null; // javascript:, mailto:, host:port ...
  else candidate = `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (!LINKEDIN_HOST.test(url.hostname.toLowerCase())) return null;
  if (url.pathname.replace(/\/+$/, "") === "") return null;
  url.protocol = "https:";
  url.username = "";
  url.password = "";
  url.hash = "";
  return url.toString();
}

export interface SubmissionInput {
  bio: string;
  linkedinUrl: string;
  major: string;
  photoPath: string | null;
}
export interface ValidSubmission {
  bio: string | null;
  linkedinUrl: string;
  major: string;
  photoPath: string;
}
export type ValidationResult = { ok: true; value: ValidSubmission } | { ok: false; error: string };

export function validateSubmission(input: SubmissionInput): ValidationResult {
  const fail = (error: string): ValidationResult => ({ ok: false, error });
  if (!input.photoPath) return fail("A photo is required.");
  const major = input.major.trim();
  if (!major) return fail("Major is required.");
  if (codePoints(major) > 80) return fail("Major must be 80 characters or fewer.");
  if (!input.linkedinUrl.trim()) return fail("LinkedIn is required.");
  const linkedinUrl = normalizeLinkedinUrl(input.linkedinUrl);
  if (!linkedinUrl) return fail("Enter a valid linkedin.com profile link.");
  const bio = input.bio.trim();
  if (codePoints(bio) > BIO_MAX) return fail(`Bio must be ${BIO_MAX} characters or fewer.`);
  return { ok: true, value: { bio: bio || null, linkedinUrl, major, photoPath: input.photoPath } };
}

const PHOTO_PATH = /^([0-9a-f-]{36})\/[0-9a-f-]{36}\.jpg$/;

/** True only for `{ownerId}/{uuid}.jpg` -- blocks other members' folders and path tricks. */
export function isOwnedPhotoPath(path: string, ownerId: string): boolean {
  const match = PHOTO_PATH.exec(path);
  return !!match && match[1] === ownerId.toLowerCase();
}

// ---------- state transitions ----------

export interface TeamProfileRow {
  bio: string | null;
  linkedin_url: string | null;
  major: string | null;
  photo_path: string | null;
  listed: boolean;
  pending_bio: string | null;
  pending_linkedin_url: string | null;
  pending_major: string | null;
  pending_photo_path: string | null;
  pending_submitted_at: string | null;
}

export interface Transition {
  row: TeamProfileRow;
  /** Storage objects no longer referenced by the new row -- safe to delete. */
  deletePaths: string[];
}

const EMPTY_PENDING = {
  pending_bio: null,
  pending_linkedin_url: null,
  pending_major: null,
  pending_photo_path: null,
  pending_submitted_at: null,
} as const;

const EMPTY_ROW: TeamProfileRow = {
  bio: null,
  linkedin_url: null,
  major: null,
  photo_path: null,
  listed: false,
  ...EMPTY_PENDING,
};

export function hasPending(row: TeamProfileRow | null): boolean {
  return !!row && row.pending_submitted_at !== null;
}

function referencedPhotos(row: TeamProfileRow | null): Set<string> {
  const set = new Set<string>();
  if (row?.photo_path) set.add(row.photo_path);
  if (row?.pending_photo_path) set.add(row.pending_photo_path);
  return set;
}

function transition(before: TeamProfileRow | null, after: TeamProfileRow): Transition {
  const keep = referencedPhotos(after);
  return { row: after, deletePaths: [...referencedPhotos(before)].filter((p) => !keep.has(p)) };
}

/** Member edit: lands in the pending slot (replacing any earlier pending submission). */
export function submitPending(before: TeamProfileRow | null, v: ValidSubmission, now: string): Transition {
  return transition(before, {
    ...(before ?? EMPTY_ROW),
    pending_bio: v.bio,
    pending_linkedin_url: v.linkedinUrl,
    pending_major: v.major,
    pending_photo_path: v.photoPath,
    pending_submitted_at: now,
  });
}

/** Exec edit: applies live and clears any pending slot. Only a brand-new row starts listed. */
export function saveLive(before: TeamProfileRow | null, v: ValidSubmission): Transition {
  return transition(before, {
    bio: v.bio,
    linkedin_url: v.linkedinUrl,
    major: v.major,
    photo_path: v.photoPath,
    listed: before ? before.listed : true,
    ...EMPTY_PENDING,
  });
}

export function approvePending(before: TeamProfileRow | null): Transition | null {
  if (!before || !hasPending(before)) return null;
  return transition(before, {
    bio: before.pending_bio,
    linkedin_url: before.pending_linkedin_url,
    major: before.pending_major,
    photo_path: before.pending_photo_path,
    listed: true,
    ...EMPTY_PENDING,
  });
}

export function rejectPending(before: TeamProfileRow | null): Transition | null {
  if (!before || !hasPending(before)) return null;
  return transition(before, { ...before, ...EMPTY_PENDING });
}

/** What the edit form should start with: pending if there is one, else live, else the profile's alumni linkedin. */
export function formInitialValues(row: TeamProfileRow | null, profileLinkedin: string | null) {
  const pending = hasPending(row);
  return {
    bio: (pending ? row!.pending_bio : row?.bio) ?? "",
    linkedinUrl: (pending ? row!.pending_linkedin_url : row?.linkedin_url) ?? profileLinkedin ?? "",
    major: (pending ? row!.pending_major : row?.major) ?? "",
    photoPath: (pending ? row!.pending_photo_path : row?.photo_path) ?? null,
  };
}

// ---------- public page ----------

export type TeamSection = "exec" | "project_manager" | "consultant";

export function sectionForRole(role: UserRole): TeamSection {
  if (EXEC_ROLES.includes(role)) return "exec";
  if (role === "project_manager") return "project_manager";
  return "consultant";
}

const EXEC_DISPLAY_ORDER: UserRole[] = [
  "president",
  "director_of_projects",
  "director_of_internal_affairs",
  "director_of_external_affairs",
  "director_of_training",
  "director_of_marketing",
];

export interface PublicTeamMember {
  id: string;
  name: string;
  role: UserRole;
  bio: string | null;
  linkedinUrl: string;
  major: string;
  photoUrl: string;
}

export function groupTeamMembers(members: PublicTeamMember[]): Record<TeamSection, PublicTeamMember[]> {
  const out: Record<TeamSection, PublicTeamMember[]> = { exec: [], project_manager: [], consultant: [] };
  for (const m of members) out[sectionForRole(m.role)].push(m);
  const byName = (a: PublicTeamMember, b: PublicTeamMember) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  out.exec.sort((a, b) => EXEC_DISPLAY_ORDER.indexOf(a.role) - EXEC_DISPLAY_ORDER.indexOf(b.role) || byName(a, b));
  out.project_manager.sort(byName);
  out.consultant.sort(byName);
  return out;
}

export function memberSubtitle(section: TeamSection, m: PublicTeamMember): string {
  return section === "exec" ? roleLabel(m.role) : m.major;
}

export function teamPhotoUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${TEAM_PHOTO_BUCKET}/${path}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/team-page.test.ts`
Expected: all PASS. If `localeCompare` ordering of `"bob"` vs `"Alice"`/`"Cy"` fails, the cause is the comparator options -- keep `sensitivity: "base"`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/team-page.ts src/lib/team-page.test.ts
git commit -m "Team page: pure validation, state transitions and grouping logic"
```

---

### Task 2: Database migration, types, audit labels, image config

**Files:**
- Create: `supabase/migrations/20261002000001_team_profiles.sql`
- Modify: `src/lib/supabase/database.types.ts` (add `team_profiles` next to `team_plan_teams`, ~line 548)
- Modify: `src/lib/audit-labels.ts`
- Modify: `next.config.ts`

**Interfaces:**
- Produces: table `public.team_profiles` (columns as in Task 1's `TeamProfileRow` plus `profile_id`, `updated_at`); typed access via `Database["public"]["Tables"]["team_profiles"]`; audit action keys `team_page.approved`, `team_page.approved_all`, `team_page.rejected`, `team_page.hidden`, `team_page.shown`, `team_page.edited`.

- [ ] **Step 1: Write the migration**

```sql
-- Public Team page profiles. Name/role/section come from `profiles` at render
-- time; this table holds only what members supply themselves. Member edits
-- land in the pending_* columns and go live only when an exec approves.
-- No write policies for `authenticated`: every write goes through a server
-- action using the service-role client after an explicit caller check.

create table public.team_profiles (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  bio text check (bio is null or char_length(bio) <= 120),
  linkedin_url text check (linkedin_url is null or linkedin_url ~* '^https://([a-z0-9-]+\.)?linkedin\.com/.+'),
  major text check (major is null or char_length(major) <= 80),
  photo_path text,
  listed boolean not null default false,
  pending_bio text check (pending_bio is null or char_length(pending_bio) <= 120),
  pending_linkedin_url text check (pending_linkedin_url is null or pending_linkedin_url ~* '^https://([a-z0-9-]+\.)?linkedin\.com/.+'),
  pending_major text check (pending_major is null or char_length(pending_major) <= 80),
  pending_photo_path text,
  pending_submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  check (pending_submitted_at is null or pending_photo_path is not null)
);

alter table public.team_profiles enable row level security;

create policy team_profiles_select on public.team_profiles
  for select to authenticated
  using (profile_id = auth.uid() or public.is_exec());

create trigger team_profiles_set_updated_at
  before update on public.team_profiles
  for each row execute function public.set_updated_at();

-- Public bucket: JPEG only, 1 MB. Members may upload only under their own
-- folder; execs may upload for anyone (editing on a member's behalf).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-photos', 'team-photos', true, 1048576, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy team_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'team-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_exec())
  );
```

- [ ] **Step 2: Add types to `database.types.ts`**

Insert after the `team_plan_teams` block (before `team_plan_placements`):

```ts
      team_profiles: {
        Row: {
          profile_id: string;
          bio: string | null;
          linkedin_url: string | null;
          major: string | null;
          photo_path: string | null;
          listed: boolean;
          pending_bio: string | null;
          pending_linkedin_url: string | null;
          pending_major: string | null;
          pending_photo_path: string | null;
          pending_submitted_at: string | null;
          updated_at: string;
        };
        Insert: {
          profile_id: string;
          bio?: string | null;
          linkedin_url?: string | null;
          major?: string | null;
          photo_path?: string | null;
          listed?: boolean;
          pending_bio?: string | null;
          pending_linkedin_url?: string | null;
          pending_major?: string | null;
          pending_photo_path?: string | null;
          pending_submitted_at?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["team_profiles"]["Insert"]>;
        Relationships: [];
      };
```

- [ ] **Step 3: Audit labels** -- add to `AUDIT_ACTION_LABELS` in `src/lib/audit-labels.ts`:

```ts
  "team_page.approved": "Approved team page profile",
  "team_page.approved_all": "Approved all pending team page profiles",
  "team_page.rejected": "Rejected team page profile",
  "team_page.hidden": "Hid member from team page",
  "team_page.shown": "Showed member on team page",
  "team_page.edited": "Edited team page profile",
```

- [ ] **Step 4: Image config** -- read `node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md` (`remotePatterns`), then update `next.config.ts`:

```ts
import type { NextConfig } from "next";
import path from "path";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  images: {
    // Team page photos live in the public `team-photos` Supabase bucket.
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/team-photos/**" }]
      : [],
  },
};

export default nextConfig;
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Apply the migration (ask first)**

Tell the user the migration is ready and ask permission before pushing to the hosted project. If approved and the CLI is linked: `npx supabase db push`. Otherwise give them the SQL file to run in the Supabase SQL editor. Confirm with: `select count(*) from public.team_profiles;` (expect 0) and that bucket `team-photos` exists and is public.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261002000001_team_profiles.sql src/lib/supabase/database.types.ts src/lib/audit-labels.ts next.config.ts
git commit -m "Team page: team_profiles table, photo bucket, image config"
```

---

### Task 3: Data layer and server actions

**Files:**
- Create: `src/lib/data/team-page.ts`
- Create: `src/actions/team-profiles.ts`

**Interfaces:**
- Consumes: everything exported by `src/lib/team-page.ts` (Task 1); `createAdminClient()` (`src/lib/supabase/admin.ts`); `createClient()` (`src/lib/supabase/server.ts`); `getCurrentProfile()`; `isExec`; `logAudit`.
- Produces from `src/lib/data/team-page.ts`:
  - `getPublicTeamMembers(): Promise<PublicTeamMember[]>`
  - `getMyTeamProfileRow(profileId: string): Promise<TeamProfileRow | null>`
  - `interface TeamPageAdminRow { id: string; name: string; role: UserRole; profileLinkedin: string | null; row: TeamProfileRow | null }`
  - `getTeamPageAdminRows(): Promise<TeamPageAdminRow[]>`
  - `getPendingTeamSubmissionCount(): Promise<number>`
- Produces from `src/actions/team-profiles.ts` (all `Promise<{ error?: string }>`):
  - `saveTeamProfile(targetId: string, input: SubmissionInput)`
  - `approveSubmission(profileId: string)`, `rejectSubmission(profileId: string)`, `approveAll()`
  - `setListed(profileId: string, listed: boolean)`, `removeMyListing()`

- [ ] **Step 1: Write `src/lib/data/team-page.ts`**

```ts
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/supabase/database.types";
import { teamPhotoUrl, type PublicTeamMember, type TeamProfileRow } from "@/lib/team-page";

const ROW_COLUMNS =
  "bio, linkedin_url, major, photo_path, listed, pending_bio, pending_linkedin_url, pending_major, pending_photo_path, pending_submitted_at";

/**
 * Public team page source. Uses the service-role client so the table needs no
 * public RLS policy, and selects only the public columns. Never throws: a
 * failure here must not take the marketing page down.
 */
export async function getPublicTeamMembers(): Promise<PublicTeamMember[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("team_profiles")
      .select("profile_id, bio, linkedin_url, major, photo_path, profile:profiles(name, role, archived_at)")
      .eq("listed", true);
    if (error) throw error;

    const rows = data as unknown as {
      profile_id: string;
      bio: string | null;
      linkedin_url: string | null;
      major: string | null;
      photo_path: string | null;
      profile: { name: string; role: UserRole; archived_at: string | null } | null;
    }[];
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;

    return rows
      .filter((r) => r.profile && !r.profile.archived_at && r.photo_path && r.linkedin_url && r.major)
      .map((r) => ({
        id: r.profile_id,
        name: r.profile!.name,
        role: r.profile!.role,
        bio: r.bio,
        linkedinUrl: r.linkedin_url!,
        major: r.major!,
        photoUrl: teamPhotoUrl(base, r.photo_path!),
      }));
  } catch (err) {
    console.error("getPublicTeamMembers failed:", err);
    return [];
  }
}

export async function getMyTeamProfileRow(profileId: string): Promise<TeamProfileRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_profiles")
    .select(ROW_COLUMNS)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface TeamPageAdminRow {
  id: string;
  name: string;
  role: UserRole;
  profileLinkedin: string | null;
  row: TeamProfileRow | null;
}

/** Exec-only (RLS lets execs read every team_profiles row). One entry per active member. */
export async function getTeamPageAdminRows(): Promise<TeamPageAdminRow[]> {
  const supabase = await createClient();
  const [profilesRes, rowsRes] = await Promise.all([
    supabase.from("profiles").select("id, name, role, linkedin_url").is("archived_at", null).order("name"),
    supabase.from("team_profiles").select(`profile_id, ${ROW_COLUMNS}`),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  if (rowsRes.error) throw rowsRes.error;

  const byId = new Map(rowsRes.data.map(({ profile_id, ...row }) => [profile_id, row as TeamProfileRow]));
  return profilesRes.data.map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    profileLinkedin: p.linkedin_url,
    row: byId.get(p.id) ?? null,
  }));
}

export async function getPendingTeamSubmissionCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("team_profiles")
    .select("profile_id", { count: "exact", head: true })
    .not("pending_submitted_at", "is", null);
  if (error) throw error;
  return count ?? 0;
}
```

- [ ] **Step 2: Write `src/actions/team-profiles.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import {
  TEAM_PHOTO_BUCKET,
  approvePending,
  isOwnedPhotoPath,
  rejectPending,
  saveLive,
  submitPending,
  validateSubmission,
  type SubmissionInput,
  type TeamProfileRow,
  type Transition,
} from "@/lib/team-page";

export interface ActionResult {
  error?: string;
}

type Admin = ReturnType<typeof createAdminClient>;

const ROW_COLUMNS =
  "bio, linkedin_url, major, photo_path, listed, pending_bio, pending_linkedin_url, pending_major, pending_photo_path, pending_submitted_at";

async function requireExec() {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) return { error: "Only exec can do that." } as const;
  return { error: undefined, profile } as const;
}

async function loadRow(admin: Admin, profileId: string): Promise<TeamProfileRow | null> {
  const { data, error } = await admin
    .from("team_profiles")
    .select(ROW_COLUMNS)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Writes the new row, then best-effort deletes storage objects the row no longer references. */
async function persist(admin: Admin, profileId: string, t: Transition): Promise<string | undefined> {
  const { error } = await admin.from("team_profiles").upsert({ profile_id: profileId, ...t.row });
  if (error) return error.message;
  if (t.deletePaths.length > 0) {
    const { error: removeError } = await admin.storage.from(TEAM_PHOTO_BUCKET).remove(t.deletePaths);
    if (removeError) console.error("team photo cleanup failed:", removeError.message);
  }
  return undefined;
}

async function nameOf(admin: Admin, profileId: string): Promise<string> {
  const { data } = await admin.from("profiles").select("name").eq("id", profileId).maybeSingle();
  return data?.name ?? "Unknown member";
}

function revalidateTeam() {
  revalidatePath("/team");
  revalidatePath("/portal/profile");
  revalidatePath("/portal/admin", "layout");
}

/** Member -> their own pending slot. Exec -> live (their own or anyone's). */
export async function saveTeamProfile(targetId: string, input: SubmissionInput): Promise<ActionResult> {
  const caller = await getCurrentProfile();
  const callerIsExec = isExec(caller.role);
  if (targetId !== caller.id && !callerIsExec) return { error: "You can only edit your own profile." };

  const result = validateSubmission(input);
  if (!result.ok) return { error: result.error };
  if (!isOwnedPhotoPath(result.value.photoPath, targetId)) {
    return { error: "That photo is invalid. Please upload it again." };
  }

  const admin = createAdminClient();
  const before = await loadRow(admin, targetId);
  const t = callerIsExec
    ? saveLive(before, result.value)
    : submitPending(before, result.value, new Date().toISOString());

  const error = await persist(admin, targetId, t);
  if (error) return { error };

  if (callerIsExec) await logAudit(caller.id, "team_page.edited", await nameOf(admin, targetId));
  revalidateTeam();
  return {};
}

export async function approveSubmission(profileId: string): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };

  const admin = createAdminClient();
  const t = approvePending(await loadRow(admin, profileId));
  if (!t) return { error: "There is nothing to approve for this member." };

  const error = await persist(admin, profileId, t);
  if (error) return { error };

  await logAudit(denied.profile.id, "team_page.approved", await nameOf(admin, profileId));
  revalidateTeam();
  return {};
}

export async function rejectSubmission(profileId: string): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };

  const admin = createAdminClient();
  const t = rejectPending(await loadRow(admin, profileId));
  if (!t) return { error: "There is nothing to reject for this member." };

  const error = await persist(admin, profileId, t);
  if (error) return { error };

  await logAudit(denied.profile.id, "team_page.rejected", await nameOf(admin, profileId));
  revalidateTeam();
  return {};
}

export async function approveAll(): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("team_profiles")
    .select("profile_id")
    .not("pending_submitted_at", "is", null);
  if (error) return { error: error.message };

  let approved = 0;
  for (const { profile_id } of data) {
    const t = approvePending(await loadRow(admin, profile_id));
    if (!t) continue;
    const persistError = await persist(admin, profile_id, t);
    if (persistError) return { error: persistError };
    approved += 1;
  }

  await logAudit(denied.profile.id, "team_page.approved_all", `${approved} profile(s)`);
  revalidateTeam();
  return {};
}

export async function setListed(profileId: string, listed: boolean): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };

  const admin = createAdminClient();
  const before = await loadRow(admin, profileId);
  if (!before) return { error: "This member has no team page profile yet." };
  if (listed && !before.photo_path) return { error: "Approve or add a profile before showing this member." };

  const { error } = await admin.from("team_profiles").update({ listed }).eq("profile_id", profileId);
  if (error) return { error: error.message };

  await logAudit(denied.profile.id, listed ? "team_page.shown" : "team_page.hidden", await nameOf(admin, profileId));
  revalidateTeam();
  return {};
}

/** A member pulling themselves off the page. Instant, no approval. */
export async function removeMyListing(): Promise<ActionResult> {
  const caller = await getCurrentProfile();
  const admin = createAdminClient();
  const { error } = await admin.from("team_profiles").update({ listed: false }).eq("profile_id", caller.id);
  if (error) return { error: error.message };
  revalidateTeam();
  return {};
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/lib/data/team-page.ts src/actions/team-profiles.ts`
Expected: clean. If `.select(ROW_COLUMNS)` loses its row type because the column list is a `string` (not a literal), declare `const ROW_COLUMNS = "..." as const;` in both files, or cast the result `as TeamProfileRow | null`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/team-page.ts src/actions/team-profiles.ts
git commit -m "Team page: data reads and server actions"
```

---

### Task 4: Photo uploader (crop, zoom, HEIC)

**Files:**
- Modify: `package.json`, `package-lock.json` (new deps)
- Create: `src/lib/supabase/client.ts`
- Create: `src/components/team/crop-image.ts`
- Create: `src/components/team/photo-field.tsx`

**Interfaces:**
- Consumes: `TEAM_PHOTO_BUCKET`, `teamPhotoUrl` (Task 1).
- Produces:
  - `createClient()` from `src/lib/supabase/client.ts` (browser Supabase client)
  - `loadImage(src: string): Promise<HTMLImageElement>` and `cropToJpeg(src: string, area: { x: number; y: number; width: number; height: number }): Promise<Blob>` from `crop-image.ts`
  - `<PhotoField ownerId={string} value={string | null} onChange={(path: string) => void} disabled?={boolean} />` -- `ownerId` is the profile whose folder the file is uploaded into; `value` is the object path.

- [ ] **Step 1: Install dependencies**

Run: `npm install react-easy-crop heic-to`
Then read `node_modules/heic-to/README.md` and confirm the named export `heicTo({ blob, type, quality })` returns a `Promise<Blob>`. If the API differs, adapt Step 4's conversion call; if the package fails to bundle under Turbopack (see Step 6), fall back to `heic2any` (`heic2any({ blob, toType: "image/jpeg", quality: 0.9 })`, result may be `Blob | Blob[]`).
Note: `package-lock.json` already contains one unrelated user change; it will be staged with this commit, that's fine.

- [ ] **Step 2: Browser Supabase client** -- `src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 3: Crop helper** -- `src/components/team/crop-image.ts`:

```ts
export const OUTPUT_WIDTH = 800;
export const OUTPUT_HEIGHT = 1000;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read image"));
    image.src = src;
  });
}

/** Renders the selected 4:5 region to an 800x1000 JPEG. */
export async function cropToJpeg(
  src: string,
  area: { x: number; y: number; width: number; height: number },
): Promise<Blob> {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_WIDTH;
  canvas.height = OUTPUT_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode photo"))), "image/jpeg", 0.85);
  });
}
```

- [ ] **Step 4: `PhotoField`** -- `src/components/team/photo-field.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { toast } from "sonner";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { TEAM_PHOTO_BUCKET, teamPhotoUrl } from "@/lib/team-page";
import { cropToJpeg, loadImage } from "./crop-image";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
const MAX_INPUT_BYTES = 15 * 1024 * 1024;

function isHeic(file: File) {
  return /\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/i.test(file.type);
}

export function PhotoField({
  ownerId,
  value,
  onChange,
  disabled,
}: {
  ownerId: string;
  value: string | null;
  onChange: (path: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState<"reading" | "uploading" | null>(null);

  function closeCropper() {
    if (src) URL.revokeObjectURL(src);
    setSrc(null);
    setArea(null);
  }

  async function handleFile(file: File) {
    if (file.size > MAX_INPUT_BYTES) {
      toast.error("That photo is over 15 MB.");
      return;
    }
    setBusy("reading");
    try {
      let blob: Blob = file;
      if (isHeic(file)) {
        const { heicTo } = await import("heic-to");
        blob = await heicTo({ blob: file, type: "image/jpeg", quality: 0.9 });
      }
      const url = URL.createObjectURL(blob);
      try {
        await loadImage(url); // fails fast on files the browser can't decode
      } catch (err) {
        URL.revokeObjectURL(url);
        throw err;
      }
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setSrc(url);
    } catch {
      toast.error("Couldn't read this photo. Try exporting it as a JPG.");
    } finally {
      setBusy(null);
    }
  }

  async function confirmCrop() {
    if (!src || !area) return;
    setBusy("uploading");
    try {
      const blob = await cropToJpeg(src, area);
      const path = `${ownerId}/${crypto.randomUUID()}.jpg`;
      const { error } = await createClient()
        .storage.from(TEAM_PHOTO_BUCKET)
        .upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw error;
      onChange(path);
      closeCropper();
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative aspect-[4/5] w-28 shrink-0 overflow-hidden rounded-xl bg-muted">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- preview of a just-uploaded file; no optimizer needed
          <img src={teamPhotoUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!, value)} alt="Your photo" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-muted-foreground">
            <Camera className="size-6" aria-hidden />
          </div>
        )}
      </div>
      <div className="space-y-1">
        <Button type="button" variant="outline" size="sm" disabled={disabled || busy !== null} onClick={() => inputRef.current?.click()}>
          {busy === "reading" ? "Reading photo..." : value ? "Change photo" : "Upload photo"}
        </Button>
        <p className="text-xs text-muted-foreground">JPG, PNG, WebP or HEIC. You can zoom and crop next.</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // allow re-picking the same file
            if (file) void handleFile(file);
          }}
        />
      </div>

      <Dialog open={!!src} onOpenChange={(open) => !open && busy !== "uploading" && closeCropper()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crop your photo</DialogTitle>
          </DialogHeader>
          <div className="relative h-80 w-full overflow-hidden rounded-lg bg-black">
            {src && (
              <Cropper
                image={src}
                crop={crop}
                zoom={zoom}
                aspect={4 / 5}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, pixels) => setArea(pixels)}
              />
            )}
          </div>
          <label className="flex items-center gap-3 text-sm">
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1"
              aria-label="Zoom"
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy === "uploading"} onClick={closeCropper}>
              Cancel
            </Button>
            <Button type="button" disabled={!area || busy === "uploading"} onClick={confirmCrop}>
              {busy === "uploading" ? "Uploading..." : "Use photo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/team src/lib/supabase/client.ts`
Expected: clean.

- [ ] **Step 6: Build check for the HEIC library**

Run: `npm run build`
Expected: succeeds. If Turbopack fails to bundle `heic-to`, switch to `heic2any` per Step 1 and rebuild. (Real-file HEIC verification happens in Task 8.)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/supabase/client.ts src/components/team/crop-image.ts src/components/team/photo-field.tsx
git commit -m "Team page: photo uploader with crop, zoom and HEIC support"
```

---

### Task 5: Member "My public profile" page

**Files:**
- Create: `src/components/team/team-profile-form.tsx`
- Create: `src/app/portal/(app)/profile/page.tsx`
- Modify: `src/components/layout/nav-links.ts`

**Interfaces:**
- Consumes: `PhotoField` (Task 4), `saveTeamProfile` / `removeMyListing` (Task 3), `getMyTeamProfileRow` (Task 3), `formInitialValues`, `validateSubmission`, `BIO_MAX` (Task 1).
- Produces:
  - `<TeamProfileForm targetId={string} mode={"member" | "exec"} initial={{ bio: string; linkedinUrl: string; major: string; photoPath: string | null }} onSaved?={() => void} />`
  - `<RemoveListingButton />`

- [ ] **Step 1: Form component** -- `src/components/team/team-profile-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { removeMyListing, saveTeamProfile } from "@/actions/team-profiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { BIO_MAX, validateSubmission } from "@/lib/team-page";
import { PhotoField } from "./photo-field";

export interface TeamProfileFormValues {
  bio: string;
  linkedinUrl: string;
  major: string;
  photoPath: string | null;
}

export function TeamProfileForm({
  targetId,
  mode,
  initial,
  onSaved,
}: {
  targetId: string;
  mode: "member" | "exec";
  initial: TeamProfileFormValues;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const bioLength = Array.from(values.bio).length;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const check = validateSubmission(values);
    if (!check.ok) {
      toast.error(check.error);
      return;
    }
    startTransition(async () => {
      const result = await saveTeamProfile(targetId, values);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(mode === "member" ? "Submitted for review." : "Saved.");
      onSaved?.();
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel>Photo</FieldLabel>
          <PhotoField
            ownerId={targetId}
            value={values.photoPath}
            onChange={(photoPath) => setValues((v) => ({ ...v, photoPath }))}
            disabled={isPending}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="tp-major">Major</FieldLabel>
          <Input id="tp-major" value={values.major} maxLength={80} placeholder="Business Economics" onChange={(e) => setValues((v) => ({ ...v, major: e.target.value }))} />
        </Field>
        <Field>
          <FieldLabel htmlFor="tp-linkedin">LinkedIn</FieldLabel>
          <Input id="tp-linkedin" value={values.linkedinUrl} placeholder="linkedin.com/in/your-name" onChange={(e) => setValues((v) => ({ ...v, linkedinUrl: e.target.value }))} />
        </Field>
        <Field>
          <FieldLabel htmlFor="tp-bio">Bio (optional)</FieldLabel>
          <Textarea id="tp-bio" value={values.bio} rows={2} placeholder="One line about you." onChange={(e) => setValues((v) => ({ ...v, bio: e.target.value }))} />
          <FieldDescription className={bioLength > BIO_MAX ? "text-destructive" : undefined}>
            {bioLength}/{BIO_MAX}. Shows when someone hovers or taps your photo.
          </FieldDescription>
        </Field>
      </FieldGroup>
      <div className="mt-4 flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : mode === "member" ? "Submit for review" : "Save"}
        </Button>
      </div>
    </form>
  );
}

export function RemoveListingButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await removeMyListing();
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success("You've been removed from the team page.");
          router.refresh();
        })
      }
    >
      Remove me from the team page
    </Button>
  );
}
```

- [ ] **Step 2: Page** -- `src/app/portal/(app)/profile/page.tsx`:

```tsx
import type { Metadata } from "next";
import { getCurrentProfile } from "@/lib/data/profile";
import { getMyTeamProfileRow } from "@/lib/data/team-page";
import { formInitialValues, hasPending } from "@/lib/team-page";
import { isExec, roleLabel } from "@/lib/auth/roles";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RemoveListingButton, TeamProfileForm } from "@/components/team/team-profile-form";

export const metadata: Metadata = { title: "My Public Profile" };

export default async function MyPublicProfilePage() {
  const profile = await getCurrentProfile();
  const row = await getMyTeamProfileRow(profile.id);
  const listed = !!row?.listed;
  const pending = hasPending(row);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Public Profile</h1>
        <p className="text-sm text-muted-foreground">
          What appears on the public Our Team page. Your name and title come from your account:{" "}
          <span className="font-medium text-foreground">{profile.name}</span>, {roleLabel(profile.role)}.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Team page profile
            {listed && <Badge>Live</Badge>}
            {pending && <Badge variant="secondary">Pending review</Badge>}
            {!listed && !pending && <Badge variant="outline">Not listed</Badge>}
          </CardTitle>
          <CardDescription>
            An exec reviews your first submission and any later changes before they go live.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <TeamProfileForm
            targetId={profile.id}
            mode={isExec(profile.role) ? "exec" : "member"}
            initial={formInitialValues(row, profile.linkedin_url)}
          />
          {listed && (
            <div className="border-t pt-4">
              <RemoveListingButton />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

(Execs saving here apply live, so the form's `mode` follows the role to keep the button label and toast accurate.)

- [ ] **Step 3: Nav entries** -- in `src/components/layout/nav-links.ts`: add `Camera` to the lucide import and, in `NAV_LINKS`, after the Directory entry:

```ts
  {
    href: "/portal/profile",
    label: "My Public Profile",
    icon: User,
    keywords: "team page photo bio linkedin major",
    group: "people",
    tourDescription: "Add your photo, bio and LinkedIn for the public Our Team page.",
  },
```

(import `User` from `lucide-react`.) In `ADMIN_NAV_LINKS`, after "Consultant Stats":

```ts
  {
    href: "/portal/admin/team-page",
    label: "Team Page",
    icon: Camera,
    execOnly: true,
    keywords: "public photos bios approve pending members",
    group: "admin-people",
  },
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint "src/app/portal/(app)/profile" src/components/team src/components/layout/nav-links.ts`
Expected: clean. Any shadcn component prop mismatch (e.g. `FieldDescription`) -- mirror usage from `members-panel.tsx`.

- [ ] **Step 5: Manual check** -- start the dev server (`npm run dev`), sign in as a non-exec member, open `/portal/profile`: the form renders, the sidebar shows "My Public Profile", saving with a missing field shows the validation toast. (Full upload flow is exercised in Task 8.)

- [ ] **Step 6: Commit**

```bash
git add src/components/team/team-profile-form.tsx "src/app/portal/(app)/profile/page.tsx" src/components/layout/nav-links.ts
git commit -m "Team page: member profile form and nav entries"
```

---

### Task 6: Exec "Team Page" approval screen

**Files:**
- Create: `src/app/portal/(app)/admin/team-page/page.tsx`
- Create: `src/app/portal/(app)/admin/team-page/team-page-panel.tsx`
- Modify: `src/app/portal/(app)/admin/admin-nav.tsx`
- Modify: `src/app/portal/(app)/admin/layout.tsx`

**Interfaces:**
- Consumes: `getTeamPageAdminRows`, `TeamPageAdminRow`, `getPendingTeamSubmissionCount` (Task 3); `approveSubmission`, `rejectSubmission`, `approveAll`, `setListed` (Task 3); `TeamProfileForm` (Task 5); `hasPending`, `formInitialValues`, `teamPhotoUrl` (Task 1).
- Produces: `<TeamPagePanel rows={TeamPageAdminRow[]} />`; `<AdminNav pendingTeamCount?={number} />`.

- [ ] **Step 1: Page** -- `admin/team-page/page.tsx`:

```tsx
import type { Metadata } from "next";
import { getTeamPageAdminRows } from "@/lib/data/team-page";
import { TeamPagePanel } from "./team-page-panel";

export const metadata: Metadata = { title: "Admin · Team Page" };

export default async function AdminTeamPagePage() {
  const rows = await getTeamPageAdminRows();
  return <TeamPagePanel rows={rows} />;
}
```

- [ ] **Step 2: Panel** -- `admin/team-page/team-page-panel.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { approveAll, approveSubmission, rejectSubmission, setListed } from "@/actions/team-profiles";
import type { TeamPageAdminRow } from "@/lib/data/team-page";
import { roleLabel } from "@/lib/auth/roles";
import { formInitialValues, hasPending, teamPhotoUrl } from "@/lib/team-page";
import { TeamProfileForm } from "@/components/team/team-profile-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const photo = (path: string | null) => (path ? teamPhotoUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!, path) : null);

function ProfileSnapshot({
  title,
  data,
  changed,
}: {
  title: string;
  data: { photoPath: string | null; major: string | null; linkedin: string | null; bio: string | null };
  changed?: { photo: boolean; major: boolean; linkedin: boolean; bio: boolean };
}) {
  const mark = (on?: boolean) => (on ? "rounded bg-primary/10 px-1" : "");
  const src = photo(data.photoPath);
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase">{title}</p>
      <div className={`aspect-[4/5] w-28 overflow-hidden rounded-lg bg-muted ${changed?.photo ? "ring-2 ring-primary" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- admin preview */}
        {src ? <img src={src} alt="" className="size-full object-cover" /> : null}
      </div>
      <p className="text-sm"><span className={mark(changed?.major)}>{data.major || "No major"}</span></p>
      <p className="text-sm break-all"><span className={mark(changed?.linkedin)}>{data.linkedin || "No LinkedIn"}</span></p>
      <p className="text-sm text-muted-foreground"><span className={mark(changed?.bio)}>{data.bio || "No bio"}</span></p>
    </div>
  );
}

export function TeamPagePanel({ rows }: { rows: TeamPageAdminRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);

  const pendingRows = rows.filter((r) => hasPending(r.row));
  const editing = rows.find((r) => r.id === editingId) ?? null;

  function run(action: () => Promise<{ error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  function statusBadge(r: TeamPageAdminRow) {
    if (hasPending(r.row)) return <Badge variant="secondary">Pending</Badge>;
    if (r.row?.listed) return <Badge>Live</Badge>;
    if (r.row?.photo_path) return <Badge variant="outline">Hidden</Badge>;
    return <Badge variant="outline">Not set up</Badge>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Pending review ({pendingRows.length})</CardTitle>
            <CardDescription>Approve to publish on the public Our Team page.</CardDescription>
          </div>
          {pendingRows.length > 1 && (
            <Button size="sm" disabled={isPending} onClick={() => run(approveAll, "Approved all.")}>
              <Check /> Approve all
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {pendingRows.length === 0 && <p className="text-sm text-muted-foreground">Nothing waiting for review.</p>}
          {pendingRows.map((r) => {
            const row = r.row!;
            const hasLive = !!row.photo_path;
            return (
              <div key={r.id} className="space-y-3 rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {r.name} <span className="font-normal text-muted-foreground">· {roleLabel(r.role)}</span>
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => rejectSubmission(r.id), "Rejected.")}>
                      <X /> Reject
                    </Button>
                    <Button size="sm" disabled={isPending} onClick={() => run(() => approveSubmission(r.id), "Approved.")}>
                      <Check /> Approve
                    </Button>
                  </div>
                </div>
                <div className="grid gap-6 sm:grid-cols-2">
                  {hasLive && (
                    <ProfileSnapshot
                      title="Live now"
                      data={{ photoPath: row.photo_path, major: row.major, linkedin: row.linkedin_url, bio: row.bio }}
                    />
                  )}
                  <ProfileSnapshot
                    title="Proposed"
                    data={{ photoPath: row.pending_photo_path, major: row.pending_major, linkedin: row.pending_linkedin_url, bio: row.pending_bio }}
                    changed={
                      hasLive
                        ? {
                            photo: row.pending_photo_path !== row.photo_path,
                            major: row.pending_major !== row.major,
                            linkedin: row.pending_linkedin_url !== row.linkedin_url,
                            bio: row.pending_bio !== row.bio,
                          }
                        : undefined
                    }
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Roster</CardTitle>
          <CardDescription>Everyone with an active account. Name and title come from the portal.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{roleLabel(r.role)}</TableCell>
                  <TableCell>{statusBadge(r)}</TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => setEditingId(r.id)}>Edit</Button>
                    {r.row?.photo_path && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => run(() => setListed(r.id, !r.row!.listed), r.row!.listed ? "Hidden." : "Shown.")}
                      >
                        {r.row.listed ? "Hide" : "Show"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit {editing?.name}</DialogTitle>
          </DialogHeader>
          {editing && (
            <TeamProfileForm
              key={editing.id}
              targetId={editing.id}
              mode="exec"
              initial={formInitialValues(editing.row, editing.profileLinkedin)}
              onSaved={() => setEditingId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 3: Badge in the admin tab bar** -- in `admin-nav.tsx` change the signature and render the count:

```tsx
import { Badge } from "@/components/ui/badge";
// ...
export function AdminNav({ pendingTeamCount = 0 }: { pendingTeamCount?: number }) {
```

and inside the `<Link>` content, replace `{item.label}` with:

```tsx
{item.label}
{item.href === "/portal/admin/team-page" && pendingTeamCount > 0 && (
  <Badge className="ml-1.5 h-4 min-w-4 px-1 text-[10px]">{pendingTeamCount}</Badge>
)}
```

In `admin/layout.tsx` fetch and pass it:

```tsx
import { getPendingTeamSubmissionCount } from "@/lib/data/team-page";
// inside the component, after the isExec redirect:
const pendingTeamCount = await getPendingTeamSubmissionCount();
// ...
<AdminNav pendingTeamCount={pendingTeamCount} />
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint "src/app/portal/(app)/admin"`
Expected: clean.

- [ ] **Step 5: Manual check** -- as an exec open `/portal/admin/team-page`: roster lists everyone, Edit opens the dialog form, the tab shows no badge with nothing pending. (Pending flow exercised in Task 8.)

- [ ] **Step 6: Commit**

```bash
git add "src/app/portal/(app)/admin/team-page" "src/app/portal/(app)/admin/admin-nav.tsx" "src/app/portal/(app)/admin/layout.tsx"
git commit -m "Team page: exec approval queue, roster and nav badge"
```

---

### Task 7: Public `/team` page from the database

**Files:**
- Create: `src/components/marketing/team-member-card.tsx`
- Modify: `src/app/(marketing)/team/page.tsx`

**Interfaces:**
- Consumes: `getPublicTeamMembers` (Task 3); `groupTeamMembers`, `memberSubtitle`, `TeamSection` (Task 1); existing `PhotoPlaceholder`.
- Produces: `<TeamMemberCard name subtitle bio linkedin photoUrl />`.

- [ ] **Step 1: Card with tap-safe overlay** -- `team-member-card.tsx`. It reuses the markup of the current `MemberCard`, moves `LinkedinIcon` here, and adds tap-to-open state following the `[@media(hover:hover)]` pattern used by `src/components/marketing/project-steps.tsx` (hover reveals only on hover-capable devices; a tap toggles `open`; focus-within reveals for keyboard users):

```tsx
"use client";

import { useState } from "react";
import { PhotoPlaceholder } from "@/components/marketing/photo-placeholder";
import { cn } from "@/lib/utils";

export function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.03-1.85-3.03-1.85 0-2.14 1.45-2.14 2.94v5.66H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z" />
    </svg>
  );
}

export function TeamMemberCard({
  name,
  subtitle,
  bio,
  linkedin,
  photoUrl,
}: {
  name: string;
  subtitle: string;
  bio: string | null;
  linkedin: string;
  photoUrl: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="group">
      <div
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "relative overflow-hidden rounded-[1.25rem] transition-all duration-300 group-focus-within:-translate-y-1 [@media(hover:hover)]:group-hover:-translate-y-1 [@media(hover:hover)]:group-hover:shadow-xl [@media(hover:hover)]:group-hover:shadow-primary/25",
          open && "-translate-y-1 shadow-xl shadow-primary/25",
        )}
      >
        <PhotoPlaceholder label={`Photo: ${name}`} src={photoUrl} className="aspect-[4/5] w-full rounded-none" />
        <div
          className={cn(
            "absolute inset-0 flex flex-col justify-end gap-2 bg-gradient-to-t from-primary/90 via-primary/40 to-transparent p-4 opacity-0 transition-opacity duration-300 group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100",
            open && "opacity-100",
          )}
        >
          {bio && <p className="text-sm leading-snug text-pretty text-white">{bio}</p>}
          <a
            href={linkedin}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${name} on LinkedIn`}
            className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-[#0a66c2] shadow-sm"
          >
            <LinkedinIcon className="size-3.5" />
            View LinkedIn
          </a>
        </div>
      </div>
      <div className="mt-3 flex items-start justify-between gap-3 px-0.5">
        <div>
          <h3 className="leading-tight font-semibold">{name}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <a
          href={linkedin}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${name} on LinkedIn`}
          className="mt-0.5 shrink-0 text-[#0a66c2] transition-colors hover:text-[#074a8c]"
        >
          <LinkedinIcon className="size-5" />
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite the data section of `team/page.tsx`**

Make the page `async`; delete the local `LinkedinIcon`, `EXEC_BOARD`, `PROJECT_MANAGERS`, `CONSULTANTS` (and their TODO comments), `MemberCard`, and the `PhotoPlaceholder` import. Keep the hero, intro, `RosterComingSoon`, and CTA exactly as they are. Add:

```tsx
import { getPublicTeamMembers } from "@/lib/data/team-page";
import { groupTeamMembers, memberSubtitle, type PublicTeamMember, type TeamSection } from "@/lib/team-page";
import { TeamMemberCard } from "@/components/marketing/team-member-card";

function Roster({ section, members, emptyLabel, cols }: { section: TeamSection; members: PublicTeamMember[]; emptyLabel: string; cols: string }) {
  if (members.length === 0) {
    return (
      <div className="mt-8">
        <RosterComingSoon label={emptyLabel} />
      </div>
    );
  }
  return (
    <div className={`mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 ${cols}`}>
      {members.map((m) => (
        <TeamMemberCard key={m.id} name={m.name} subtitle={memberSubtitle(section, m)} bio={m.bio} linkedin={m.linkedinUrl} photoUrl={m.photoUrl} />
      ))}
    </div>
  );
}

export default async function TeamPage() {
  const groups = groupTeamMembers(await getPublicTeamMembers());
  // ... hero + intro unchanged ...
}
```

Replace the three roster sections' grids with `<Roster section="exec" members={groups.exec} emptyLabel="Executive board" cols="lg:grid-cols-3" />`, `<Roster section="project_manager" members={groups.project_manager} emptyLabel="Project manager" cols="lg:grid-cols-4" />`, and `<Roster section="consultant" members={groups.consultant} emptyLabel="Consultant" cols="lg:grid-cols-4" />`, keeping each section's `<h2>` heading.

- [ ] **Step 3: Typecheck, lint, test**

Run: `npx tsc --noEmit && npx eslint "src/app/(marketing)/team" src/components/marketing/team-member-card.tsx && npm test`
Expected: all clean/green.

- [ ] **Step 4: Dynamic-rendering check**

Run: `npm run build`
Expected: `/team` is listed as dynamic (`ƒ`), not static (`○`). If it prints static, add `export const dynamic = "force-dynamic";` to the page after confirming in `node_modules/next/dist/docs/` that route segment config is still valid in this Next version.

- [ ] **Step 5: Commit**

```bash
git add src/components/marketing/team-member-card.tsx "src/app/(marketing)/team/page.tsx"
git commit -m "Team page: render public roster from team_profiles with bio overlay"
```

---

### Task 8: End-to-end verification

**Files:** none (verification only; fix anything found in the owning task's files).

- [ ] **Step 1: Static checks**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 2: Walk the real flow** with `npm run dev` (use the `run` skill or browser tools), against the migrated database:

1. Sign in as a non-exec member -> `/portal/profile` -> pick a **real HEIC file** -> cropper opens -> zoom/drag -> "Use photo" -> fill major + LinkedIn (try `linkedin.com/in/test` without scheme) + a 120-char bio -> Submit. Expect "Pending review" badge. Confirm the object appears in the `team-photos` bucket as `{id}/{uuid}.jpg` and is ~tens of KB, 800x1000.
2. Public `/team` in a private window: the member does **not** appear yet.
3. Sign in as an exec -> Admin tab shows a badge `1` on "Team Page" -> the pending card shows the proposal -> Approve. Expect the member now on `/team` in the correct section, bio visible on hover (desktop) and on tap (mobile width / device emulation), LinkedIn link works.
4. As the member, edit **only the bio** and submit -> exec sees "Live now" vs "Proposed" with only the bio highlighted -> **Reject** -> confirm the member's photo is still visible on `/team` and still present in the bucket (Review Focus 1).
5. Submit a bio edit with a **new** photo, then submit again with another new photo before approval -> the first new photo is gone from the bucket, the live one remains (Review Focus 2). Approve -> the old live photo is deleted.
6. Exec hides the member (Hide) -> gone from `/team`. Exec edits the hidden member -> still hidden (Show toggle brings them back). Member clicks "Remove me from the team page" -> gone instantly.
7. Archive the listed member from Admin -> Members -> gone from `/team`; restore -> back (Review Focus 3).
8. As a member, try to call `saveTeamProfile` with a photo path from someone else's folder (browser console / temporarily in a test) -> "That photo is invalid." (Review Focus 4)
9. Remove everyone from a section -> `/team` shows the "coming soon" line (Review Focus 7).
10. Have each of the 6 execs submit their own profile (their saves apply immediately) so the page is populated before launch.

- [ ] **Step 3: Report** -- tell the user exactly what was verified and anything that couldn't be (e.g. HEIC files that fail to convert, any step skipped), and offer to commit the spec/plan docs and open a PR.
