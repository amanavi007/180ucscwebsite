import { buildTaskDeps } from "@/lib/data/outreach-agent";
import { submitTaskResult } from "@/lib/outreach/agent";
import { agentRoute, readJson } from "@/lib/outreach/agent-route";

export const dynamic = "force-dynamic";

/** The agent's answer for one leased company: a contact it found, or a coded reason it found none. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return agentRoute(request, "outreach:enrich", async ({ admin }) => {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "not_found" }, { status: 404 });
    const result = await submitTaskResult(id, await readJson(request), await buildTaskDeps(admin));
    return Response.json(result.body, { status: result.status });
  });
}
