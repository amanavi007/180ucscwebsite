import type { Metadata } from "next";
import { getCurrentProfile } from "@/lib/data/profile";
import { getMyTeamProfileRow } from "@/lib/data/team-page";
import { formInitialValues, hasPending } from "@/lib/team-page";
import { isExec, roleLabel } from "@/lib/auth/roles";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RemoveListingButton, TeamProfileForm } from "@/components/team/team-profile-form";

export const metadata: Metadata = { title: "My Profile" };

export default async function MyPublicProfilePage() {
  const profile = await getCurrentProfile();
  const row = await getMyTeamProfileRow(profile.id);
  const listed = !!row?.listed;
  const pending = hasPending(row);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>
        <p className="text-sm text-muted-foreground">
          What appears on the public Our Team page. Your name and title come from your account:{" "}
          <span className="font-medium text-foreground">{profile.name}</span>, {roleLabel(profile.role)}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Team page profile
            {listed && <Badge>Live</Badge>}
            {pending && <Badge variant="secondary">Pending review</Badge>}
            {!listed && !pending && <Badge variant="outline">Not listed</Badge>}
          </CardTitle>
          <CardDescription>
            An exec reviews your first submission and any later changes before they go live.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <TeamProfileForm
            targetId={profile.id}
            mode={isExec(profile.role) ? "exec" : "member"}
            initial={formInitialValues(row, profile.linkedin_url)}
          />
          {listed && (
            <div className="border-t pt-4">
              <RemoveListingButton />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
