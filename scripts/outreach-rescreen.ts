/**
 * One-time re-screen of stored contacts against the junk / role inbox blocklist. Dry run unless --apply is given.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env.local scripts/outreach-rescreen.ts [--apply]
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRescreen, planStoredRescreen } from "@/lib/data/outreach-agent-correct";

async function main() {
  const admin = createAdminClient();
  const plan = await planStoredRescreen(admin);
  console.log(`Prospects to invalidate (${plan.prospects.length}):`);
  for (const p of plan.prospects) console.log(`  ${p.company} <${p.email}> [${p.status}]`);
  console.log(`Ready candidates to drop to no_email (${plan.candidates.length}):`);
  for (const c of plan.candidates) console.log(`  ${c.company} <${c.email}>`);
  console.log(`Matching but already sent/answered, left alone (${plan.engaged.length}):`);
  for (const p of plan.engaged) console.log(`  ${p.company} <${p.email}> [${p.status}]`);
  if (!process.argv.includes("--apply")) return console.log("\nDry run. Re-run with --apply to write.");
  await applyRescreen(admin, plan);
  console.log("\nApplied.");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
