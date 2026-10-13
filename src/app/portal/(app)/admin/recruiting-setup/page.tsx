import type { Metadata } from "next";
import { getQuarters } from "@/lib/data/quarters";
import { defaultQuarterId, resolveQuarterId } from "@/lib/admin-nav";
import { getRecruitCategories, getRecruitEvents } from "@/lib/data/recruit";
import { getCurrentProfile } from "@/lib/data/profile";
import { getScoringBundle } from "@/lib/data/recruit-scoring";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { SetupView } from "../applicants/setup-view";

export const metadata: Metadata = { title: "Admin · Recruiting setup" };

export default async function RecruitingSetupPage({ searchParams }: { searchParams: Promise<{ quarter?: string }> }) {
  const [{ quarter }, quarters] = await Promise.all([searchParams, getQuarters()]);
  const quarterId = resolveQuarterId(quarter, quarters, defaultQuarterId(quarters));

  if (!quarterId) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="font-medium">There&apos;s no quarter yet</p>
          <p className="text-sm text-muted-foreground">Recruiting setup belongs to a quarter. Add one under Setup, then come back.</p>
        </CardContent>
      </Card>
    );
  }

  const profile = await getCurrentProfile();
  const [categories, events, scoring] = await Promise.all([
    getRecruitCategories(),
    getRecruitEvents(quarterId),
    getScoringBundle(quarterId, profile.id),
  ]);
  const quarterName = quarters.find((q) => q.id === quarterId)?.name ?? "This quarter";

  return (
    <div className="space-y-2">
      <PageHeader
        title="Recruiting setup"
        description={`${quarterName} · point categories, events, scoring rubrics and review rules.`}
      />
      <SetupView
        quarterId={quarterId}
        categories={categories}
        events={events}
        rubrics={{ resume: scoring.stages.resume.rubric, interview: scoring.stages.interview.rubric }}
        settings={scoring.settings}
        reviewSetup={scoring.reviewSetup}
      />
    </div>
  );
}
