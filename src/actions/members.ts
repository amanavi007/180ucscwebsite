"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec, roleLabel } from "@/lib/auth/roles";
import { getDefaultBulkPassword } from "@/lib/data/org-settings";
import { getActiveQuarter } from "@/lib/data/quarters";
import { logAudit } from "@/lib/audit";
import { EXEC_ROLES } from "@/lib/auth/roles";
import type { UserRole } from "@/lib/supabase/database.types";

export interface ActionResult {
  error?: string;
}

const EMAIL_DOMAIN = /@180dc\.org$/i;

async function requireExec() {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) {
    return { error: "Only exec can manage members." } as ActionResult;
  }
  return null;
}

export interface BulkCreateRow {
  name: string;
  email: string;
}

export interface BulkCreateResult {
  email: string;
  name: string;
  status: "created" | "error";
  message?: string;
}

export async function bulkCreateMembers(
  rows: BulkCreateRow[],
): Promise<{ error?: string; results?: BulkCreateResult[] }> {
  const denied = await requireExec();
  if (denied) return denied;

  if (rows.length === 0) return { error: "No rows to create." };

  const admin = createAdminClient();
  const defaultPassword = await getDefaultBulkPassword();

  // Each row is an independent auth signup (no batch endpoint exists), so run
  // them concurrently rather than awaiting one at a time.
  const results: BulkCreateResult[] = await Promise.all(
    rows.map(async (row): Promise<BulkCreateResult> => {
      const name = row.name.trim();
      const email = row.email.trim().toLowerCase();

      if (!name || !email) {
        return { name, email, status: "error", message: "Missing name or email." };
      }
      if (!EMAIL_DOMAIN.test(email)) {
        return { name, email, status: "error", message: "Must be a @180dc.org address." };
      }

      // The on_auth_user_created trigger mirrors user_metadata into a profiles
      // row (name/role), so there's no separate profiles insert here.
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password: defaultPassword,
        email_confirm: true,
        user_metadata: { name, role: "consultant" },
      });

      if (createError || !created.user) {
        return {
          name,
          email,
          status: "error",
          message: createError?.message ?? "Failed to create account.",
        };
      }

      return { name, email, status: "created" };
    }),
  );

  const createdCount = results.filter((r) => r.status === "created").length;
  if (createdCount > 0) {
    const actor = await getCurrentProfile();
    await logAudit(actor.id, "member.bulk_created", undefined, `Created ${createdCount} account(s)`);
  }

  revalidatePath("/portal/admin");
  return { results };
}

export async function resetMemberPassword(userId: string): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied) return denied;

  const admin = createAdminClient();
  const defaultPassword = await getDefaultBulkPassword();
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    password: defaultPassword,
  });
  if (authError) return { error: authError.message };

  const { data: target, error: profileError } = await admin
    .from("profiles")
    .update({ must_reset_password: true })
    .eq("id", userId)
    .select("name")
    .single();
  if (profileError) return { error: profileError.message };

  const actor = await getCurrentProfile();
  await logAudit(actor.id, "member.password_reset", target.name);

  revalidatePath("/portal/admin");
  return {};
}

export async function updateMemberRole(userId: string, role: UserRole): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied) return denied;

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("profiles")
    .select("name, role")
    .eq("id", userId)
    .single();

  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) return { error: error.message };

  if (before) {
    const actor = await getCurrentProfile();
    await logAudit(
      actor.id,
      "member.role_changed",
      before.name,
      `${roleLabel(before.role)} -> ${roleLabel(role)}`,
    );
  }

  revalidatePath("/portal/admin");
  revalidatePath("/portal/directory");
  return {};
}

/** Blocks archiving/deleting the last remaining active exec, so Admin never locks everyone out. */
async function isLastActiveExec(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  role: UserRole,
): Promise<boolean> {
  if (!isExec(role)) return false;
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .in("role", EXEC_ROLES)
    .is("archived_at", null)
    .neq("id", userId);
  return !count;
}

export interface ArchiveMemberInput {
  reason: "graduated" | "left";
  currentTitle?: string;
  currentCompany?: string;
  linkedinUrl?: string;
}

