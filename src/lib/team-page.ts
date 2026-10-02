import type { UserRole } from "./supabase/database.types";
import { EXEC_ROLES, compareByRole, roleLabel } from "./auth/roles";

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
  if (codePoints(major) > MAJOR_MAX) return fail(`Major must be ${MAJOR_MAX} characters or fewer.`);
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

/** True when approving would put a currently-hidden member (has a live photo, not listed) back on the page. */
export function approvalWouldRelist(row: TeamProfileRow | null): boolean {
  return !!row && hasPending(row) && !row.listed && row.photo_path !== null;
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

export type TeamSection = "exec" | "project_manager" | "senior_consultant" | "consultant";

export function sectionForRole(role: UserRole): TeamSection {
  if (EXEC_ROLES.includes(role)) return "exec";
  if (role === "project_manager") return "project_manager";
  if (role === "senior_consultant") return "senior_consultant";
  return "consultant";
}

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
  const out: Record<TeamSection, PublicTeamMember[]> = {
    exec: [],
    project_manager: [],
    senior_consultant: [],
    consultant: [],
  };
  for (const m of members) out[sectionForRole(m.role)].push(m);
  for (const list of Object.values(out)) list.sort(compareByRole); // seniority, then name
  return out;
}

export function memberSubtitle(section: TeamSection, m: PublicTeamMember): string {
  return section === "exec" ? roleLabel(m.role) : m.major;
}

export function teamPhotoUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${TEAM_PHOTO_BUCKET}/${path}`;
}
