import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/data/profile";
import { AppShell } from "@/components/layout/app-shell";
import { isExec, ELEVATED_ROLES } from "@/lib/auth/roles";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  // Proxy only does fast JWT checks; this DB-backed gate lives here instead,
  // reusing the profile row `getCurrentProfile()` already fetched.
  if (profile.must_reset_password) {
    redirect("/portal/force-password-reset");
  }

  const exec = isExec(profile.role);

  return (
    <AppShell
      name={profile.name}
      role={profile.role}
      isExec={exec}
      showOnboarding={profile.onboarding_completed_at === null}
      showAttendanceNotice={ELEVATED_ROLES.includes(profile.role) && profile.attendance_notice_seen_at === null}
    >
      {children}
    </AppShell>
  );
}
