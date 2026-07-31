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

  revalidatePath("/clients");
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
  const { error } = await supabase
    .from("clients")
    .update({
      name: input.name.trim(),
      contact_name: input.contactName || null,
      contact_email: input.contactEmail || null,
      notes: input.notes || null,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  return {};
}
