import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { getQuarters } from "@/lib/data/quarters";
import { getAllProfiles } from "@/lib/data/members";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuartersPanel } from "./quarters-panel";
import { MembersPanel } from "./members-panel";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) {
    redirect("/");
  }

  const [quarters, members] = await Promise.all([getQuarters(), getAllProfiles()]);

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Manage quarters, member accounts, and org-wide settings.
        </p>
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="quarters">Quarters</TabsTrigger>
        </TabsList>
        <TabsContent value="members">
          <MembersPanel members={members} />
        </TabsContent>
        <TabsContent value="quarters">
          <QuartersPanel quarters={quarters} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
