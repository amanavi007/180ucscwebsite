import type { Metadata } from "next";
import { getQuarters } from "@/lib/data/quarters";
import { getAdminAttentionItems } from "@/lib/data/admin-attention";
import { resolveQuarterId } from "@/lib/admin-nav";
import { HubHeader } from "./hub/hub-header";
import { AttentionList } from "./hub/attention-list";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminHubPage({
  searchParams,
}: {
  searchParams: Promise<{ quarter?: string }>;
}) {
  const { quarter } = await searchParams;
  const quarters = await getQuarters();
  const fallback = (quarters.find((q) => q.is_active) ?? quarters[0])?.id ?? null;
  const selectedId = resolveQuarterId(quarter, quarters, fallback);
  const selected = quarters.find((q) => q.id === selectedId) ?? null;

  const items = await getAdminAttentionItems(selectedId);

  return (
    <div className="space-y-8">
      <HubHeader
        quarters={quarters.map((q) => ({ id: q.id, name: q.name, is_active: q.is_active }))}
        selectedId={selectedId}
        subtitle={selected ? selected.name : "No quarter yet. Create one in Quarters."}
      />
      <AttentionList items={items} />
    </div>
  );
}
