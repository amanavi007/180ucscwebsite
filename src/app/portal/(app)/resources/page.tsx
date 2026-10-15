import type { Metadata } from "next";
import { getCurrentProfile } from "@/lib/data/profile";
import { getWikiPages } from "@/lib/data/wiki";
import { isElevatedOrAbove, isExec } from "@/lib/auth/roles";
import type { WikiSection } from "@/lib/supabase/database.types";
import { LinkSwitch } from "@/components/link-switch";
import { PageHeader } from "@/components/page-header";
import { resourceViews } from "@/lib/resource-views";
import { ResourcesView } from "./resources-view";

export const metadata: Metadata = { title: "Resources" };

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; page?: string }>;
}) {
  const params = await searchParams;
  const profile = await getCurrentProfile();
  const canViewPm = isElevatedOrAbove(profile.role);

  const section: WikiSection = params.section === "pm" && canViewPm ? "pm" : "consultant";
  const pages = await getWikiPages(section);

  return (
    <div className="space-y-6">
      <PageHeader title="Resources" description="Guides and reference material for the chapter.">
        <LinkSwitch
          className="mt-4"
          label="Resources views"
          items={resourceViews("wiki")}
        />
      </PageHeader>

      <ResourcesView
        section={section}
        pages={pages}
        canViewPm={canViewPm}
        canEdit={isExec(profile.role)}
        selectedSlug={params.page ?? null}
      />
    </div>
  );
}
