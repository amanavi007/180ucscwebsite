import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { parseOutreachSettings, OUTREACH_SETTING_KEYS } from "@/lib/outreach/settings";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Admin · Outreach Settings" };
export const dynamic = "force-dynamic";

export default async function OutreachSettingsPage() {
  // Read as the signed-in exec (RLS), so this page never needs the service role.
  const supabase = await createClient();
  const { data } = await supabase.from("org_settings").select("key, value").in("key", OUTREACH_SETTING_KEYS);
  const settings = parseOutreachSettings(data ?? []);
  return (
    <div className="space-y-6">
      <PageHeader title="Outreach settings" description="How fast emails go out, when, and what they say at the bottom." />
      <SettingsForm settings={settings} />
    </div>
  );
}

