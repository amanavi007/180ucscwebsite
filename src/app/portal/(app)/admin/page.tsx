import type { Metadata } from "next";
import { getQuarters } from "@/lib/data/quarters";
import { getAdminAttentionItems } from "@/lib/data/admin-attention";
import { getAttendanceData } from "@/lib/data/recruit-import";
import { getScoringBundle } from "@/lib/data/recruit-scoring";
import { getInterviewSlots, getInvitees } from "@/lib/data/interview";
import { getCurrentProfile } from "@/lib/data/profile";
import { getMeetingDatesForQuarter } from "@/lib/data/meeting-dates";
import { defaultQuarterId, resolveQuarterId } from "@/lib/admin-nav";
import { AttentionList } from "./hub/attention-list";
import { QuickActions } from "./hub/quick-actions";
import { PipelineTiles } from "./hub/pipeline-tiles";
import { ComingUp } from "./hub/coming-up";

export const metadata: Metadata = { title: "Today" };

export default async function AdminHubPage({
  searchParams,
}: {
  searchParams: Promise<{ quarter?: string }>;
}) {
  const { quarter } = await searchParams;
  const quarters = await getQuarters();
  const selectedId = resolveQuarterId(quarter, quarters, defaultQuarterId(quarters));
  const selected = quarters.find((q) => q.id === selectedId) ?? null;

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const profile = await getCurrentProfile();

  // Each source is optional: a failing one is left out instead of breaking the page.
  const [attendance, scoring, invitees, slots, dates] = await Promise.all([
    selectedId ? getAttendanceData(selectedId).catch(() => null) : Promise.resolve(null),
    selectedId ? getScoringBundle(selectedId, profile.id).catch(() => null) : Promise.resolve(null),
    getInvitees().catch(() => null),
    getInterviewSlots().catch(() => null),
    selectedId ? getMeetingDatesForQuarter(selectedId).catch(() => []) : Promise.resolve([] as string[]),
  ]);

  const waiting = invitees ? invitees.filter((i) => !i.booking).length : null;
  const openSlots = slots ? slots.filter((s) => s.published && s.bookingStatus === "open" && s.date >= today).length : null;
  const items = await getAdminAttentionItems(selectedId, {
    bookingsToMark: attendance ? attendance.toMark.length : null,
    applicantsWithoutReviewer: scoring ? scoring.dashboard.totals.unassigned : null,
    interviewSlotShortfall: waiting !== null && openSlots !== null ? Math.max(0, waiting - openSlots) : null,
  });

  const upcoming = dates.filter((d) => d >= today).slice(0, 4);
  const totals = scoring?.dashboard.totals ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl leading-tight">Today</h1>
        <p className="mt-1.5 text-base text-muted-foreground">
          {selected ? selected.name : "No quarter yet. Create one in Setup."}
          {items.length > 0 ? ` · ${items.length} ${items.length === 1 ? "thing needs" : "things need"} you` : ""}
        </p>
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <AttentionList items={items} />
          {totals && totals.applicants > 0 && (
            <PipelineTiles
              quarterId={selectedId}
              complete={totals.complete}
              inProgress={Math.max(0, totals.applicants - totals.complete - totals.unassigned)}
              applicants={totals.applicants}
              unassigned={totals.unassigned}
            />
          )}
          <QuickActions quarterId={selectedId} />
        </div>
        <ComingUp dates={upcoming} />
      </div>
    </div>
  );
}
