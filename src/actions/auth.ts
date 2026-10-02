"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  error?: string;
}

export async function login(email: string, password: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Incorrect email or password." };
  }

  redirect("/portal");
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function changePassword(newPassword: string): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not signed in." };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) {
    return { error: updateError.message };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ must_reset_password: false })
    .eq("id", user.id);

  if (profileError) {
    return { error: profileError.message };
  }

  revalidatePath("/portal", "layout");
  redirect("/portal");
}
