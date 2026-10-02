import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Exec, or anyone with a 'pm'/'sc' membership on this project (covers additional, non-primary leads too). */
export async function isProjectLead(
  projectId: string,
  profileId: string,
  execRole: boolean,
): Promise<boolean> {
  if (execRole) return true;
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("id")
    .eq("project_id", projectId)
    .eq("user_id", profileId)
    .in("team_role", ["pm", "sc"])
    .maybeSingle();
  return !!data;
}
