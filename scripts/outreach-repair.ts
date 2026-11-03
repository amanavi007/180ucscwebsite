/**
 * One big repair pass over discovery's problem companies (the daily job does 150 a day).
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env.local scripts/outreach-repair.ts [limit] [concurrency]
 */
import { buildRepairDeps } from "@/lib/data/outreach-discovery";
import { runRepair } from "@/lib/outreach/discovery/repair";

async function main() {
  const limit = Number(process.argv[2] ?? 300);
  const concurrency = Number(process.argv[3] ?? 8);
  const result = await runRepair(await buildRepairDeps(), { limit, concurrency, budgetMs: 25 * 60_000 });
  console.log(result);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
