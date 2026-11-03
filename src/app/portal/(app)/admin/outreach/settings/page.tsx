import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { parseOutreachSettings, OUTREACH_SETTING_KEYS } from "@/lib/outreach/settings";
import { getAgentOverview } from "@/lib/data/outreach-agent";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Admin · Outreach Settings" };
export const dynamic = "force-dynamic";

export default async function OutreachSettingsPage() {
  // Read as the signed-in exec (RLS), so this page never needs the service role.
  const supabase = await createClient();
  const { data } = await supabase.from("org_settings").select("key, value").in("key", OUTREACH_SETTING_KEYS);
  const settings = parseOutreachSettings(data ?? []);
  // Settings must still open before the agent migration has run.
  const agent = await getAgentOverview().catch((err) => {
    console.error("agent overview failed:", err);
    return { keys: [], lastRunAt: null, acceptedToday: 0, topSkips: [], lastError: null, corrections: [] };
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Outreach settings" description="How fast emails go out, when, and what they say at the bottom." />
      <SettingsForm settings={settings} agent={agent} />
    </div>
  );
}

