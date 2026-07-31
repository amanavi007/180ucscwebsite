import { getCurrentProfile } from "@/lib/data/profile";
import { getMyNotifications } from "@/lib/data/notifications";
import { AppShell } from "@/components/layout/app-shell";
import { isExec } from "@/lib/auth/roles";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  const exec = isExec(profile.role);
  const notifications = await getMyNotifications(profile.id, exec);

  return (
    <AppShell
      name={profile.name}
      role={profile.role}
      isExec={exec}
      notifications={notifications}
      showOnboarding={profile.onboarding_completed_at === null}
    >
      {children}
    </AppShell>
  );
}
