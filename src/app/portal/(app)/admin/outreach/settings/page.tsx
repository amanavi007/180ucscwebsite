import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { parseOutreachSettings, OUTREACH_SETTING_KEYS } from "@/lib/outreach/settings";
import { getAgentOverview } from "@/lib/data/outreach-agent";
import { getTeamPageAdminRows } from "@/lib/data/team-page";
import { roleLabel } from "@/lib/auth/roles";
import { sendersFromRoster } from "@/lib/outreach/senders";
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
  // The execs on the roster, offered as officers to send from. Settings must still open if the roster can't be read.
  const roster = await getTeamPageAdminRows()
    .then((rows) =>
      sendersFromRoster(
        rows.map((r) => ({ id: r.id, name: r.name, role: r.role, linkedin: r.row?.linkedin_url ?? r.profileLinkedin })),
        (role) => roleLabel(role as Parameters<typeof roleLabel>[0]),
      ),
    )
    .catch((err) => {
      console.error("outreach roster failed:", err);
      return [];
    });
  return (
    <div className="space-y-6">
      <PageHeader title="Outreach settings" description="How fast emails go out, when, and what they say at the bottom." />
      <SettingsForm settings={settings} agent={agent} roster={roster} />
    </div>
  );
}

