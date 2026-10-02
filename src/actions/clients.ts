"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";

export interface ActionResult {
  error?: string;
}

async function requireExec() {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) {
    return { error: "Only exec can do that." } as const;
  }
  return { error: undefined, profile } as const;
}

export async function createClientRecord(input: {
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  notes: string | null;
}): Promise<ActionResult & { id?: string }> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };
  if (!input.name.trim()) return { error: "Client name is required." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({
      name: input.name.trim(),
      contact_name: input.contactName || null,
      contact_email: input.contactEmail || null,
      notes: input.notes || null,
      created_by: denied.profile.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/portal/clients");
  return { id: data.id };
}

export async function updateClientRecord(
  id: string,
  input: { name: string; contactName: string | null; contactEmail: string | null; notes: string | null },
): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };
  if (!input.name.trim()) return { error: "Client name is required." };

  const supabase = await createClient();
  const name = input.name.trim();
  const { error } = await supabase
    .from("clients")
    .update({
      name,
      contact_name: input.contactName || null,
      contact_email: input.contactEmail || null,
      notes: input.notes || null,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  // Keep the denormalized client_name on every one of this client's projects
  // in sync with the rename -- the project list/board/detail views all read
  // it directly rather than joining through clients.
  const { error: projectsError } = await supabase
    .from("projects")
    .update({ client_name: name })
    .eq("client_id", id);
  if (projectsError) return { error: projectsError.message };

  revalidatePath("/portal/clients");
  revalidatePath(`/portal/clients/${id}`);
  revalidatePath("/portal/projects");
  return {};
}

/**
 * Merge `duplicateId` into `keepId`: every project linked to the duplicate
 * moves onto the kept client (and has its client_name text synced to match,
 * same bulk-rename pattern as updateClientRecord), then the duplicate client
 * row is deleted. Exists because the auto-link trigger in
 * 20260730000005_client_auto_sync.sql matches client_name exactly, so a
 * typo'd or differently-cased name silently creates a second client record
 * with no built-in way to reconcile it back into the original.
 */
export async function mergeClients(keepId: string, duplicateId: string): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };
  if (keepId === duplicateId) return { error: "Pick two different clients to merge." };

  const supabase = await createClient();

  const { data: keepClient, error: keepError } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", keepId)
    .maybeSingle();
  if (keepError) return { error: keepError.message };
  if (!keepClient) return { error: "The client to keep no longer exists." };

  const { data: duplicateClient, error: duplicateError } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", duplicateId)
    .maybeSingle();
  if (duplicateError) return { error: duplicateError.message };
  if (!duplicateClient) return { error: "The duplicate client no longer exists." };

  const { error: projectsError } = await supabase
    .from("projects")
    .update({ client_id: keepId, client_name: keepClient.name })
    .eq("client_id", duplicateId);
  if (projectsError) return { error: projectsError.message };

  const { error: deleteError } = await supabase.from("clients").delete().eq("id", duplicateId);
  if (deleteError) return { error: deleteError.message };

  revalidatePath("/portal/clients");
  revalidatePath(`/portal/clients/${keepId}`);
  revalidatePath(`/portal/clients/${duplicateId}`);
  return {};
}
