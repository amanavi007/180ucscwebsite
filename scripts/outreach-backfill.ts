/**
 * Looks at directory companies ahead of time and stores each as "ready" (or why not) in the discovery pool, so the
 * daily job can add them without crawling. Reads only the company's own public pages, obeys robots.txt, and never
 * creates a prospect or sends anything.
 *
 *   NODE_OPTIONS="--conditions=react-server" NEXT_PUBLIC_SITE_URL=https://www.ucsc180dc.org \
 *     npx tsx --env-file=.env.local scripts/outreach-backfill.ts [limit] [concurrency] [maxTeam] [regions, comma separated]
 *
 * Safe to stop and run again: companies already looked at are skipped.
 */
import { buildDiscoveryDeps } from "@/lib/data/outreach-discovery";
import { backfillPool } from "@/lib/outreach/discovery/runner";

async function main() {
  const limit = Number(process.argv[2] ?? 5000);
  const concurrency = Number(process.argv[3] ?? 6);
  // What to stock the pool with; the Settings page still decides what gets added. Defaults to the current settings.
  const maxTeam = process.argv[4] ? Number(process.argv[4]) : undefined;
  const regions = process.argv[5] ? process.argv[5].split(",").map((r) => r.trim()).filter(Boolean) : undefined;

  const deps = await buildDiscoveryDeps();
  const dataset = await deps.loadDataset();
  // The pool is stocked with every industry, so changing the industry setting later still finds companies in it.
  const industries = [...new Set(dataset.flatMap((c) => c.industries ?? []))];
  const started = Date.now();
  console.log(`Backfilling up to ${limit} companies, ${concurrency} at a time. Regions: ${(regions ?? deps.filter.regions).join(", ")}. Team size up to ${maxTeam ?? deps.filter.maxTeamSize}.`);

  const result = await backfillPool(deps, {
    concurrency,
    limit,
    budgetMs: 4 * 60 * 60_000,
    filter: { regions: regions ?? deps.filter.regions, industries, maxTeamSize: maxTeam ?? deps.filter.maxTeamSize },
    onProgress: (done, record) => {
      if (done % 25 === 0) console.log(`${done} done (${Math.round((Date.now() - started) / 1000)}s) last: ${record.company} -> ${record.outcome}`);
    },
  });
  console.log("Finished:", result, `in ${Math.round((Date.now() - started) / 60_000)} minutes`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
