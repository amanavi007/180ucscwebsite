import type { Metadata } from "next";
import { getCurrentProfile } from "@/lib/data/profile";
import { getCurrentRubric, listReviews } from "@/lib/data/prelim-review";
import { getMyProjects, getProjects } from "@/lib/data/projects";
import { getActiveQuarter } from "@/lib/data/quarters";
import { isExec } from "@/lib/auth/roles";
import { LinkSwitch } from "@/components/link-switch";
import { PageHeader } from "@/components/page-header";
import { resourceViews } from "@/lib/resource-views";
import { ReviewTab } from "./review-tab";

export const metadata: Metadata = { title: "Prelim review" };

export default async function PrelimReviewPage() {
  const [profile, quarter] = await Promise.all([getCurrentProfile(), getActiveQuarter()]);
  const [projects, reviews, docRubric, slidesRubric] = await Promise.all([
    !quarter ? Promise.resolve([]) : isExec(profile.role) ? getProjects(quarter.id) : getMyProjects(profile.id, quarter.id),
    listReviews(),
    getCurrentRubric("doc"),
    getCurrentRubric("slides"),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Prelim review" description="Check your research doc or slides against the chapter's rules before the prelim check.">
        <LinkSwitch className="mt-4" label="Resources views" items={resourceViews("prelim")} />
      </PageHeader>

      <ReviewTab
        projects={projects.map((p) => ({ id: p.id, name: p.client_name }))}
        reviews={reviews}
        rubrics={{ doc: docRubric, slides: slidesRubric }}
      />
    </div>
  );
}
