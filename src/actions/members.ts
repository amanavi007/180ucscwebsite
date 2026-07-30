"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec, roleLabel } from "@/lib/auth/roles";
import { getDefaultBulkPassword } from "@/lib/data/org-settings";
import { logAudit } from "@/lib/audit";
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
  const results: BulkCreateResult[] = [];

  for (const row of rows) {
    const name = row.name.trim();
    const email = row.email.trim().toLowerCase();

    if (!name || !email) {
      results.push({ name, email, status: "error", message: "Missing name or email." });
      continue;
    }
    if (!EMAIL_DOMAIN.test(email)) {
      results.push({ name, email, status: "error", message: "Must be a @180dc.org address." });
      continue;
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
      results.push({
        name,
        email,
        status: "error",
        message: createError?.message ?? "Failed to create account.",
      });
      continue;
    }

    results.push({ name, email, status: "created" });
  }

  const createdCount = results.filter((r) => r.status === "created").length;
  if (createdCount > 0) {
    const actor = await getCurrentProfile();
    await logAudit(actor.id, "member.bulk_created", undefined, `Created ${createdCount} account(s)`);
  }

  revalidatePath("/admin");
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

  revalidatePath("/admin");
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

  revalidatePath("/admin");
  revalidatePath("/directory");
  return {};
}
