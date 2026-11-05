"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FilterChip } from "@/components/filter-chip";
import { DISCOVERY_STAGES, isDiscoveryStage, STAGE_FILTERS } from "@/lib/outreach/view";

/** The one row of stages across Companies, left to right from found to finished. Choosing one clears the page and any open panel. */
const ORDER = ["needs-you", "found", "drafted", "scheduled", "sent", "replied", "booked", "finished", "skipped", "trash", "all"];
const LABELS: Record<string, string> = Object.fromEntries([...STAGE_FILTERS, ...DISCOVERY_STAGES].map((s) => [s.key, s.label]));

export function StageBar({ stage, counts }: { stage: string; counts: Record<string, number> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function choose(key: string) {
    const next = new URLSearchParams(params.toString());
    next.set("stage", key);
    for (const k of ["page", "prospect", "candidate", "q"]) next.delete(k);
    const url = `${pathname}?${next.toString()}`;
    // Found and Skipped need their list from the server. Every other stage is already in the page, so only the address changes.
    if (isDiscoveryStage(key)) router.replace(url, { scroll: false });
    else window.history.replaceState(null, "", url);
  }

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by stage">
      {ORDER.map((key) => (
        <FilterChip key={key} selected={stage === key} onClick={() => choose(key)} count={counts[key] ?? 0}>
          {LABELS[key]}
        </FilterChip>
      ))}
    </div>
  );
}
