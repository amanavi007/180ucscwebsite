import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { getPendingTeamSubmissionCount } from "@/lib/data/team-page";
import { getQuarters } from "@/lib/data/quarters";
import { AdminBreadcrumb } from "./admin-breadcrumb";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) {
    redirect("/portal");
  }
  const [pendingTeamCount, quarters] = await Promise.all([
    getPendingTeamSubmissionCount(),
    getQuarters(),
  ]);
  const defaultQuarter = quarters.find((q) => q.is_active) ?? quarters[0] ?? null;

  return (
    <div className="space-y-6">
      <AdminBreadcrumb
        pendingTeamCount={pendingTeamCount}
        quarters={quarters.map((q) => ({ id: q.id, name: q.name, is_active: q.is_active }))}
        defaultQuarterId={defaultQuarter?.id ?? null}
      />
      {children}
    </div>
  );
}
