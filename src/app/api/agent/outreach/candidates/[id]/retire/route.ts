import { buildRetireDeps } from "@/lib/data/outreach-agent-correct";
import { retireCandidate } from "@/lib/outreach/agent-correct";
import { isUuid } from "@/lib/outreach/agent-audit";
import { agentRoute, readJson } from "@/lib/outreach/agent-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Retires a company that should not be worked: terminal, out of tasks and promotion. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return agentRoute(request, "outreach:correct", async ({ admin, keyId }) => {
    const { id } = await params;
    if (!isUuid(id)) return Response.json({ error: "not_found" }, { status: 404 });
    const result = await retireCandidate(id, await readJson(request), buildRetireDeps(admin, keyId));
    return Response.json(result.body, { status: result.status });
  });
}
