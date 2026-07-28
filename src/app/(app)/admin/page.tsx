import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { getQuarters } from "@/lib/data/quarters";
import { QuartersPanel } from "./quarters-panel";

export default async function AdminPage() {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) {
    redirect("/");
  }

  const quarters = await getQuarters();

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Manage quarters, member accounts, and org-wide settings.
        </p>
      </div>

      <QuartersPanel quarters={quarters} />
    </div>
  );
}
