"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import type { UserRole } from "@/lib/supabase/database.types";

export interface ActionResult {
  error?: string;
}

const DEFAULT_PASSWORD = "ucsc180dc$";
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
      password: DEFAULT_PASSWORD,
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

  revalidatePath("/admin");
  return { results };
}

export async function resetMemberPassword(userId: string): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied) return denied;

  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    password: DEFAULT_PASSWORD,
  });
  if (authError) return { error: authError.message };

  const { error: profileError } = await admin
    .from("profiles")
    .update({ must_reset_password: true })
    .eq("id", userId);
  if (profileError) return { error: profileError.message };

  revalidatePath("/admin");
  return {};
}

export async function updateMemberRole(userId: string, role: UserRole): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied) return denied;

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  revalidatePath("/directory");
  return {};
}
