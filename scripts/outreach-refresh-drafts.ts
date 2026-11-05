/**
 * Sends any unsent draft that fails the current writing rules back for rewriting, then drafts. Never sends email.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env.local scripts/outreach-refresh-drafts.ts
 */
import { buildPrepareDeps } from "@/lib/data/outreach";
import { runPrepare } from "@/lib/outreach/runner";

async function main() {
  console.log(await runPrepare(await buildPrepareDeps()));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
