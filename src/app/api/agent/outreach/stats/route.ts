import { auditStats } from "@/lib/data/outreach-agent-audit";
import { agentRoute } from "@/lib/outreach/agent-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Counts the audit can plan against: candidates by outcome and prospects by status, as actually stored. */
export async function GET(request: Request) {
  return agentRoute(request, "outreach:audit", async ({ admin }) => Response.json(await auditStats(admin)));
}
