import { buildFactsDeps } from "@/lib/data/outreach-agent-audit";
import { addFacts, isUuid } from "@/lib/outreach/agent-audit";
import { agentRoute, readJson } from "@/lib/outreach/agent-route";

export const dynamic = "force-dynamic";

/** Adds sourced facts to a ready or added company, where the next draft will read them. Never touches the email or outcome. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return agentRoute(request, "outreach:audit", async ({ admin, keyId }) => {
    const { id } = await params;
    if (!isUuid(id)) return Response.json({ error: "not_found" }, { status: 404 });
    const result = await addFacts(id, await readJson(request), buildFactsDeps(admin, keyId));
    return Response.json(result.body, { status: result.status });
  });
}
