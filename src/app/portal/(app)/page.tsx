import type { Metadata } from "next";
import Link from "next/link";
import { ChatPanel } from "@/components/assistant/chat-panel";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadAssistantConfig } from "@/lib/assistant/config";
import { currentOrgHour, greetingForHour } from "@/lib/assistant/greeting";
import { isExec } from "@/lib/auth/roles";
import { getCurrentProfile } from "@/lib/data/profile";
import { getActiveQuarter } from "@/lib/data/quarters";
import { createClient } from "@/lib/supabase/server";
import { HomeSidebar } from "./home-sidebar";

export const metadata: Metadata = { title: "Home" };

export default async function AssistantPage() {
  const [profile, quarter] = await Promise.all([getCurrentProfile(), getActiveQuarter()]);
  const exec = isExec(profile.role);

  if (!quarter) {
    return (
      <div className="space-y-6">
        <h1 className="text-4xl leading-tight">Welcome, {profile.name.split(" ")[0]}</h1>
        <Card>
          <CardHeader>
            <CardTitle>No active quarter yet</CardTitle>
            <CardDescription>
              {exec
                ? "Projects and attendance are scoped to a quarter. Create one in Setup first."
                : "An exec needs to set up this quarter before projects and attendance are available."}
            </CardDescription>
          </CardHeader>
          {exec && (
            <div className="px-6 pb-6">
              <Button nativeButton={false} render={<Link href="/portal/admin/quarters">Go to Setup</Link>} />
            </div>
          )}
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const cfg = loadAssistantConfig();

  // Every visit starts a fresh chat; older threads stay in the database until the retention job prunes them.
  const usageRes = exec ? await supabase.rpc("get_chat_usage_today") : null;

  const globalUsed = usageRes?.data?.[0]?.global_messages ?? 0;

  return (
    <div className="grid h-[calc(100dvh-9rem)] min-h-96 gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-h-0 min-w-0 flex-col">
        <ChatPanel
          greeting={greetingForHour(currentOrgHour())}
          firstName={profile.name.split(" ")[0]}
          execUsage={exec ? { used: globalUsed, cap: cfg.globalDailyCap } : null}
        />
      </div>
      <div className="hidden min-h-0 xl:flex xl:flex-col">
        <HomeSidebar userId={profile.id} quarterId={quarter.id} isExec={exec} />
      </div>
    </div>
  );
}
