import { AnswerCache } from "@/lib/assistant/answer-cache";
import { handleChat, type ChatDeps } from "@/lib/assistant/chat-handler";
import { loadAssistantConfig } from "@/lib/assistant/config";
import { buildModel } from "@/lib/assistant/provider";
import { supabaseThreadStore } from "@/lib/assistant/threads";
import { buildTools } from "@/lib/assistant/tools";
import { realDataAccess } from "@/lib/assistant/tools/data-access";
import { runMyOpenTasks, runUpcomingEvents } from "@/lib/assistant/tools/read-tools";
import { registerExecutors, supabaseProposalStore } from "@/lib/assistant/tools/write-tools";
import { getCurrentProfile } from "@/lib/data/profile";
import { getActiveQuarter } from "@/lib/data/quarters";
import { getOrgTodayDateString } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

registerExecutors();

const cfg = loadAssistantConfig();
const cache = new AnswerCache(cfg.answerCacheTtlMs, 200);

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { messages?: unknown; threadId?: string | null } | null;
  if (!body) return Response.json({ error: "Bad request." }, { status: 400 });

  // Auth: proxy.ts only redirects /portal paths, so the API route must check itself.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.sub) return Response.json({ error: "Please sign in." }, { status: 401 });

  const [profile, quarter] = await Promise.all([getCurrentProfile(), getActiveQuarter()]);
  const store = await supabaseProposalStore();
  const toolDeps = {
    profile: { id: profile.id, name: profile.name, role: profile.role },
    rowCap: cfg.rowCap,
    data: realDataAccess(),
  };

  const deps: ChatDeps = {
    cfg,
    model: buildModel(),
    quota: supabase,
    profile: toolDeps.profile,
    quarter: quarter ? { id: quarter.id, name: quarter.name } : null,
    buildTools: (areas, threadId) => buildTools(areas, toolDeps, { threadId, store }),
    shortcutData: async (s) => {
      const r =
        s === "my_open_tasks"
          ? await runMyOpenTasks(toolDeps)
          : await runUpcomingEvents(toolDeps, getOrgTodayDateString());
      if (r.items.length === 0) return r.note ?? "Nothing to show.";
      const lines = r.items.map((i) => `- ${Object.values(i).filter(Boolean).join(" - ")}`);
      return `${lines.join("\n")}${r.truncated ? `\n\n(Showing ${r.items.length} of ${r.total}.)` : ""}`;
    },
    threads: supabaseThreadStore(supabase, profile.id),
    cache,
    now: () => new Date(),
    log: (line) => console.log("[assistant]", JSON.stringify(line)),
  };

  return handleChat({ messages: body.messages, threadId: body.threadId ?? null }, deps);
}
