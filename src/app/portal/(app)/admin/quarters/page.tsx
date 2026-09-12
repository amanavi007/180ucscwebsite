import type { Metadata } from "next";
import { getQuarters, getQuarterProjectCounts } from "@/lib/data/quarters";
import { QuartersPanel } from "../quarters-panel";

export const metadata: Metadata = { title: "Admin · Quarters" };

export default async function AdminQuartersPage() {
  const [quarters, projectCounts] = await Promise.all([getQuarters(), getQuarterProjectCounts()]);
  return <QuartersPanel quarters={quarters} projectCounts={projectCounts} />;
}
