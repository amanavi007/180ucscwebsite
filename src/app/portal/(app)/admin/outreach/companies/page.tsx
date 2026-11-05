import type { Metadata } from "next";
import { getOutreachOverview } from "@/lib/data/outreach";
import { getDiscoveryOverview, type DiscoveryOverview } from "@/lib/data/outreach-discovery";
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
    overview = await getOutreachOverview();
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
  const stage = sp.stage ? normalizeStage(sp.stage) : filterByStage(overview.prospects, "needs-you").length > 0 ? "needs-you" : "all";

  // Discovery's tables may be missing or slow: the prospect list must still open, so a failure just empties those two chips.
  let discovery: DiscoveryOverview | null = null;
  try {
    discovery = isDiscoveryStage(stage)
      ? await getDiscoveryOverview({ filter: stage === "found" ? "ready" : "skipped", page: sp.page, size: sp.size, q: sp.q, candidate: sp.candidate })
      : await getDiscoveryOverview({ filter: "ready", size: "50" });
  } catch (error) {
    console.error("Discovery overview failed:", error);
  }
  const counts = companyStageCounts(overview.prospects, discovery?.counts ?? {});
  return <CompaniesWorkspace overview={overview} discovery={isDiscoveryStage(stage) ? discovery : null} stage={stage} counts={counts} />;
}
