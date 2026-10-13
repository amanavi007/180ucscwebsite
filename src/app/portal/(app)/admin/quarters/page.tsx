import type { Metadata } from "next";
import { getQuarters, getQuarterProjectCounts } from "@/lib/data/quarters";
import { PageHeader } from "@/components/page-header";
import { QuartersPanel } from "../quarters-panel";

export const metadata: Metadata = { title: "Admin · Quarters" };

export default async function AdminQuartersPage() {
  const [quarters, projectCounts] = await Promise.all([getQuarters(), getQuarterProjectCounts()]);
  return (
    <div className="space-y-6">
      <PageHeader title="Quarters" description="Projects and attendance are scoped to a quarter. Start a new one when teams roll over." />
      <QuartersPanel quarters={quarters} projectCounts={projectCounts} />
    </div>
  );
}
