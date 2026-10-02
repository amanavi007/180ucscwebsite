"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import {
  TEAM_PHOTO_BUCKET,
  approvalWouldRelist,
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
import { commitTransition, type LoadedTeamProfile, type TeamProfileStore } from "@/lib/team-page-store";

export interface ActionResult {
  error?: string;
}

type Admin = ReturnType<typeof createAdminClient>;

const ROW_COLUMNS =
  "bio, linkedin_url, major, photo_path, listed, pending_bio, pending_linkedin_url, pending_major, pending_photo_path, pending_submitted_at" as const;

async function requireExec() {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) return { error: "Only exec can do that." } as const;
  return { error: undefined, profile } as const;
}

async function loadRow(admin: Admin, profileId: string): Promise<LoadedTeamProfile | null> {
  const { data, error } = await admin
    .from("team_profiles")
    .select(`${ROW_COLUMNS}, updated_at`)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { updated_at, ...row } = data;
  return { row: row as TeamProfileRow, updatedAt: updated_at };
}

function adminStore(admin: Admin): TeamProfileStore {
  return {
    async insert(profileId, row) {
      const { error } = await admin.from("team_profiles").insert({ profile_id: profileId, ...row });
      return { error: error?.message };
    },
    async updateIfUnchanged(profileId, row, expectedUpdatedAt) {
      const { data, error } = await admin
        .from("team_profiles")
        .update(row)
        .eq("profile_id", profileId)
        .eq("updated_at", expectedUpdatedAt)
        .select("profile_id");
      if (error) return { error: error.message, matched: false };
      return { matched: (data?.length ?? 0) > 0 };
    },
    async removePhotos(paths) {
      const { error } = await admin.storage.from(TEAM_PHOTO_BUCKET).remove(paths);
      if (error) console.error("team photo cleanup failed:", error.message);
    },
  };
}

/** Guarded write (see commitTransition) + best-effort storage cleanup. */
function persist(admin: Admin, profileId: string, before: LoadedTeamProfile | null, t: Transition) {
  return commitTransition(adminStore(admin), profileId, before, t);
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
    ? saveLive(before?.row ?? null, result.value)
    : submitPending(before?.row ?? null, result.value, new Date().toISOString());

  const error = await persist(admin, targetId, before, t);
  if (error) return { error };

  if (callerIsExec) await logAudit(caller.id, "team_page.edited", await nameOf(admin, targetId));
  revalidateTeam();
  return {};
}

export async function approveSubmission(profileId: string): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };

  const admin = createAdminClient();
  const before = await loadRow(admin, profileId);
  const t = approvePending(before?.row ?? null);
  if (!t) return { error: "There is nothing to approve for this member." };

  const error = await persist(admin, profileId, before, t);
  if (error) return { error };

  await logAudit(denied.profile.id, "team_page.approved", await nameOf(admin, profileId));
  revalidateTeam();
  return {};
}

export async function rejectSubmission(profileId: string): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };

  const admin = createAdminClient();
  const before = await loadRow(admin, profileId);
  const t = rejectPending(before?.row ?? null);
  if (!t) return { error: "There is nothing to reject for this member." };

  const error = await persist(admin, profileId, before, t);
  if (error) return { error };

  await logAudit(denied.profile.id, "team_page.rejected", await nameOf(admin, profileId));
  revalidateTeam();
  return {};
}

/**
 * Approves every pending submission except those that would put a currently
 * hidden member back on the page -- an exec hid them on purpose, so those
 * need an individual, deliberate Approve. Returns how many were skipped.
 */
export async function approveAll(): Promise<ActionResult & { skipped?: number }> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("team_profiles")
    .select("profile_id")
    .not("pending_submitted_at", "is", null);
  if (error) return { error: error.message };

  let approved = 0;
  let skipped = 0;
  for (const { profile_id } of data) {
    const before = await loadRow(admin, profile_id);
    if (approvalWouldRelist(before?.row ?? null)) {
      skipped += 1;
      continue;
    }
    const t = approvePending(before?.row ?? null);
    if (!t) continue;
    const persistError = await persist(admin, profile_id, before, t);
    if (persistError) return { error: persistError };
    approved += 1;
  }

  await logAudit(denied.profile.id, "team_page.approved_all", `${approved} approved, ${skipped} skipped (hidden)`);
  revalidateTeam();
  return { skipped };
}

export async function setListed(profileId: string, listed: boolean): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };

  const admin = createAdminClient();
  const before = await loadRow(admin, profileId);
  if (!before) return { error: "This member has no team page profile yet." };
  if (listed && !before.row.photo_path) return { error: "Approve or add a profile before showing this member." };

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
