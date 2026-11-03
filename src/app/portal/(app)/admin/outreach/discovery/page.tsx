import type { Metadata } from "next";
import { getDiscoveryOverview } from "@/lib/data/outreach-discovery";
import { PageHeader } from "@/components/page-header";
import { DiscoveryWorkspace } from "./discovery-workspace";

export const metadata: Metadata = { title: "Admin · Outreach Discovery" };

// What discovery finds changes every morning.
export const dynamic = "force-dynamic";
// "Find companies now" and "Add companies" read a few dozen websites in one request.
export const maxDuration = 60;

export default async function OutreachDiscoveryPage({ searchParams }: { searchParams: Promise<{ outcome?: string }> }) {
  const { outcome } = await searchParams;
  let overview;
  try {
    overview = await getDiscoveryOverview(outcome ?? "all");
  } catch (error) {
    console.error("Discovery overview failed:", error);
    return (
      <div className="space-y-6">
        <PageHeader title="Discovery" description="Companies found automatically, and why some were skipped." />
        <p className="rounded-[22px] border bg-card p-6 text-muted-foreground">
          The discovery list didn&apos;t load. Refresh the page. If it keeps happening, the discovery table may not be set up yet: run the latest database migrations (20261103000001 and 20261103000002).
        </p>
      </div>
    );
  }
  return <DiscoveryWorkspace overview={overview} />;
}
