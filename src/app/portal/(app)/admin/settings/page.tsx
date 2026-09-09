import type { Metadata } from "next";
import { getAttendanceAlertThreshold, getDefaultBulkPassword } from "@/lib/data/org-settings";
import { SettingsPanel } from "../settings-panel";

export const metadata: Metadata = { title: "Admin · Settings" };

export default async function AdminSettingsPage() {
  const [attendanceThreshold, defaultPassword] = await Promise.all([
    getAttendanceAlertThreshold(true),
    getDefaultBulkPassword(),
  ]);
  return <SettingsPanel attendanceThreshold={attendanceThreshold} defaultPassword={defaultPassword} />;
}
