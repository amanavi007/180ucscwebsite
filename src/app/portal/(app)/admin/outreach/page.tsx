import type { Metadata } from "next";
import { getOutreachOverview } from "@/lib/data/outreach";
import { PageHeader } from "@/components/page-header";
import { OutreachWorkspace } from "./outreach-workspace";

export const metadata: Metadata = { title: "Admin · Outreach" };

// Replies, bounces and sends change this all day.
export const dynamic = "force-dynamic";

export default async function AdminOutreachPage() {
  let overview;
  try {
    overview = await getOutreachOverview();
  } catch (error) {
    console.error("Outreach overview failed:", error);
    return (
      <div className="space-y-6">
        <PageHeader title="Outreach" description="Prospects, emails and replies in one place." />
        <p className="rounded-[22px] border bg-card p-6 text-muted-foreground">
          The outreach list didn&apos;t load. Refresh the page. If it keeps happening, the outreach database tables may not be set up yet (see docs/outreach-setup.md).
        </p>
      </div>
    );
  }
  return <OutreachWorkspace overview={overview} />;
}
