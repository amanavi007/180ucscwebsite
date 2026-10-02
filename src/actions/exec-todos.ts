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

export async function createExecTodo(
  title: string,
  dueDate: string | null,
  assignedTo: string[],
): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };
  if (!title.trim()) return { error: "Title is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("exec_todos").insert({
    title: title.trim(),
    due_date: dueDate,
    assigned_to: assignedTo,
    created_by: denied.profile.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/portal");
  return {};
}

export async function toggleExecTodo(id: string, done: boolean): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("exec_todos")
    .update({ status: done ? "done" : "open" })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/portal");
  return {};
}

export async function deleteExecTodo(id: string): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };

  const supabase = await createClient();
  const { error } = await supabase.from("exec_todos").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/portal");
  return {};
}