export async function archiveMember(userId: string, input: ArchiveMemberInput): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied) return denied;

  if (input.reason !== "graduated" && input.reason !== "left") {
    return { error: "Pick a reason for archiving." };
  }

  const actor = await getCurrentProfile();
  if (actor.id === userId) return { error: "You can't archive your own account." };

  const supabase = await createClient();
  const { data: target, error: targetError } = await supabase
    .from("profiles")
    .select("name, role, archived_at")
    .eq("id", userId)
    .single();
  if (targetError || !target) return { error: "Member not found." };
  if (target.archived_at) return { error: "Already archived." };
  if (await isLastActiveExec(supabase, userId, target.role)) {
    return { error: "Can't archive the last active exec." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      archived_at: new Date().toISOString(),
      departure_reason: input.reason,
      current_title: input.reason === "graduated" ? input.currentTitle?.trim() || null : null,
      current_company: input.reason === "graduated" ? input.currentCompany?.trim() || null : null,
      linkedin_url: input.reason === "graduated" ? input.linkedinUrl?.trim() || null : null,
    })
    .eq("id", userId);
  if (error) return { error: error.message };

  // Drop them from their current-quarter team so rosters stay accurate --
  // past quarters' membership rows are untouched. The sync_project_leads
  // trigger clears projects.project_manager_id/senior_consultant_id for us
  // when the matching membership row disappears.
  const activeQuarter = await getActiveQuarter();
  if (activeQuarter) {
    const { data: rows } = await supabase
      .from("memberships")
      .select("id, project:projects(quarter_id)")
      .eq("user_id", userId);
    const toRemove = ((rows ?? []) as unknown as { id: string; project: { quarter_id: string } | null }[])
      .filter((r) => r.project?.quarter_id === activeQuarter.id)
      .map((r) => r.id);
    if (toRemove.length > 0) {
      await supabase.from("memberships").delete().in("id", toRemove);
    }
  }

  await logAudit(actor.id, "member.archived", target.name, input.reason === "graduated" ? "Graduated" : "Left");

  revalidatePath("/portal/admin");
  revalidatePath("/portal/directory");
  revalidatePath("/portal/projects");
  return {};
}

export async function restoreMember(userId: string): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied) return denied;

  const supabase = await createClient();
  const { data: target, error: targetError } = await supabase
    .from("profiles")
    .select("name, archived_at")
    .eq("id", userId)
    .single();
  if (targetError || !target) return { error: "Member not found." };
  if (!target.archived_at) return { error: "Not archived." };

  const { error } = await supabase
    .from("profiles")
    .update({ archived_at: null, departure_reason: null, current_title: null, current_company: null })
    .eq("id", userId);
  if (error) return { error: error.message };

  const actor = await getCurrentProfile();
  await logAudit(actor.id, "member.restored", target.name);

  revalidatePath("/portal/admin");
  revalidatePath("/portal/directory");
  return {};
}

/**
 * Permanently deletes an account -- only possible for an already-archived
 * member with zero activity anywhere (checked via member_has_history()).
 * Requiring "archived first" means the current-team cleanup from
 * archiveMember already happened, and gives a confirm-then-confirm buffer
 * before an irreversible action.
 */
export async function deleteMemberPermanently(userId: string): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied) return denied;

  const actor = await getCurrentProfile();
  if (actor.id === userId) return { error: "You can't delete your own account." };

  const supabase = await createClient();
  const { data: target, error: targetError } = await supabase
    .from("profiles")
    .select("name, archived_at")
    .eq("id", userId)
    .single();
  if (targetError || !target) return { error: "Member not found." };
  if (!target.archived_at) return { error: "Archive this member first." };

  const { data: hasHistory, error: historyError } = await supabase.rpc("member_has_history", {
    target: userId,
  });
  if (historyError) return { error: historyError.message };
  if (hasHistory) {
    return { error: "Can't permanently delete -- this account has activity history. It stays archived instead." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };

  await logAudit(actor.id, "member.deleted", target.name);

  revalidatePath("/portal/admin");
  revalidatePath("/portal/directory");
  return {};
}
