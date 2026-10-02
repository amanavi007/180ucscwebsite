import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { getPendingTeamSubmissionCount } from "@/lib/data/team-page";
import { AdminNav } from "./admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) {
    redirect("/portal");
  }
  const pendingTeamCount = await getPendingTeamSubmissionCount();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Manage quarters, member accounts, team rosters, and org-wide settings.
        </p>
      </div>
      <AdminNav pendingTeamCount={pendingTeamCount} />
      {children}
    </div>
  );
}
