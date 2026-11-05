/**
 * Sends any unsent draft that fails the current writing rules back for rewriting, then writes emails for verified
 * prospects, a few at a time, for as many rounds as asked (default 1). Never sends email.
 *
 *   NEXT_PUBLIC_SITE_URL=https://www.ucsc180dc.org NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env.local scripts/outreach-refresh-drafts.ts [rounds]
 */
import { buildPrepareDeps } from "@/lib/data/outreach";
import { runPrepare } from "@/lib/outreach/runner";

async function main() {
  const rounds = Number(process.argv[2] ?? 1);
  for (let i = 0; i < rounds; i++) {
    console.log(`round ${i + 1}`, await runPrepare({ ...(await buildPrepareDeps()), budgetMs: 240_000 }));
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
