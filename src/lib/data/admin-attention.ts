import "server-only";
import { getConsultantStatsRollup } from "@/lib/data/consultant-stats";
import { getAttendanceAlertThreshold } from "@/lib/data/org-settings";
import { getPlansForQuarter } from "@/lib/data/team-builder";
import { getPendingTeamSubmissionCount } from "@/lib/data/team-page";
import {
  buildAttentionItems,
  countBelowThreshold,
  hasUnfinalizedDraft,
  type AttentionItem,
} from "@/lib/admin-attention";

function valueOrNull<T>(result: PromiseSettledResult<T>): T | null {
  if (result.status === "fulfilled") return result.value;
  console.error("Admin attention source failed:", result.reason);
  return null;
}

/**
 * Each source is fetched independently: if one fails it is dropped (and logged)
 * instead of breaking the hub.
 */
export async function getAdminAttentionItems(quarterId: string | null): Promise<AttentionItem[]> {
  const [stats, plans, pending] = await Promise.allSettled([
    quarterId
      ? Promise.all([getConsultantStatsRollup(quarterId), getAttendanceAlertThreshold(true)])
      : Promise.resolve(null),
    quarterId ? getPlansForQuarter(quarterId) : Promise.resolve(null),
    getPendingTeamSubmissionCount(),
  ]);

  const statsValue = valueOrNull(stats);
  const plansValue = valueOrNull(plans);

  return buildAttentionItems({
    quarterId,
    lowAttendance: statsValue ? countBelowThreshold(statsValue[0], statsValue[1]) : null,
    draftUnfinalized: plansValue ? hasUnfinalizedDraft(plansValue) : null,
    pendingTeamSubmissions: valueOrNull(pending),
  });
}
