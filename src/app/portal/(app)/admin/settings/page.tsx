import type { Metadata } from "next";
import { getAttendanceAlertThreshold, getDefaultBulkPassword } from "@/lib/data/org-settings";
import { PageHeader } from "@/components/page-header";
import { SettingsPanel } from "../settings-panel";

export const metadata: Metadata = { title: "Admin · Settings" };

export default async function AdminSettingsPage() {
  const [attendanceThreshold, defaultPassword] = await Promise.all([
    getAttendanceAlertThreshold(true),
    getDefaultBulkPassword(),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Alerts and defaults for the whole chapter." />
      <SettingsPanel attendanceThreshold={attendanceThreshold} defaultPassword={defaultPassword} />
    </div>
  );
}
