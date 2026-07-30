import type { Metadata } from "next";
import { getQuarters } from "@/lib/data/quarters";
import { QuartersPanel } from "../quarters-panel";

export const metadata: Metadata = { title: "Admin · Quarters" };

export default async function AdminQuartersPage() {
  const quarters = await getQuarters();
  return <QuartersPanel quarters={quarters} />;
}
