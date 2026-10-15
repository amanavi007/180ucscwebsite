import type { Metadata } from "next";
import { getCurrentProfile } from "@/lib/data/profile";
import { getQuickLinks } from "@/lib/data/quick-links";
import { isExec } from "@/lib/auth/roles";
import { LinkSwitch } from "@/components/link-switch";
import { PageHeader } from "@/components/page-header";
import { resourceViews } from "@/lib/resource-views";
import { QuickLinksView } from "./quick-links-view";

export const metadata: Metadata = { title: "Quick Links" };

export default async function QuickLinksPage() {
  const profile = await getCurrentProfile();
  const links = await getQuickLinks();

  return (
    <div className="space-y-6">
      <PageHeader title="Quick links" description="Fast access to shared docs, Drive folders, and other outside resources.">
        <LinkSwitch
          className="mt-4"
          label="Resources views"
          items={resourceViews("links")}
        />
      </PageHeader>

      <QuickLinksView links={links} canEdit={isExec(profile.role)} />
    </div>
  );
}
