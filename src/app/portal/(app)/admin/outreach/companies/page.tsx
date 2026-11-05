import type { Metadata } from "next";
import { getCompaniesOverview } from "@/lib/data/outreach";
import { getDiscoveryCounts, getDiscoveryOverview, type DiscoveryOverview } from "@/lib/data/outreach-discovery";
import { PageHeader } from "@/components/page-header";
import { companyStageCounts, filterByStage, isDiscoveryStage, normalizeStage } from "@/lib/outreach/view";
import { CompaniesWorkspace } from "./companies-workspace";

export const metadata: Metadata = { title: "Admin · Outreach Companies" };

// Replies, bounces and sends change this all day.
export const dynamic = "force-dynamic";
// "Find companies now" and "Add companies" read a few dozen websites in one request.
export const maxDuration = 60;

export default async function OutreachCompaniesPage({ searchParams }: { searchParams: Promise<{ stage?: string; page?: string; size?: string; q?: string; candidate?: string }> }) {
  const sp = await searchParams;
  let overview;
  try {
    overview = await getCompaniesOverview();
  } catch (error) {
    console.error("Outreach overview failed:", error);
    return (
      <div className="space-y-6">
        <PageHeader title="Companies" description="Every company, from found to booked." />
        <p className="rounded-[22px] border bg-card p-6 text-muted-foreground">
          The company list didn&apos;t load. Refresh the page. If it keeps happening, the outreach database tables may not be set up yet (see docs/outreach-setup.md).
        </p>
      </div>
    );
  }

  // With no stage in the address, open on Needs you, or on All when nothing needs a person.
  const defaultStage = filterByStage(overview.prospects, "needs-you").length > 0 ? "needs-you" : "all";
  const stage = sp.stage ? normalizeStage(sp.stage) : defaultStage;

  // Discovery's tables may be missing or slow: the prospect list must still open, so a failure just empties those two chips.
  // Other stages only need the two chip counts, so they skip the candidate list and its summary queries.
  let discovery: DiscoveryOverview | null = null;
  let discoveryCounts: Record<string, number> = {};
  try {
    if (isDiscoveryStage(stage)) {
      discovery = await getDiscoveryOverview({ filter: stage === "found" ? "ready" : "skipped", page: sp.page, size: sp.size, q: sp.q, candidate: sp.candidate });
      discoveryCounts = discovery.counts;
    } else {
      discoveryCounts = await getDiscoveryCounts();
    }
  } catch (error) {
    console.error("Discovery overview failed:", error);
  }
  const counts = companyStageCounts(overview.prospects, discoveryCounts);
  return <CompaniesWorkspace overview={overview} discovery={discovery} defaultStage={defaultStage} counts={counts} />;
}
