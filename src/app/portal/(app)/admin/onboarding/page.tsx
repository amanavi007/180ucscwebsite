import type { Metadata } from "next";
import { getQuarters } from "@/lib/data/quarters";
import { getOnboardingData, getOnboardingThresholds } from "@/lib/data/onboarding";
import { defaultQuarterId, resolveQuarterId } from "@/lib/admin-nav";
import { getOrgTodayDateString } from "@/lib/date";
import { OnboardingView } from "./onboarding-view";

export const metadata: Metadata = { title: "Admin · Onboarding" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ quarter?: string }>;
}) {
  const [{ quarter }, quarters] = await Promise.all([searchParams, getQuarters()]);
  const quarterId = resolveQuarterId(quarter, quarters, defaultQuarterId(quarters));
  const selected = quarters.find((q) => q.id === quarterId);
  if (!selected) {
    return <p className="text-sm text-muted-foreground">No quarters yet. Create one in Setup first.</p>;
  }

  const [data, thresholds] = await Promise.all([getOnboardingData(selected.id), getOnboardingThresholds()]);

  return (
    <OnboardingView
      key={selected.id}
      quarterId={selected.id}
      quarterName={selected.name}
      quarterStart={selected.start_date}
      quarterEnd={selected.end_date}
      today={getOrgTodayDateString()}
      data={data}
      thresholds={thresholds}
    />
  );
}
