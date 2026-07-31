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

export interface EventInput {
  title: string;
  date: string;
  time?: string | null;
  location?: string | null;
  description?: string | null;
}

/** Capitalizes the first letter of each word, leaving the rest of each word untouched -- so "UCSC social" becomes "UCSC Social", not "Ucsc Social". */
function titleCase(s: string): string {
  return s.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

export async function createOrgEvent(input: EventInput): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };

  const title = titleCase(input.title.trim());
  if (!title) return { error: "Title is required." };
  if (!input.date) return { error: "Date is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("org_events").insert({
    title,
    date: input.date,
    time: input.time?.trim() || null,
    location: input.location?.trim() || null,
    description: input.description?.trim() || null,
    created_by: denied.profile.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/calendar");
  return {};
}

export async function updateOrgEvent(id: string, input: EventInput): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };

  const title = titleCase(input.title.trim());
  if (!title) return { error: "Title is required." };
  if (!input.date) return { error: "Date is required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("org_events")
    .update({
      title,
      date: input.date,
      time: input.time?.trim() || null,
      location: input.location?.trim() || null,
      description: input.description?.trim() || null,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/calendar");
  return {};
}

export async function deleteOrgEvent(id: string): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };

  const supabase = await createClient();
  const { error } = await supabase.from("org_events").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/calendar");
  return {};
}
