import type { Metadata } from "next";
import { getTeamPageAdminRows } from "@/lib/data/team-page";
import { TeamPagePanel } from "./team-page-panel";

export const metadata: Metadata = { title: "Admin · Team Page" };

export default async function AdminTeamPagePage() {
  const rows = await getTeamPageAdminRows();
  return <TeamPagePanel rows={rows} />;
}
