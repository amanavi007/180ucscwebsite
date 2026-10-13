import type { Metadata } from "next";
import { getQuarters } from "@/lib/data/quarters";
import { getAdminAttentionItems } from "@/lib/data/admin-attention";
import { getApplicantRows } from "@/lib/data/recruit";
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

  // Each source is optional: a failing one is left out instead of breaking the page.
  const [items, rows, dates] = await Promise.all([
    getAdminAttentionItems(selectedId),
    selectedId ? getApplicantRows(selectedId).catch(() => null) : Promise.resolve(null),
    selectedId ? getMeetingDatesForQuarter(selectedId).catch(() => []) : Promise.resolve([] as string[]),
  ]);

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const upcoming = dates.filter((d) => d >= today).slice(0, 4);
  const applicants = rows ? rows.filter((r) => r.hasApplication).length : 0;
  const withoutApplication = rows ? rows.filter((r) => !r.hasApplication).length : 0;

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
          {rows && <PipelineTiles quarterId={selectedId} applicants={applicants} withoutApplication={withoutApplication} />}
          <QuickActions quarterId={selectedId} />
        </div>
        <ComingUp dates={upcoming} />
      </div>
    </div>
  );
}
