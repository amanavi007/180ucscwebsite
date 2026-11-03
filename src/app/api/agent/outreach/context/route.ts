import { buildAgentContext } from "@/lib/data/outreach-agent";
import { agentRoute } from "@/lib/outreach/agent-route";

export const dynamic = "force-dynamic";

/**
 * Everything one research run needs: the targets, today's quota and the lists of companies and addresses to skip.
 * Those lists are the club's own prospect, do-not-contact and past-client lists; they are returned on purpose, only to
 * the club's own authenticated agent, so it can skip a company before spending research effort on it.
 */
export async function GET(request: Request) {
  return agentRoute(request, "outreach:read", async ({ admin }) => Response.json(await buildAgentContext(admin)));
}
