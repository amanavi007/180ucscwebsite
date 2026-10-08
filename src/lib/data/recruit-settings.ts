import "server-only";
import { createClient } from "@/lib/supabase/server";
import { RECRUIT_SETTING_KEYS, parseRecruitSettings, type RecruitSettings } from "@/lib/recruit-settings";

export async function getRecruitSettings(): Promise<RecruitSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("org_settings")
    .select("key, value")
    .in("key", Object.values(RECRUIT_SETTING_KEYS));
  if (error) throw error;
  return parseRecruitSettings(data ?? []);
}
