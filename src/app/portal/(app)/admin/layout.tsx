import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { getPendingTeamSubmissionCount } from "@/lib/data/team-page";
import { getQuarters } from "@/lib/data/quarters";
import { defaultQuarterId } from "@/lib/admin-nav";
import { AdminBreadcrumb } from "./admin-breadcrumb";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) {
    redirect("/portal");
  }
  const [pendingTeamCount, quarters] = await Promise.all([
    // A failing count must not take down every admin page.
    getPendingTeamSubmissionCount().catch(() => 0),
    getQuarters(),
  ]);
  return (
    <div className="space-y-6">
      <AdminBreadcrumb
        pendingTeamCount={pendingTeamCount}
        quarters={quarters.map((q) => ({ id: q.id, name: q.name, is_active: q.is_active }))}
        defaultQuarterId={defaultQuarterId(quarters)}
      />
      {children}
    </div>
  );
}
