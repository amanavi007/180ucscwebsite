import type { Metadata } from "next";
import Link from "next/link";
import type { UIMessage } from "ai";
import { ChatPanel } from "@/components/assistant/chat-panel";
import { StatsRow } from "@/components/assistant/stats-row";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadAssistantConfig } from "@/lib/assistant/config";
import { computeStats } from "@/lib/assistant/stats";
import { isExec } from "@/lib/auth/roles";
import { getMyAttendanceSummary } from "@/lib/data/attendance";
import { getCurrentProfile } from "@/lib/data/profile";
import { getMyProjects } from "@/lib/data/projects";
import { getActiveQuarter } from "@/lib/data/quarters";
import { getVisibleTasks } from "@/lib/data/tasks";
import { getOrgTodayDateString } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Assistant" };

export default async function AssistantPage() {
  const [profile, quarter] = await Promise.all([getCurrentProfile(), getActiveQuarter()]);
  const exec = isExec(profile.role);

  if (!quarter) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {profile.name.split(" ")[0]}</h1>
        <Card>
          <CardHeader>
            <CardTitle>No active quarter yet</CardTitle>
            <CardDescription>
              {exec
                ? "Projects and attendance are scoped to a quarter. Create one in Admin first."
                : "An exec needs to set up this quarter before projects and attendance are available."}
            </CardDescription>
          </CardHeader>
          {exec && (
            <div className="px-6 pb-6">
              <Button nativeButton={false} render={<Link href="/portal/admin">Go to Admin</Link>} />
            </div>
          )}
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const cfg = loadAssistantConfig();

  const [myProjects, tasks, attendance, threadRes, usageRes] = await Promise.all([
    getMyProjects(profile.id, quarter.id),
    getVisibleTasks({ assigneeId: profile.id, quarterId: quarter.id }),
    getMyAttendanceSummary(profile.id, quarter.id),
    supabase.from("chat_threads").select("id").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    exec ? supabase.rpc("get_chat_usage_today") : Promise.resolve(null),
  ]);

  let initialMessages: UIMessage[] = [];
  const threadId = threadRes.data?.id ?? null;
  if (threadId) {
    const { data } = await supabase
      .from("chat_messages")
      .select("id, role, parts")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    initialMessages = (data ?? []).map((m) => ({ id: m.id, role: m.role, parts: m.parts }) as UIMessage);
  }

  const stats = computeStats({
    todayIso: getOrgTodayDateString(),
    tasks,
    projectCount: myProjects.length,
    attendanceRate: attendance.rate,
  });
  const globalUsed = usageRes?.data?.[0]?.global_messages ?? 0;

  return (
    <div className="flex h-[calc(100dvh-9rem)] min-h-96 flex-col gap-4">
      <StatsRow stats={stats} execUsage={exec ? { used: globalUsed, cap: cfg.globalDailyCap } : null} />
      <ChatPanel initialThreadId={threadId} initialMessages={initialMessages} />
    </div>
  );
}
