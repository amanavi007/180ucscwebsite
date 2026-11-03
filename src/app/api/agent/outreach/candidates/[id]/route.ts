import { buildCorrectionDeps } from "@/lib/data/outreach-agent-audit";
import { correctWebsite, isUuid } from "@/lib/outreach/agent-audit";
import { agentRoute, readJson } from "@/lib/outreach/agent-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Corrects the website of a company that moved. Needs a page that mentions the company as evidence; every change is logged. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return agentRoute(request, "outreach:audit", async ({ admin, keyId }) => {
    const { id } = await params;
    if (!isUuid(id)) return Response.json({ error: "not_found" }, { status: 404 });
    const result = await correctWebsite(id, await readJson(request), buildCorrectionDeps(admin, keyId));
    return Response.json(result.body, { status: result.status });
  });
}
