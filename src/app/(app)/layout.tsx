import { getCurrentProfile } from "@/lib/data/profile";
import { AppShell } from "@/components/layout/app-shell";
import { isExec } from "@/lib/auth/roles";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  return (
    <AppShell name={profile.name} role={profile.role} isExec={isExec(profile.role)}>
      {children}
    </AppShell>
  );
}
