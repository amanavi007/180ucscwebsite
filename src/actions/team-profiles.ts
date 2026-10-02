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
  "bio, linkedin_url, major, photo_path, listed, pending_bio, pending_linkedin_url, pending_major, pending_photo_path, pending_submitted_at" as const;

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
