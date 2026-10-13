import type { Metadata } from "next";
import { getTeamPageAdminRows } from "@/lib/data/team-page";
import { PageHeader } from "@/components/page-header";
import { TeamPagePanel } from "./team-page-panel";

export const metadata: Metadata = { title: "Admin · Team Page" };

export default async function AdminTeamPagePage() {
  const rows = await getTeamPageAdminRows();
  return (
    <div className="space-y-6">
      <PageHeader title="People" description="Photos and bios members send in for the public team page. Approve what should go live." />
      <TeamPagePanel rows={rows} />
    </div>
  );
}
