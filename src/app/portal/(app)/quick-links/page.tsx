import type { Metadata } from "next";
import { getCurrentProfile } from "@/lib/data/profile";
import { getQuickLinks } from "@/lib/data/quick-links";
import { isExec } from "@/lib/auth/roles";
import { QuickLinksView } from "./quick-links-view";

export const metadata: Metadata = { title: "Quick Links" };

export default async function QuickLinksPage() {
  const profile = await getCurrentProfile();
  const links = await getQuickLinks();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl leading-tight">Quick Links</h1>
        <p className="text-sm text-muted-foreground">
          Fast access to shared docs, Drive folders, and other outside resources.
        </p>
      </div>

      <QuickLinksView links={links} canEdit={isExec(profile.role)} />
    </div>
  );
}
