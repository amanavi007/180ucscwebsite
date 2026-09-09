import { getCurrentProfile } from "@/lib/data/profile";
import { AppShell } from "@/components/layout/app-shell";
import { isExec } from "@/lib/auth/roles";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  const exec = isExec(profile.role);

  return (
    <AppShell
      name={profile.name}
      role={profile.role}
      isExec={exec}
      showOnboarding={profile.onboarding_completed_at === null}
    >
      {children}
    </AppShell>
  );
}
