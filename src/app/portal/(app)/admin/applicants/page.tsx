import type { Metadata } from "next";
import { getQuarters } from "@/lib/data/quarters";
import { defaultQuarterId, resolveQuarterId } from "@/lib/admin-nav";
import {
  getApplicantRows,
  getDismissedPairKeys,
  getRecentMerges,
  getRecruitCategories,
  getRecruitEvents,
} from "@/lib/data/recruit";
import { getAttendanceData } from "@/lib/data/recruit-import";
import { getCurrentProfile } from "@/lib/data/profile";
import { getScoringBundle } from "@/lib/data/recruit-scoring";
import { findDuplicatePairs } from "@/lib/recruit-matching";
import { Card, CardContent } from "@/components/ui/card";
import { ApplicantsWorkspace } from "./applicants-workspace";

export const metadata: Metadata = { title: "Admin · Applicants" };

export default async function ApplicantsPage({ searchParams }: { searchParams: Promise<{ quarter?: string }> }) {
  const [{ quarter }, quarters] = await Promise.all([searchParams, getQuarters()]);
  const quarterId = resolveQuarterId(quarter, quarters, defaultQuarterId(quarters));

  if (!quarterId) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="font-medium">There&apos;s no quarter yet</p>
          <p className="text-sm text-muted-foreground">
            Applicants belong to a quarter. Create one under Admin → Quarters, then come back.
          </p>
        </CardContent>
      </Card>
    );
  }

  const profile = await getCurrentProfile();
  const [rows, categories, events, dismissed, merges, attendance, scoring] = await Promise.all([
    getApplicantRows(quarterId),
    getRecruitCategories(),
    getRecruitEvents(quarterId),
    getDismissedPairKeys(),
    getRecentMerges(quarterId),
    getAttendanceData(quarterId),
    getScoringBundle(quarterId, profile.id),
  ]);
  const pairs = findDuplicatePairs(
    rows.map((r) => ({ id: r.id, name: r.name, email: r.email, aliases: r.aliases })),
    dismissed,
  );
  const quarterName = quarters.find((q) => q.id === quarterId)?.name ?? "This quarter";

  return (
    <ApplicantsWorkspace
      quarterId={quarterId}
      quarterName={quarterName}
      rows={rows}
      categories={categories}
      events={events}
      pairs={pairs}
      merges={merges}
      attendance={attendance}
      scoring={scoring}
    />
  );
}
