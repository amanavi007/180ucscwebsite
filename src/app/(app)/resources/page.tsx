import { getCurrentProfile } from "@/lib/data/profile";
import { getWikiPages } from "@/lib/data/wiki";
import { isElevatedOrAbove, isExec } from "@/lib/auth/roles";
import type { WikiSection } from "@/lib/supabase/database.types";
import { ResourcesView } from "./resources-view";

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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Resources</h1>
        <p className="text-sm text-muted-foreground">
          Guides and reference material for the chapter.
        </p>
      </div>

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
