import type { Metadata } from "next";
import { getQuarters } from "@/lib/data/quarters";
import { getAdminAttentionItems } from "@/lib/data/admin-attention";
import { getPendingTeamSubmissionCount } from "@/lib/data/team-page";
import { defaultQuarterId, resolveQuarterId } from "@/lib/admin-nav";
import { HubHeader } from "./hub/hub-header";
import { AttentionList } from "./hub/attention-list";
import { QuickActions } from "./hub/quick-actions";
import { AreaCards } from "./hub/area-cards";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminHubPage({
  searchParams,
}: {
  searchParams: Promise<{ quarter?: string }>;
}) {
  const { quarter } = await searchParams;
  const quarters = await getQuarters();
  const selectedId = resolveQuarterId(quarter, quarters, defaultQuarterId(quarters));
  const selected = quarters.find((q) => q.id === selectedId) ?? null;

  const [items, pendingTeamCount] = await Promise.all([
    getAdminAttentionItems(selectedId),
    getPendingTeamSubmissionCount().catch(() => 0),
  ]);

  return (
    <div className="space-y-8">
      <HubHeader
        quarters={quarters.map((q) => ({ id: q.id, name: q.name, is_active: q.is_active }))}
        selectedId={selectedId}
        subtitle={selected ? selected.name : "No quarter yet. Create one in Quarters."}
      />
      <AttentionList items={items} />
      <QuickActions quarterId={selectedId} />
      <AreaCards quarterId={selectedId} pendingTeamCount={pendingTeamCount} />
    </div>
  );
}
