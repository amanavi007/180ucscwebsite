import type { Metadata } from "next";
import { getAttendanceAlertThreshold, getDefaultBulkPassword, getResearchPrompts } from "@/lib/data/org-settings";
import { getOnboardingThresholds } from "@/lib/data/onboarding";
import { PageHeader } from "@/components/page-header";
import { SettingsPanel } from "../settings-panel";

export const metadata: Metadata = { title: "Admin · Settings" };

export default async function AdminSettingsPage() {
  const [attendanceThreshold, defaultPassword, researchPrompts, onboardingThresholds] = await Promise.all([
    getAttendanceAlertThreshold(true),
    getDefaultBulkPassword(),
    getResearchPrompts(),
    getOnboardingThresholds(),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Alerts and defaults for the whole chapter." />
      <SettingsPanel attendanceThreshold={attendanceThreshold} defaultPassword={defaultPassword} researchPrompts={researchPrompts} onboardingThresholds={onboardingThresholds} />
    </div>
  );
}
