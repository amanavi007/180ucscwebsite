import "server-only";
import { getConsultantStatsRollup } from "@/lib/data/consultant-stats";
import { getAttendanceAlertThreshold } from "@/lib/data/org-settings";
import { getPlansForQuarter } from "@/lib/data/team-builder";
import { getPendingTeamSubmissionCount } from "@/lib/data/team-page";
import { getOutreachAttentionCounts } from "@/lib/data/outreach";
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
export async function getAdminAttentionItems(
  quarterId: string | null,
  /** Recruiting numbers the page has already fetched, so they are not fetched twice. */
  recruiting: { bookingsToMark?: number | null; applicantsWithoutReviewer?: number | null; interviewSlotShortfall?: number | null } = {},
): Promise<AttentionItem[]> {
  const [stats, plans, pending, outreach] = await Promise.allSettled([
    quarterId
      ? Promise.all([getConsultantStatsRollup(quarterId), getAttendanceAlertThreshold(true)])
      : Promise.resolve(null),
    quarterId ? getPlansForQuarter(quarterId) : Promise.resolve(null),
    getPendingTeamSubmissionCount(),
    getOutreachAttentionCounts(),
  ]);

  const statsValue = valueOrNull(stats);
  const plansValue = valueOrNull(plans);
  const outreachValue = valueOrNull(outreach);

  return buildAttentionItems({
    quarterId,
    lowAttendance: statsValue ? countBelowThreshold(statsValue[0], statsValue[1]) : null,
    draftUnfinalized: plansValue ? hasUnfinalizedDraft(plansValue) : null,
    pendingTeamSubmissions: valueOrNull(pending),
    outreachReplies: outreachValue?.replies ?? null,
    outreachNeedsAttention: outreachValue?.needsAttention ?? null,
    ...recruiting,
  });
}
