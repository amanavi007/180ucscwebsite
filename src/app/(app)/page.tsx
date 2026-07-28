import Link from "next/link";
import { getCurrentProfile } from "@/lib/data/profile";
import { getActiveQuarter } from "@/lib/data/quarters";
import { isExec } from "@/lib/auth/roles";
import { roleLabel } from "@/lib/auth/roles";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  const activeQuarter = await getActiveQuarter();
  const exec = isExec(profile.role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {profile.name.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          {roleLabel(profile.role)}
          {activeQuarter ? ` · ${activeQuarter.name}` : ""}
        </p>
      </div>

      {!activeQuarter && exec && (
        <Card className="border-primary/30 bg-accent">
          <CardHeader>
            <CardTitle>Set up your first quarter</CardTitle>
            <CardDescription>
              No active quarter yet. Projects and attendance are scoped to a
              quarter, so create one before adding projects.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button nativeButton={false} render={<Link href="/admin">Go to Admin</Link>} />
          </CardContent>
        </Card>
      )}

      {!activeQuarter && !exec && (
        <Card>
          <CardHeader>
            <CardTitle>No active quarter yet</CardTitle>
            <CardDescription>
              An exec needs to set up this quarter before projects and
              attendance are available. Check back soon.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {activeQuarter && (
        <Card>
          <CardHeader>
            <CardTitle>You&apos;re all set</CardTitle>
            <CardDescription>
              The dashboard will show your active project, upcoming tasks,
              and (for exec) an org-wide summary once Projects and Tasks are
              built out.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
